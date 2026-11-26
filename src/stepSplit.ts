// Makes imported instructions fit for cooking mode (issue #62): one step = one action or one waiting time, with a
// short bold title and its duration, e.g. "Kneten (10 Min.)". Rule-based, nothing is invented: a title is only
// taken from a verb the text itself contains, a duration only from a time the text names. When a rule is unsure,
// the step stays as it is (better no title than a wrong one).
// Pure functions without Obsidian, tested in tests/stepSplit.test.ts. Also used by "Fetch again" (issue #63).
import { findTimes } from "./cooking";

export interface RawStep {
  title?: string;
  text: string;
  /** Name of the HowToSection the step came from. */
  section?: string;
}

// ------------------------------------------------------------------ Sentences

/** Abbreviations that never end a sentence ("ca.", "z. B.", "EL", "Min." …); matched at the end of the text before a dot. */
const ABBREVIATION =
  /(?:^|[\s(])(?:z\.\s?b|d\.\s?h|u\.\s?a|o\.\s?ä|v\.\s?a|i\.\s?d\.\s?r|e\.\s?g|i\.\s?e|ca|bzw|evtl|ggf|usw|etc|vgl|inkl|max|mind|min|mins|std|sek|sec|hr|hrs|el|tl|msp|pck|pkg|stk|nr|approx|vs|tbsp|tsp|oz|lb|lbs)\.$/i;
const TIME_ABBREVIATION = /(?:min|mins|std|sek|sec|hr|hrs)\.$/i;
/** Words that start a new sentence even after "Min." ("20 Min. Danach abkühlen."). */
const NEW_SENTENCE = /^(?:dann|danach|anschließend|anschliessend|nach|zum|zuletzt|then|next|after|finally)\b/i;
const OPENING = /^[\p{Lu}\d„"“([]/u;

/** Sentences of a text; abbreviations, decimal numbers and ordinals ("am 3. Tag", "z. B.") do not end one. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  const re = /[.!?…]+(?=\s)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    const before = text.slice(start, end);
    const rest = text.slice(end).trimStart();
    if (!OPENING.test(rest)) continue;
    if (m[0] === ".") {
      if (/\d\.$/.test(before)) continue;
      if (ABBREVIATION.test(before) && !(TIME_ABBREVIATION.test(before) && NEW_SENTENCE.test(rest))) continue;
      // "z. B." and "d. h.": a lone letter before a capital letter with its own dot.
      if (/(?:^|\s)[a-zäöü]\.$/.test(before) && /^[A-Za-zÄÖÜ]\./.test(rest)) continue;
    }
    out.push(before.trim());
    start = end;
  }
  const last = text.slice(start).trim();
  if (last) out.push(last);
  return out;
}

/** Inline enumeration "1) Eier trennen 2) Zucker schlagen" → one part per number; undefined unless it counts 1, 2 …. */
function splitEnumeration(text: string): string[] | undefined {
  const marks = [...text.matchAll(/(?:^|\s)\(?(\d{1,2})[.)]\s+(?=\p{Lu})/gu)];
  if (marks.length < 2 || marks.some((m, i) => Number(m[1]) !== i + 1)) return undefined;
  const parts = marks.map((m, i) =>
    text.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : undefined).trim(),
  );
  const head = text.slice(0, marks[0].index).trim();
  return [...(head ? [head] : []), ...parts];
}

const upper = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const words = (s: string) => s.split(/\s+/).filter(Boolean);
const closed = (s: string) => (/[.!?…:]$/.test(s) ? s : `${s}.`);

/** Linking words at the start of a sentence that only say "next": the step itself is the next one. */
const LEAD =
  /^(?:(?:und\s+)?(?:dann|danach|anschließend|anschliessend|zuerst|zunächst|zunaechst|schließlich|zuletzt|zum\s+schluss|erstens|zweitens|drittens)|(?:and\s+)?(?:then|next|first|finally|afterwards|after\s+that|lastly))\b[,:]?\s+/i;
const THEN = /\s*[,;]?\s+(?:und\s+)?(?:dann|danach|anschließend|anschliessend|and\s+then|then)\s+(?=\S)/i;

function stripLead(s: string): string {
  const t = s.replace(LEAD, "");
  return t === s ? s : upper(t);
}

/** "Mehl sieben, dann Eier unterrühren" → two parts, if both have at least two words. */
function splitThen(sentence: string): string[] {
  const parts: string[] = [];
  const tail = /[.!?…]+$/.exec(sentence)?.[0] ?? ".";
  let rest = sentence.replace(/[.!?…]+$/, "");
  for (let m = THEN.exec(rest); m; m = THEN.exec(rest)) {
    const a = rest.slice(0, m.index);
    const b = rest.slice(m.index + m[0].length);
    if (words(a).length < 2 || words(b).length < 2) break;
    parts.push(a);
    rest = b;
  }
  return [...parts.map((p) => closed(upper(p.trim()))), `${upper(rest.trim())}${tail}`];
}

// ------------------------------------------------------------------ Waiting times

const WAIT_VERBS =
  "gehen|ruhen|ziehen|quellen|abkühlen|auskühlen|abtropfen|durchziehen|aufgehen|rasten|stehen|trocknen|antrocknen|erkalten|auftauen|marinieren|einweichen|reifen|gären|fermentieren|entspannen";
const WAIT_DE = /\b(\p{Ll}{3,}(?:en|ln|rn))\s+lassen\b/iu;
const WAIT_COLD = /\b(kalt|kühl)\s+stellen\b/i;
const WAIT_EN = /^(?:let|leave)\b.*?\b(rest|rise|proof|cool|chill|stand|sit|marinate|soak|set|simmer|sit)\b/i;
const WAIT_EN_VERB = /^(?:rest|chill|refrigerate|marinate|proof|cool|soak)\b/i;
const WAIT_ONLY = new RegExp(`^(${WAIT_VERBS})\\b`, "iu");

interface Wait {
  title: string;
}

/** A unit that is only waiting ("Teig 30 Minuten gehen lassen"): its title, or undefined. */
function waitOf(unit: string): Wait | undefined {
  const de = WAIT_DE.exec(unit);
  if (de && !/^(?:sich|fallen|stehen)$/i.test(de[1])) return { title: `${upper(de[1].toLowerCase())} lassen` };
  const cold = WAIT_COLD.exec(unit);
  if (cold) return { title: `${upper(cold[1].toLowerCase())} stellen` };
  const en = WAIT_EN.exec(unit);
  if (en) return { title: upper(en[1].toLowerCase()) };
  const verb = WAIT_EN_VERB.exec(unit);
  if (verb) return { title: upper(verb[0].toLowerCase()) };
  if (WAIT_ONLY.test(unit) && findTimes(unit).length) return { title: upper(unit.split(/\s+/)[0].toLowerCase()) };
  return undefined;
}

/** "Ofen vorheizen und den Teig backen" → two actions when both parts end in a verb and the second has its own object. */
function splitAnd(unit: string): string[] {
  if (looksEnglish(unit)) return [unit];
  const m = /^(.+?)\s+und\s+((?:den|die|das|dem|der|ein|eine|einen|einem|ca\.|etwa|\d+|\p{Lu})\S*\s.+)$/u.exec(
    unit.replace(/[.!?…]+$/, ""),
  );
  if (!m || words(m[1]).length < 2 || !germanTitle(m[1]) || !germanTitle(m[2])) return [unit];
  return [closed(m[1]), closed(upper(m[2]))];
}

/** "Teig formen und 30 Min. gehen lassen" → ["Teig formen.", "30 Min. gehen lassen."]; unchanged if only one part. */
function splitWait(unit: string): string[] {
  const m = /^(.+?)\s+und\s+(.+)$/i.exec(unit.replace(/[.!?…]+$/, ""));
  if (m && words(m[1]).length >= 2 && !waitOf(m[1]) && waitOf(m[2]) && findTimes(m[2]).length)
    return [closed(m[1]), closed(upper(m[2]))];
  return [unit];
}

// ------------------------------------------------------------------ Merging

/** Short follow-ups that belong to the previous action ("Gut umrühren.", "Dabei ständig rühren.", "Guten Appetit!"). */
const FOLLOW_UP =
  /^(?:dabei|dazu|damit|bis|ggf|gegebenenfalls|evtl|eventuell|optional|alternativ|guten\s+appetit|enjoy|serve|while|stirring|meanwhile|tipp|hinweis)\b/i;
const MANNER =
  /^(?:gut|gründlich|kräftig|kurz|nochmals|nochmal|gelegentlich|ständig|immer|weiter|alles|well|thoroughly|again|occasionally|constantly|gently)\b/i;
const TIME_ONLY = /^[\d.,½¼¾\s\-–a-zäöüß]*$/i;

function isFollowUp(unit: string): boolean {
  const n = words(unit).length;
  if (FOLLOW_UP.test(unit)) return true;
  if (n <= 2 && MANNER.test(unit)) return true;
  // Only a time: "25 Minuten."
  const t = findTimes(unit);
  return (
    n <= 3 && t.length === 1 && unit.replace(/[.!?]$/, "") === t[0].text && TIME_ONLY.test(unit.replace(/[.!?]$/, ""))
  );
}

/** Joins follow-ups to the previous action; waiting times stay apart. */
function merge(units: string[]): string[] {
  const out: string[] = [];
  for (const u of units) {
    if (out.length && !waitOf(out[out.length - 1]) && !waitOf(u) && isFollowUp(u)) out[out.length - 1] += ` ${u}`;
    else out.push(u);
  }
  return out;
}

// ------------------------------------------------------------------ Titles

const ENGLISH_HINT = /\b(the|and|until|then|minutes?|add|with|into|over|bowl|oven|stir|until)\b/gi;
const GERMAN_HINT = /\b(und|die|der|das|den|dem|mit|bis|dann|minuten?|unter|auf|aus|ein|eine|im|in)\b/gi;
const looksEnglish = (s: string) => (s.match(ENGLISH_HINT)?.length ?? 0) > (s.match(GERMAN_HINT)?.length ?? 0);

const VERBS_EN = new Set(
  (
    "add bake beat blend boil bring brown chill chop combine cook cool cover crack cream cut dice dissolve divide drain drizzle " +
    "fill finish flip fold fry garnish grate grease grill heat knead line marinate mash melt mix peel pour preheat press proof " +
    "reduce refrigerate remove rest rinse roast roll rub scoop season serve shape sift simmer slice soak spread sprinkle squeeze " +
    "stir strain stuff taste toast top toss transfer trim turn warm whip whisk wrap"
  ).split(" "),
);
const SUBORDINATE = /^(?:wenn|sobald|bis|damit|nachdem|falls|während|solange|weil|dass|ob|wie|sodass|so dass|als)\b/i;
const MANNER_DE = new Set(["steif", "glatt", "weich", "fein", "grob", "goldbraun", "kräftig", "knusprig", "cremig"]);
const NOT_VERB = new Set([
  "worden",
  "gewesen",
  "sein",
  "werden",
  "haben",
  "können",
  "müssen",
  "sollen",
  "dürfen",
  "wollen",
  "lassen",
]);
const PARTICIPLE =
  /^(?:(?:auf|an|ab|aus|ein|durch|zusammen|um|vor|zu|hin|her|weg|fest|los|mit|nach|bei|dar|über|unter)?ge)\p{Ll}{2,}en$/u;

/** The infinitive at the end of a German instruction clause ("Eier trennen" → "trennen"), with its manner word. */
function germanVerb(clause: string): string | undefined {
  const w = words(clause.replace(/[.!?…:]+$/, ""));
  const last = w.at(-1);
  if (!last || !/^\p{Ll}{3,}(?:en|ern|eln)$/u.test(last) || NOT_VERB.has(last) || PARTICIPLE.test(last))
    return undefined;
  const before = w.at(-2)?.toLowerCase();
  return upper(before && MANNER_DE.has(before) ? `${before} ${last}` : last);
}

function germanTitle(unit: string): string | undefined {
  for (const clause of unit.split(/\s*,\s+/)) {
    if (SUBORDINATE.test(clause)) continue;
    const first = clause.split(/\s+(?:und|oder)\s+/i)[0];
    const v = germanVerb(first) ?? germanVerb(clause);
    if (v) return v;
  }
  return undefined;
}

function englishTitle(unit: string): string | undefined {
  const first = words(unit)[0]
    ?.toLowerCase()
    .replace(/[^a-z]/g, "");
  return first && VERBS_EN.has(first) ? upper(first) : undefined;
}

/** Short title for one action or waiting time, undefined if unsure. */
export function titleFor(unit: string): string | undefined {
  const wait = waitOf(unit);
  if (wait) return wait.title;
  const title = looksEnglish(unit) ? englishTitle(unit) : germanTitle(unit);
  return title && words(title).length <= 4 ? title : undefined;
}

/** The unit's only duration as written ("7 bis 10 Min."), without "ca."; undefined if none or several. */
function duration(unit: string): string | undefined {
  const spots = findTimes(unit);
  if (spots.length !== 1) return undefined;
  return spots[0].text.replace(/^(?:ca\.\s*|etwa\s*|about\s+|approx\.\s*)/i, "").trim();
}

/** The time belongs to the title unless the title's verb stands in front of an "und" and the time behind it. */
function timeFits(unit: string): boolean {
  const and = /\s(?:und|oder)\s/.exec(unit);
  const spot = findTimes(unit)[0];
  if (!and || !spot || spot.start < and.index || waitOf(unit)) return true;
  const first = unit.slice(0, and.index);
  return !(words(first).length >= 2 && germanTitle(first));
}

const withDuration = (title: string, unit: string) => {
  const d = duration(unit);
  return d && !findTimes(title).length && timeFits(unit) ? `${title} (${d})` : title;
};

// ------------------------------------------------------------------ Main entry

/** One instruction text → one entry per action. */
export function splitInstruction(text: string): { title?: string; text: string }[] {
  const flat = text.replace(/\s+/g, " ").trim();
  const parts = splitEnumeration(flat) ?? [flat];
  const units = parts
    .flatMap(splitSentences)
    .map(stripLead)
    .flatMap(splitThen)
    .flatMap(splitWait)
    .flatMap(splitAnd)
    .map((u) => stripLead(u));
  return merge(units).map((u) => {
    const t = titleFor(u);
    return t ? { title: withDuration(t, u), text: u } : { text: u };
  });
}

/**
 * Imported steps in the cooking-mode form. A step with its own title is kept as written (the author already
 * structured it; only a missing duration is added, and only if the text is one sentence). A step name from a HowToSection goes in front of the title
 * ("Teig – Kneten (10 Min.)"), because notes have no groups for steps.
 */
export function cookingSteps(steps: RawStep[]): { title?: string; text: string }[] {
  const out: { title?: string; text: string }[] = [];
  for (const s of steps) {
    const parts = s.title
      ? [
          {
            title:
              splitSentences(s.text).length === 1 && splitWait(s.text).length === 1
                ? withDuration(s.title, s.text)
                : s.title,
            text: s.text,
          },
        ]
      : splitInstruction(s.text);
    for (const p of parts) {
      const title = s.section ? (p.title ? `${s.section} – ${p.title}` : s.section) : p.title;
      out.push(title ? { title, text: p.text } : { text: p.text });
    }
  }
  return out;
}
