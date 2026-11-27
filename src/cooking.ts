// Helpers for the recipe page and cooking mode: find durations in steps (timers)
// and detect ingredients that appear in a step (matching here; the choice between ingredients of one name by amount
// and group is in stepFilter.ts). Pure functions, tested in tests/core.test.ts and tests/stepIngredients.test.ts.
import { ingredientName } from "./quantities";
import { FAT_PERCENT, STEP_STOP_WORDS as STOP, USE_WORDS, normalize } from "./ingredientWords";
import {
  completeCompounds,
  completes,
  gerunds,
  nominalizedVerbs,
  preferByAmount,
  preferByGroup,
  truncatedPairs,
  type Hit,
} from "./stepFilter";
import type { IngredientGroup } from "./types";
import { tr } from "./i18n";

export interface TimeSpot {
  start: number;
  end: number;
  text: string;
  /** Lower bound in seconds (the timer starts with it). */
  seconds: number;
  /** Upper bound for ranges ("5 bis 6 Std."). */
  untilSeconds?: number;
}

const NUMBER = "(\\d+(?:[.,]\\d+)?|½|¼|¾)";
const TIME_RE = new RegExp(
  `(?:ca\\.\\s*|etwa\\s*|about\\s+|approx\\.\\s*)?${NUMBER}(?:\\s*(?:-|–|bis|to)\\s*${NUMBER})?\\s*` +
    `(Sekunden|Sek\\.?|Minuten|Minute|Min\\.?|Stunden|Stunde|Std\\.?|seconds?|secs?\\.?|minutes?|mins?\\.?|hours?|hrs?\\.?|h)(?![\\p{L}])`,
  "giu",
);

const value = (s: string) => (s === "½" ? 0.5 : s === "¼" ? 0.25 : s === "¾" ? 0.75 : Number(s.replace(",", ".")));
const faktor = (e: string) => (/^(sek|sec)/i.test(e) ? 1 : /^(std|stunde|h)/i.test(e) ? 3600 : 60);

/** All durations in a text, e.g. "7 bis 10 Min." or "ca. 5-6 h". */
export function findTimes(text: string): TimeSpot[] {
  const out: TimeSpot[] = [];
  TIME_RE.lastIndex = 0;
  for (let m = TIME_RE.exec(text); m; m = TIME_RE.exec(text)) {
    const f = faktor(m[3]);
    const a = value(m[1]) * f;
    const b = m[2] ? value(m[2]) * f : undefined;
    if (!Number.isFinite(a) || a <= 0 || a > 72 * 3600) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      seconds: Math.round(a),
      untilSeconds: b && b > a ? Math.round(b) : undefined,
    });
  }
  return out;
}

/** The text starts with a duration ("20 Min. ruhen", "ca. 1 Std."); "12 Hörnchen" does not. */
export const startsWithTime = (text: string) => findTimes(text)[0]?.start === 0;

/** What is left of a text when its durations are taken out. */
export function withoutTimes(text: string): string {
  let out = "";
  let pos = 0;
  for (const t of findTimes(text)) {
    out += `${text.slice(pos, t.start)} `;
    pos = t.end;
  }
  return out + text.slice(pos);
}

/** Duration in the UI language: "45 Sek.", "10 Min.", "1 Std. 30 Min." / "45 s", "10 min", "1 h 30 min". */
export function durationText(sec: number): string {
  if (sec < 60) return tr("seconds", { s: sec });
  const min = Math.round(sec / 60);
  if (min < 60) return tr("minutes", { m: min });
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? tr("hoursMinutes", { h, m: r }) : tr("hours", { h });
}

/** Remaining time as a clock: 1:05:09 or 4:07. */
export function timer(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const z = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${z(m)}:${z(r)}` : `${m}:${z(r)}`;
}

/** Groups like "Ausstattung" are equipment, not ingredients: not highlighted in steps and not scaled. */
export const isEquipment = (title?: string) =>
  !!title && /^(ausstattung|zubehör|zubehoer|werkzeug|geräte|geraete|equipment)$/i.test(title.trim());

function stemWords(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

/** Short words (3 letters) of steps that are no ingredient; the head word match below would take them for one. */
const SHORT_STOP = new Set(
  "and the for add mix pan cut hot low top set use get out off but all one two its per not can are was you und der die das den dem mit auf aus bei fur von vor zum zur ein nur pro wie bis nun".split(
    " ",
  ),
);

/** Two-letter nouns of the kitchen that may end a compound ("Olivenöl", "Hühnerei"); other short words never do. */
const SHORT_NOUNS = new Set(["ol", "ei"]);

/**
 * Singular for comparing: "eggs" → "egg", "tomatoes" → "tomato", "Eier" → "Ei". Endings that are no plural stay
 * ("Reis", "Mais", "Eis", "Mus", "Anis", "Kürbis", "glass"); only words of 4+ letters are touched.
 */
const singular = (w: string) =>
  w.length > 3 ? (w === "eier" ? "ei" : w.replace(/([^s])oes$/, "$1o").replace(/([^aiusß])s$/, "$1")) : w;

/** From a use word on ("for frying", "zum Braten") the text is no part of the name. */
const USE_TAIL = new RegExp(`\\s+(?:${USE_WORDS.join("|")})\\s.*$`, "i");

/**
 * Head word of an ingredient: the last word of its name ("olive oil" → "oil", "Olivenöl" stays one word), cut
 * before "for frying" / "zum Braten". Normalized like the step words; undefined if there is none of 2+ letters.
 */
function headWord(name: string): string | undefined {
  const words = normalize(name.replace(USE_TAIL, ""))
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 2);
  return words.at(-1);
}

/**
 * Does a step word name the ingredient by its head word? Equal ("Öl" and "Öl", "Ei" and "Ei", "oil" and "oils",
 * "Eier" and "Ei"), or a compound with the head word at its end, on either side: "Olivenöl" for "Öl",
 * "Vanilleeis" for "Eis" (step word) and "Olivenöl" for "Öl" (ingredient). A compound needs a prefix of 3+ letters,
 * so "Reis" is no "Eis" and "Boil" no "oil". Words under 3 letters only count when they are equal, except "Öl" and "Ei" at the end of a compound.
 */
function hitsHead(word: string, head: string): boolean {
  const w = singular(word);
  const h = singular(head);
  if (w === h) return !STOP.has(word) && !SHORT_STOP.has(word);
  if ((word.length < 3 && !SHORT_NOUNS.has(word)) || head.length < 2 || SHORT_STOP.has(word) || STOP.has(word))
    return false;
  if (h.length >= 2 && w.length >= h.length + 3 && w.endsWith(h)) return true;
  return w.length >= 2 && h.length >= w.length + 3 && h.endsWith(w);
}

/**
 * German infinitives in a text (normalized): a lower-case word of 5+ letters ending in -en/-ern/-eln, and verbs
 * written like nouns after an article ("nach dem Backen"). A verb must not hit an ingredient that merely starts
 * with the same letters ("backen" and "Backpulver"), while a noun does ("Backpulver" hits "Backpulver", "Mehl" hits "Mehle").
 */
function infinitives(text: string): Set<string> {
  const out = nominalizedVerbs(text);
  for (const m of text.matchAll(/\p{Ll}{2,}(?:en|ern|eln)(?![\p{L}])/gu))
    if (m[0].length >= 5 && !(m.index > 0 && /\p{L}/u.test(text[m.index - 1]))) out.add(normalize(m[0]));
  return out;
}

/** Name of an ingredient line for matching: no amount, no type number, no fat level ("Milch 3,5 % Fett" is "Milch"). */
const plainOf = (line: string) =>
  completeCompounds(
    ingredientName(line)
      .replace(/\bType\s*\d+\b/gi, "")
      .replace(FAT_PERCENT, " "),
    [],
  );

/** Does the text (as step words and tokens) name the ingredient line? */
function mentionsIngredient(line: string, words: string[], tokens: string[], verbs: Set<string>): boolean {
  const plain = plainOf(line);
  const head = headWord(plain);
  if (head && tokens.some((w) => hitsHead(w, head))) return true;
  // "Vollmilch- oder Zartbitterschokolade" is also meant by "Vollmilchschokolade".
  if (truncatedPairs(ingredientName(line)).some((t) => words.some((w) => completes(w, t)))) return true;
  return stemWords(plain).some((n) =>
    words.some((w) => {
      const stem = w.slice(0, Math.max(4, Math.min(w.length, n.length) - 2));
      return (
        n === w ||
        (!verbs.has(w) && n.startsWith(stem)) ||
        (stem.length >= 4 && n.endsWith(w.replace(/e?n?$/, ""))) ||
        w.startsWith(n)
      );
    }),
  );
}

/**
 * Which ingredients (index per group) appear in the step? Matched on word starts and word endings,
 * so "Mehle" hits both kinds of flour and "Ansatz" hits "Sauerteig-Ansatz". Better one ingredient too many than one too few.
 * Several ingredients of one name are told apart by the amount and the group the step names (stepFilter.ts).
 */
export function ingredientsInStep(step: string, groups: IngredientGroup[]): Hit[] {
  const lines = groups.map((g) => (isEquipment(g.title) ? [] : g.ingredients));
  const text = completeCompounds(
    step,
    lines.flat().flatMap((z) => stemWords(plainOf(z))),
  );
  const verbs = infinitives(text);
  const gerund = gerunds(text);
  const words = stemWords(text).filter((w) => !gerund.has(w));
  const tokens = normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
  if (!words.length && !tokens.length) return [];
  const hits: Hit[] = [];
  lines.forEach((g, group) =>
    g.forEach((z, index) => mentionsIngredient(z, words, tokens, verbs) && hits.push({ group, index })),
  );
  const line = (h: Hit) => groups[h.group].ingredients[h.index];
  const { hits: byAmount, confirmed } = preferByAmount(text, line, hits);
  return preferByGroup(text, groups, byAmount, confirmed);
}
