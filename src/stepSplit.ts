// Makes imported instructions fit for cooking mode (issue #62): one step = one action or one waiting time, with a
// short bold title and its duration, e.g. "Kneten (10 Min.)". Rule-based, nothing is invented: a title is only
// taken from a verb the text itself contains, a duration only from a time the text names. When a rule is unsure,
// the step stays as it is (better no title than a wrong one).
// Pure functions without Obsidian, tested in tests/stepSplit.test.ts. Also used by "Fetch again" (issue #63).
// Sentences: src/sentences.ts. Titles, verbs and waiting times: src/stepTitle.ts.
import { closed, looksEnglish, splitEnumeration, splitSentences, upper, words } from "./sentences";
import { SUBORDINATE, clausesOf, isAction, titleFor, waitOf, withDuration } from "./stepTitle";
import { findTimes } from "./cooking";

export interface RawStep {
  title?: string;
  text: string;
  /** Ingredients of the step as the source names them (an AI's answer, ADR 0009); never read from pages. */
  ingredients?: string[];
  /** Name of the HowToSection the step came from. */
  section?: string;
  /** The author numbered the step (pasted text): not split inside a sentence (no "dann", "und", waiting rules), only at the sentence ends from three sentences on. */
  whole?: boolean;
}

export interface CookingStep {
  title?: string;
  text: string;
  /** Of a step that was split, the first part carries them. */
  ingredients?: string[];
}

/** At most this many steps are kept; imports longer than that are marked as partial. */
export const MAX_STEPS = 80;

/** Linking words at the start of a sentence that only say "next": the step itself is the next one. */
const LEAD =
  /^(?:(?:und\s+)?(?:dann(?!\s+(?:erst|nur|genau))|danach|anschließend|anschliessend|zuerst|zunächst|zunaechst|schließlich|zuletzt|zum\s+schluss|erstens|zweitens|drittens)|(?:and\s+)?(?:then|next|first|finally|afterwards|after\s+that|lastly))\b[,:]?\s+/i;

function stripLead(s: string): string {
  const t = s.replace(LEAD, "");
  return t === s ? s : upper(t);
}

/**
 * "Mehl sieben, dann Eier unterrühren" → two parts. "dann" counts only right after a comma, a semicolon or "und",
 * never inside a clause ("den Teig dann ausrollen", "erst dann zugeben") and not after the start of a subordinate
 * clause ("Wenn …, dann …"); the part before it needs a verb and both parts at least two words.
 */
function splitThen(sentence: string, en: boolean): string[] {
  const tail = /[.!?…]+$/.exec(sentence)?.[0] ?? ".";
  const s = sentence.replace(/[.!?…]+$/, "");
  const re =
    /(?:[,;]\s+|\s+(?:und|and)\s+)(?:dann|danach|anschließend|anschliessend|später|afterwards|then)\b,?\s+(?=\S)/gi;
  const parts: string[] = [];
  let pos = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const a = s.slice(pos, m.index);
    const b = s.slice(m.index + m[0].length);
    if (words(a).length < 2 || SUBORDINATE.test(a.trim()) || !(isAction(a, en) || waitOf(a))) continue;
    if (words(b).length < 2 && !isAction(b, en)) continue;
    parts.push(a);
    pos = m.index + m[0].length;
  }
  return [...parts.map((p) => closed(upper(p.trim()))), `${upper(s.slice(pos).trim())}${tail}`];
}

/** Separates what stands before a waiting clause ("10 Min. kneten und ruhen lassen" → kneten / ruhen lassen). */
function splitWait(unit: string, en: boolean): string[] {
  const wait = waitOf(unit);
  if (!wait || wait.clause === 0) return [unit];
  const start = clausesOf(unit)[wait.clause].start;
  const left = unit.slice(0, start).replace(/(?:\s*[,;]|\s+(?:und|oder|and))?\s*$/i, "");
  if (words(left).length < 2 || SUBORDINATE.test(left) || !isAction(left, en)) return [unit];
  return [...splitWait(closed(left), en), closed(upper(unit.slice(start).replace(/[.!?…]+$/, "")))];
}

const OWN_OBJECT = /^(?:den|die|das|dem|der|ein|eine|einen|einem|ca\.|etwa|\d+|\p{Lu})\S*\s/u;

/**
 * "Ofen vorheizen und den Teig backen" → two actions when both parts end in a verb and the second has its own
 * object. Every "und" is tried, from the right.
 */
function splitAnd(unit: string, en: boolean): string[] {
  if (en) return [unit];
  const body = unit.replace(/[.!?…]+$/, "");
  const hits = [...body.matchAll(/\s+und\s+/g)];
  for (let i = hits.length - 1; i >= 0; i--) {
    const left = body.slice(0, hits[i].index);
    const right = body.slice(hits[i].index + hits[i][0].length);
    if (
      OWN_OBJECT.test(right) &&
      words(left).length >= 2 &&
      !SUBORDINATE.test(left) &&
      isAction(left, en) &&
      isAction(right, en)
    )
      return [...splitAnd(closed(left), en), ...splitAnd(closed(upper(right)), en)];
  }
  return [unit];
}

// ------------------------------------------------------------------ Merging

/** Short follow-ups that belong to the previous action ("Gut umrühren.", "Dabei ständig rühren.", "Guten Appetit!"). */
const FOLLOW_UP =
  /^(?:dabei|bis|ggf|gegebenenfalls|evtl|eventuell|optional|guten\s+appetit|tipp|hinweis|while|stirring|until|optionally|if\s+desired|enjoy|tip|note)\b/i;
const MAX_FOLLOW_UP_WORDS = 8;
const MANNER =
  /^(?:gut|gründlich|kräftig|kurz|nochmals|nochmal|gelegentlich|ständig|immer|weiter|alles|well|thoroughly|again|occasionally|constantly|gently)\b/i;

function isFollowUp(unit: string): boolean {
  const n = words(unit).length;
  if (n <= MAX_FOLLOW_UP_WORDS && FOLLOW_UP.test(unit)) return true;
  if (n <= 2 && MANNER.test(unit)) return true;
  // Only a time: "25 Minuten."
  const t = findTimes(unit);
  const bare = unit.replace(/[.!?]$/, "");
  return n <= 3 && t.length === 1 && bare === t[0].text;
}

/** Joins follow-ups to the previous action (`main` is the action itself, the title and duration come from it). */
function merge(units: string[]): { main: string; text: string }[] {
  const out: { main: string; text: string }[] = [];
  for (const u of units) {
    const last = out.at(-1);
    if (last && !waitOf(last.main) && !waitOf(u) && isFollowUp(u)) last.text += ` ${u}`;
    else out.push({ main: u, text: u });
  }
  return out;
}

// ------------------------------------------------------------------ Main entry

/** One instruction text → one entry per action. */
export function splitInstruction(text: string): CookingStep[] {
  const flat = text.replace(/\s+/g, " ").trim();
  const en = looksEnglish(flat);
  const units = (splitEnumeration(flat) ?? [flat])
    .flatMap((part) => splitSentences(part, en))
    .map(stripLead)
    .flatMap((s) => splitThen(s, en))
    .flatMap((u) => splitWait(u, en))
    .flatMap((u) => splitAnd(u, en))
    .map(stripLead);
  return merge(units).map(({ main, text }) => {
    const t = titleFor(main, en);
    return t ? { title: withDuration(t, main, en), text } : { text };
  });
}

/**
 * A step the author numbered: not split inside a sentence (no "dann", waiting or "und" splitting), so "Tomaten und Brühe
 * dazugeben und 15 Min. köcheln lassen." stays one step. From three sentences on it is split at the sentence ends (#62: one
 * step is one action, follow-ups joined). One step gets a title from its first action, with the duration if it has one sentence.
 */
function wholeStep(text: string): CookingStep[] {
  const flat = text.replace(/\s+/g, " ").trim();
  const en = looksEnglish(flat);
  const sentences = splitSentences(flat, en).map(stripLead);
  if (sentences.length >= 3)
    return merge(sentences).map(({ main, text }) => {
      const t = titleFor(main, en);
      return t ? { title: withDuration(t, main, en), text } : { text };
    });
  const title = titleFor(sentences[0] ?? flat, en);
  return title ? [{ title: ownTitle(title, flat), text: flat }] : [{ text: flat }];
}

/** Section names that only say "the instructions": no use as a prefix. */
const GENERIC_SECTION = /^(?:zubereitung|anleitung|schritte|steps?|instructions?|directions?|method|preparation)$/i;

/** A duration for a step title the author wrote, only if the text is one sentence without a separate waiting part. */
function ownTitle(title: string, text: string): string {
  const en = looksEnglish(text);
  const one = splitSentences(text, en).length === 1;
  return one && (!waitOf(text) || clausesOf(text).length === 1) ? withDuration(title, text, en) : title;
}

/**
 * Imported steps in the cooking-mode form, at most `max`; `cut` says that more would have followed.
 * A step with its own title is kept as written (the author already structured it; only a missing duration is added).
 * The name of a HowToSection goes in front of the titles ("Teig – Kneten (10 Min.)") only if there are several
 * sections and the name says something, because notes have no groups for steps; an action without a title gets none.
 */
export function cookingSteps(steps: RawStep[], max = MAX_STEPS): { steps: CookingStep[]; cut: boolean } {
  const out: CookingStep[] = [];
  const several = new Set(steps.map((s) => s.section).filter(Boolean)).size > 1;
  for (const s of steps) {
    const parts = s.title
      ? [{ title: ownTitle(s.title, s.text), text: s.text }]
      : s.whole
        ? wholeStep(s.text)
        : splitInstruction(s.text);
    const prefix = several && s.section && !GENERIC_SECTION.test(s.section.trim()) ? s.section : undefined;
    for (const [n, p] of parts.entries()) {
      if (out.length >= max) return { steps: out, cut: true };
      const title = prefix && p.title ? `${prefix} – ${p.title}` : p.title;
      out.push({
        ...(title ? { title } : {}),
        text: p.text,
        ...(n === 0 && s.ingredients ? { ingredients: s.ingredients } : {}),
      });
    }
  }
  return { steps: out, cut: false };
}
