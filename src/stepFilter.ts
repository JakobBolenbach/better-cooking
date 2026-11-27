// Refinements for the ingredients of a step (cooking.ts): verbs written like nouns, truncated compounds,
// and a choice between ingredients of the same name by amount and by group. Pure functions, tested in tests/stepIngredients.test.ts.
import { ingredientKey } from "./ingredientKey";
import { normalize } from "./ingredientWords";
import { amountsIn, ingredientName, splitQuantity } from "./quantities";
import { baseUnit } from "./units";
import type { IngredientGroup } from "./types";

export interface Hit {
  group: number;
  index: number;
}

/** Nouns ending in -en that follow the same articles as a nominalized verb ("dem Kuchen", "vom Ofen"). */
const NOUNS_EN = new Set(["kuchen", "boden", "ofen", "schinken", "haken", "wagen", "becken", "balken", "posten"]);

/**
 * German verbs written like nouns after an article or contraction ("nach dem Backen", "zum Tränken", "das Rühren"),
 * normalized. They are verbs and name no ingredient ("Backen" is not "Backpulver"). Diminutives (-chen) are nouns.
 */
export function nominalizedVerbs(text: string): Set<string> {
  const out = new Set<string>();
  const re = /(?:^|[^\p{L}])(?:[Dd]as|[Dd]em|[Zz]um|[Bb]eim|[Vv]om)\s+(\p{Lu}\p{Ll}{2,}(?:en|ern|eln))(?![\p{L}])/gu;
  for (const m of text.matchAll(re)) {
    const w = normalize(m[1]);
    if (w.length >= 5 && !w.endsWith("chen") && !NOUNS_EN.has(w)) out.add(w);
  }
  return out;
}

/** English -ing words after a time word ("after baking", "before mixing"), normalized: verbs, not "baking powder". */
export function gerunds(text: string): Set<string> {
  const re = /(?:^|[^\p{L}])(?:after|before|while|during|by|upon|until|when|without)\s+(\p{Ll}{3,}ing)(?![\p{L}])/giu;
  return new Set([...text.matchAll(re)].map((m) => normalize(m[1])));
}

/**
 * Completes truncated compounds with a hyphen: "Vollmilch- oder Zartbitterschokolade" → "Vollmilchschokolade oder
 * Zartbitterschokolade", so "Milch" in it is no hit. The tail comes from an ingredient name that starts like the
 * truncated word and ends like the full one; without such a name the full word is appended.
 * `names` are normalized words of the ingredients.
 */
export function completeCompounds(text: string, names: string[]): string {
  const re = /(\p{L}{3,})-(\s+(?:oder|und|bzw\.?|sowie|or|and)\s+)(\p{L}+)/gu;
  return text.replace(re, (_all, first: string, mid: string, full: string) => {
    const p = normalize(first);
    const f = normalize(full);
    const name = names.find((n) => n.startsWith(p) && n.length > p.length + 2 && f.endsWith(n.slice(p.length)));
    return `${first}${name ? name.slice(p.length) : full}${mid}${full}`;
  });
}

const sameAmount = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

/** Does the line of an ingredient name this amount with this unit? undefined: it names no amount, so it cannot tell. */
function amountFits(line: string, amount: number, unit: string): boolean | undefined {
  const q = splitQuantity(line);
  if (q.amount === undefined) return undefined;
  const [a, fa] = baseUnit(q.unit);
  const [b, fb] = baseUnit(unit);
  return !!q.unit && a.toLowerCase() === b.toLowerCase() && sameAmount(q.amount * fa, amount * fb);
}

/**
 * Several ingredients of one name ("100 ml Milch", "1 Tasse Milch"): when the step names an amount with the word
 * ("1 Tasse Milch"), only those with that amount stay. Ingredients without an amount stay; if none fits, nothing changes.
 * `meant(h, word)` tells whether the ingredient is meant by a step word.
 */
export function preferByAmount(
  step: string,
  lines: (h: Hit) => string,
  all: Hit[],
  meant: (h: Hit, word: string) => boolean,
): Hit[] {
  let kept = all;
  for (const a of amountsIn(step)) {
    const next = [...step.slice(a.end).matchAll(/^\s+(\p{L}+)(?:\s+(\p{L}+))?/gu)].flatMap((m) => [m[1], m[2] ?? ""]);
    for (const word of next.filter(Boolean).map(normalize)) {
      const cands = kept.filter((h) => meant(h, word));
      if (cands.length < 2) continue;
      const fits = new Map(cands.map((h) => [h, amountFits(lines(h), a.amount, a.unit)]));
      if (![...fits.values()].includes(true)) continue;
      kept = kept.filter((h) => fits.get(h) !== false);
    }
  }
  return kept;
}

/** Words of a group title that tell it from others ("Zum Tränken" → "tranken"). */
const titleWords = (title?: string) =>
  normalize(title ?? "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);

/** The step names a word of the title: equal, or one starts with the other (5+ letters: "Boden" and "Bodenplatte"). */
const mentions = (stepWords: string[], t: string) =>
  stepWords.some((w) => w === t || (Math.min(w.length, t.length) >= 5 && (w.startsWith(t) || t.startsWith(w))));

/**
 * The same ingredient in several groups: prefer the group the step names (by its title) or whose other ingredients
 * the step uses. Ties stay; an ingredient found in one group only is never dropped.
 */
export function preferByGroup(step: string, groups: IngredientGroup[], all: Hit[]): Hit[] {
  const key = (h: Hit) => {
    const name = ingredientName(groups[h.group].ingredients[h.index]);
    return ingredientKey(name) || name.toLowerCase();
  };
  const keys = new Map(all.map((h) => [h, key(h)]));
  const stepWords = normalize(step)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
  const score = (g: number, k: string) =>
    (titleWords(groups[g].title).some((t) => mentions(stepWords, t)) ? 1000 : 0) +
    all.filter((h) => h.group === g && keys.get(h) !== k).length;
  const dropped = new Set<Hit>();
  for (const k of new Set(keys.values())) {
    const same = all.filter((h) => keys.get(h) === k);
    const gs = [...new Set(same.map((h) => h.group))];
    if (gs.length < 2) continue;
    const best = Math.max(...gs.map((g) => score(g, k)));
    same.filter((h) => score(h.group, k) < best).forEach((h) => dropped.add(h));
  }
  return all.filter((h) => !dropped.has(h));
}
