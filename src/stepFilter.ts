// Refinements for the ingredients of a step (cooking.ts): verbs written like nouns, truncated compounds,
// and a choice between ingredients of the same name by amount and by group. Pure functions, tested in tests/stepIngredients.test.ts.
import { ingredientKey } from "./ingredientKey";
import { STEP_STOP_WORDS, normalize } from "./ingredientWords";
import { amountsIn, ingredientName, splitQuantity } from "./quantities";
import { baseUnit } from "./units";
import type { IngredientGroup } from "./types";

export interface Hit {
  group: number;
  index: number;
}

/** Nouns ending in -en that follow the same articles as a nominalized verb ("dem Kuchen", "vom Ofen"). */
const NOUNS_EN = new Set([
  "boden",
  "schinken",
  "haken",
  "wagen",
  "becken",
  "balken",
  "posten",
  "weizen",
  "roggen",
  "braten",
  "kuchen",
  "knochen",
]);

/** Diminutives ("Brötchen", "Plätzchen"): a consonant in front of -chen. Verbs have a vowel or "s"/"h" there ("kochen", "mischen", "suchen"). */
const DIMINUTIVE = /[^aeiouhs]chen$/;

/**
 * German verbs written like nouns after an article or contraction ("nach dem Backen", "zum Tränken", "das Rühren"),
 * normalized. They are verbs and name no ingredient ("Backen" is not "Backpulver"). Diminutives are nouns.
 * Limit: a capitalized -en noun after these articles that is not in NOUNS_EN is taken for a verb; that only costs
 * a hit by word start ("vom Kuchen" for "Kuchenglasur"), never a hit by the whole word.
 */
export function nominalizedVerbs(text: string): Set<string> {
  const out = new Set<string>();
  const re =
    /(?:^|[^\p{L}])(?:[Dd]as|[Dd]em|[Zz]um|[Bb]eim|[Vv]om|[Ii]ns|[Ff]ürs|[Aa]ufs)\s+(\p{Lu}\p{Ll}{2,}(?:en|ern|eln))(?![\p{L}])/gu;
  for (const m of text.matchAll(re)) {
    const w = normalize(m[1]);
    if (w.length >= 5 && !DIMINUTIVE.test(w) && !NOUNS_EN.has(w) && !/kuchen$/.test(w)) out.add(w);
  }
  return out;
}

/**
 * English -ing words after a time word ("after baking", "before mixing"), normalized. They are no ingredient words
 * ("baking" is not "baking powder"), but still hit an ingredient by its head word ("until the frosting is set").
 */
export function gerunds(text: string): Set<string> {
  const re = /(?:^|[^\p{L}])(?:after|before|while|during|by|upon|until|when|without)\s+(\p{Ll}{3,}ing)(?![\p{L}])/giu;
  return new Set([...text.matchAll(re)].map((m) => normalize(m[1])));
}

const TRUNCATED = /(\p{L}{3,})-(\s+(?:oder|und|bzw\.?|sowie|or|and)\s+)(\p{L}+)/gu;

/** Truncated compounds in a text, normalized: "Vollmilch- oder Zartbitterschokolade" → first "vollmilch", full "zartbitterschokolade". */
export const truncatedPairs = (text: string) =>
  [...text.matchAll(TRUNCATED)].map((m) => ({ first: normalize(m[1]), full: normalize(m[3]) }));

/** Does a normalized word complete a truncated first part with the ending of the full word ("vollmilchschokolade")? */
export const completes = (w: string, t: { first: string; full: string }) =>
  w.startsWith(t.first) && w.length > t.first.length + 2 && t.full.endsWith(w.slice(t.first.length));

/**
 * Completes truncated compounds with a hyphen: "Vollmilch- oder Zartbitterschokolade" → "Vollmilchschokolade oder
 * Zartbitterschokolade", so "Milch" in it is no hit. The tail comes from an ingredient name that starts like the
 * truncated word and ends like the full one; without such a name the full word is appended.
 * `names` are normalized words of the ingredients.
 */
export function completeCompounds(text: string, names: string[]): string {
  return text.replace(TRUNCATED, (_all, first: string, mid: string, full: string) => {
    const p = normalize(first);
    const f = normalize(full);
    const name = names.find((n) => n.startsWith(p) && n.length > p.length + 2 && f.endsWith(n.slice(p.length)));
    return `${first}${name ? name.slice(p.length) : full}${mid}${full}`;
  });
}

const sameAmount = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * Does the line of an ingredient name this amount with this unit? undefined: it cannot tell (no amount, or an amount
 * without a unit such as "4 Eier" against "200 g").
 */
function amountFits(line: string, amount: number, unit: string): boolean | undefined {
  const q = splitQuantity(line);
  if (q.amount === undefined || !q.unit) return undefined;
  const [a, fa] = baseUnit(q.unit);
  const [b, fb] = baseUnit(unit);
  return a.toLowerCase() === b.toLowerCase() && sameAmount(q.amount * fa, amount * fb);
}

/** Name of an ingredient line as an identity: the same key is the same ingredient ("Zucker" is not "Vanillezucker"). */
export function nameKey(line: string): string {
  const name = ingredientName(line);
  return ingredientKey(name) || name.toLowerCase();
}

/** Keys of the names a step can mean right behind an amount: "Tasse warme Milch" → the next word, the one after, both together. */
function namesAfter(text: string): Set<string> {
  const m = /^\s+(\p{L}+)(?:\s+(\p{L}+))?/u.exec(text);
  if (!m) return new Set();
  return new Set([m[1], m[2], m[2] && `${m[1]} ${m[2]}`].filter((s): s is string => !!s).map((s) => nameKey(s)));
}

/**
 * Several ingredients of one name ("100 ml Milch", "1 Tasse Milch"): an ingredient whose name and amount the step
 * gives together ("1 Tasse Milch") is confirmed; the others of the same name with another amount are dropped. Other
 * names are never touched ("Zucker" and "Vanillezucker" are different ingredients), ingredients that cannot be
 * compared (no amount, no unit) stay, and so does everything if nothing is confirmed. The order of the amounts in the step does not matter.
 */
export function preferByAmount(
  step: string,
  line: (h: Hit) => string,
  all: Hit[],
): { hits: Hit[]; confirmed: Set<Hit> } {
  const confirmed = new Set<Hit>();
  const refuted = new Set<Hit>();
  for (const a of amountsIn(step)) {
    const names = namesAfter(step.slice(a.end));
    for (const h of all) {
      if (!names.has(nameKey(line(h)))) continue;
      const fit = amountFits(line(h), a.amount, a.unit);
      if (fit === true) confirmed.add(h);
      else if (fit === false) refuted.add(h);
    }
  }
  const named = new Set([...confirmed].map((h) => nameKey(line(h))));
  const hits = all.filter((h) => confirmed.has(h) || !(refuted.has(h) && named.has(nameKey(line(h)))));
  return { hits, confirmed };
}

/** Words of a group title that tell it from others ("Zum Tränken" → "tranken"), without "Zutaten"; `purpose`: the title is a purpose ("Für die Form", "Zum Tränken"). */
const titleWords = (title?: string) => {
  const ws = normalize(title ?? "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return {
    purpose: ws.some((w) => ["fur", "furs", "zum", "zur", "for", "to"].includes(w)),
    words: ws.filter((w) => w.length >= 4 && !["zutaten", "ingredients"].includes(w)),
  };
};

/** The step word names the title word: equal, or one starts with the other (5+ letters: "Boden" and "Bodenplatte"). */
const same = (w: string, t: string) =>
  w === t || (Math.min(w.length, t.length) >= 5 && (w.startsWith(t) || t.startsWith(w)));

/** Words the step names as a purpose: "für die Creme", "zum Tränken", "for the glaze". */
const purposeWords = (step: string): string[] =>
  [
    ...normalize(step).matchAll(
      /(?:^|[^a-z])(?:fur|furs|zum|zur|for|to)\s+(?:(?:den|die|das|dem|der|the)\s+)?([a-z0-9]+)/g,
    ),
  ].map((m) => m[1]);

/**
 * The same ingredient in several groups: prefer the group whose other ingredients the step uses (10 each) and, less,
 * the group the step names by its title ("für die Creme", a title like "Für die Form" met in the step: 15; a title word anywhere in the step, kitchen words excepted: 5). Ties stay;
 * an ingredient found in one group only and a confirmed one (see preferByAmount) are never dropped.
 */
export function preferByGroup(step: string, groups: IngredientGroup[], all: Hit[], confirmed = new Set<Hit>()): Hit[] {
  const keys = new Map(all.map((h) => [h, nameKey(groups[h.group].ingredients[h.index])]));
  const stepWords = normalize(step)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
  const purposes = purposeWords(step);
  const title = (g: number) => {
    const { purpose, words: ts } = titleWords(groups[g].title);
    const inStep = (t: string) => stepWords.some((w) => same(w, t));
    // Kitchen words ("Form", "Teig") are no hint by themselves, but are one for a purpose: "für den Teig", a group "Für die Form".
    if (ts.some((t) => purposes.some((p) => same(p, t)) || (purpose && inStep(t)))) return 15;
    return ts.some((t) => !STEP_STOP_WORDS.has(t) && inStep(t)) ? 5 : 0;
  };
  const score = (g: number, k: string) => title(g) + 10 * all.filter((h) => h.group === g && keys.get(h) !== k).length;
  const dropped = new Set<Hit>();
  for (const k of new Set(keys.values())) {
    const alike = all.filter((h) => keys.get(h) === k);
    const gs = [...new Set(alike.map((h) => h.group))];
    if (gs.length < 2) continue;
    const best = Math.max(...gs.map((g) => score(g, k)));
    alike.filter((h) => score(h.group, k) < best && !confirmed.has(h)).forEach((h) => dropped.add(h));
  }
  return all.filter((h) => !dropped.has(h));
}
