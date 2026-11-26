// Helpers for the recipe page and cooking mode: find durations in steps (timers)
// and detect ingredients that appear in a step. Pure functions, tested in tests/core.test.ts.
import { normalize } from "./search";
import { ingredientName } from "./quantities";
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

/** Words that appear in almost every step and do not mean an ingredient. */
const STOP = new Set([
  "teig",
  "teigs",
  "masse",
  "schussel",
  "ofen",
  "blech",
  "deckel",
  "alles",
  "minuten",
  "stunden",
  "etwa",
  "ganz",
  "zimmertemperatur",
  "kugel",
  "seiten",
  "mitte",
  "brot",
  "brotchen",
  "form",
  "topf",
  "pfanne",
  "hitze",
  "grad",
  // English: kitchen words and adjectives that also describe ingredients ("brown the butter" is not brown sugar)
  "dough",
  "batter",
  "bowl",
  "oven",
  "tray",
  "sheet",
  "minutes",
  "hours",
  "about",
  "until",
  "heat",
  "brown",
  "fresh",
  "large",
  "small",
  "medium",
  "whole",
  "ground",
  "finely",
  "chopped",
  "sliced",
  "diced",
  "minced",
  "with",
  "into",
  "over",
  "then",
  "together",
]);

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

/**
 * Head word of an ingredient: the last word of its name ("olive oil" → "oil", "Olivenöl" stays one word), cut
 * before "for frying" / "zum Braten". Normalized like the step words; undefined if there is none of 2+ letters.
 */
function headWord(name: string): string | undefined {
  const words = normalize(name.replace(/\s+(?:for|to|zum|zur|zu|fürs|für)\s.*$/i, ""))
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
 * Which ingredients (index per group) appear in the step? Matched on word starts and word endings,
 * so "Mehle" hits both kinds of flour and "Ansatz" hits "Sauerteig-Ansatz". Better one ingredient too many than one too few.
 */
export function ingredientsInStep(step: string, groups: IngredientGroup[]): { group: number; index: number }[] {
  const words = stemWords(step);
  const tokens = normalize(step)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
  if (!words.length && !tokens.length) return [];
  const out: { group: number; index: number }[] = [];
  groups.forEach(
    (g, gi) =>
      !isEquipment(g.title) &&
      g.ingredients.forEach((z, zi) => {
        const plain = ingredientName(z).replace(/\bType\s*\d+\b/gi, "");
        const names = stemWords(plain);
        const head = headWord(plain);
        if (head && tokens.some((w) => hitsHead(w, head))) {
          out.push({ group: gi, index: zi });
          return;
        }
        if (!names.length) return;
        const matches = names.some((n) =>
          words.some((w) => {
            const stem = w.slice(0, Math.max(4, Math.min(w.length, n.length) - 2));
            return (
              n === w ||
              n.startsWith(stem) ||
              (stem.length >= 4 && n.endsWith(w.replace(/e?n?$/, ""))) ||
              w.startsWith(n)
            );
          }),
        );
        if (matches) out.push({ group: gi, index: zi });
      }),
  );
  return out;
}
