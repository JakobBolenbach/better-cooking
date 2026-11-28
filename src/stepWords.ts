// Word rules of the guessing of a step's ingredients (cooking.ts, issue #162): which words of a step may name an
// ingredient and which words of an ingredient name count. Descriptive words (cold, fresh, ground), intermediates
// written as compounds ("Hefewasser", "Knoblauch-Dip") and trailing additions of a name ("Olivenöl extra vergine").
// Pure functions, tested in tests/stepGuessing.test.ts.
import { normalize } from "./ingredientWords";
import { looksEnglish, looksGerman } from "./sentences";

/** English words that describe an ingredient or its state and are no ingredient by themselves. */
const DESCRIPTORS_EN = new Set(
  "fresh cold warm hot lukewarm cool ground chopped sliced diced minced grated melted softened crushed toasted roasted raw ripe large small medium fine coarse whole dried frozen thick thin plain light dark soft hard room temperature".split(
    " ",
  ),
);

/** Words that may follow the head of a name ("Olivenöl extra vergine", "oil, extra virgin", "Mehl fein"). */
const TRAILING = new Set(
  "extra vergine virgin nativ native fein feine grob grobe gemahlen gehackt gerieben gesiebt zimmerwarm kalt warm frisch frische ground chopped grated minced sliced diced softened melted fresh optional natur".split(
    " ",
  ),
);

const CAPITAL = /^\p{Lu}/u;
const LOWER = /^\p{Ll}/u;

/** The names of a recipe (normalized) and whether it is written in lower case throughout: what `matchableText` needs. */
export interface TextContext {
  names?: Set<string>;
  lower?: boolean;
}

/**
 * Is the normalized word a verb made of an ingredient word ("salzen", "pfeffern", "zuckern", "buttern", "mehlen",
 * "ölen")? It then names the ingredient like a noun would.
 */
export const verbForm = (word: string, name: string): boolean =>
  name.length >= 2 && new RegExp(`^${name}(?:en|n|ern|eln)$`).test(word);

/**
 * The words of a step that may name an ingredient, as one text. In German text a lower-case word is never a noun
 * ("kalt", "frisch", "gemahlen"), so it does not count, unless it is a verb made of an ingredient word ("salzen") or
 * the recipe is written in lower case throughout (`lower`; without it the text decides: no capital apart from the start
 * of a sentence). In English text the descriptors above do not count. A compound with a hyphen that ends in an
 * intermediate ("Knoblauch-Dip") counts by its last part only.
 */
export function matchableText(text: string, ctx: TextContext = {}): string {
  const words = text.match(/[\p{L}\d]+(?:-\/?[\p{L}\d]+)*/gu) ?? [];
  const names = ctx.names ?? new Set<string>();
  const english = looksEnglish(text);
  const mixed = ctx.lower === undefined ? /[\p{L}\d,;)]\s+\p{Lu}/u.test(text) : !ctx.lower;
  const german = !english && looksGerman(text) && mixed;
  const verb = (w: string) => [...names].some((n) => verbForm(normalize(w), n));
  return words
    .filter((w) => !(english ? DESCRIPTORS_EN.has(w.toLowerCase()) : german && LOWER.test(w) && !verb(w)))
    .map((w) => {
      const parts = w.split(/-\/?/);
      const last = normalize(parts.at(-1) ?? "");
      return parts.length > 1 && (INTERMEDIATE_TAILS.some((t) => last.endsWith(t)) || names.has(last))
        ? (parts.at(-1) as string)
        : w.replace(/-\/?/g, " ");
    })
    .join(" ");
}

/**
 * Does a recipe write German in lower case throughout: no ingredient name and no step text (titles aside) has a
 * capitalized word, apart from the first word of a sentence? Then lower-case words may be nouns.
 */
export function lowerCaseRecipe(texts: readonly string[]): boolean {
  return !texts.some((t) => {
    const tokens = t.split(/\s+/).filter(Boolean);
    return tokens.some((w, i) => i > 0 && !/[.!?:]$/.test(tokens[i - 1]) && /^[^\p{L}\d]*\p{Lu}\p{Ll}/u.test(w));
  });
}

/**
 * An ingredient name without the words that only describe it: in a name with a capitalized word the lower-case
 * words in front of the last one are adjectives or participles ("kaltes Wasser", "frische Hefe", "gemahlener Zimt");
 * the English descriptors go in front of the last word too. The last word always stays.
 */
export function nameWithoutDescriptors(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const capitals = words.some((w) => CAPITAL.test(w));
  return words
    .filter((w, i) => i === words.length - 1 || !(DESCRIPTORS_EN.has(w.toLowerCase()) || (capitals && LOWER.test(w))))
    .join(" ");
}

/** Endings of a compound that name an intermediate product made of its first part ("Hefewasser", "Zuckerguss", "Knoblauchdip"). Normalized. */
const INTERMEDIATE_TAILS = [
  "wasser",
  "guss",
  "dip",
  "teig",
  "masse",
  "mischung",
  "gemisch",
  "creme",
  "sauce",
  "sosse",
  "sirup",
  "glasur",
  "fullung",
  "brei",
  "sud",
  "paste",
  "marinade",
  "dressing",
  "ansatz",
  "schwitze",
  "fond",
  "suppe",
];

/**
 * Is the step word a compound that begins with the ingredient word and names an intermediate made of it ("Hefewasser"
 * and "Hefe", "Zuckerguss" and "Zucker", "Zimtzucker" and "Zimt")? Only the end of a compound is its head ("Olivenöl"
 * is oil). The ending must be a known intermediate or an ingredient of the recipe (`names`); shapes and measures
 * ("Knoblauchzehen", "Paprikaschoten", "Butterflocken", "Rosmarinzweigen", "Lauchringe", "Schokoladenstückchen", "Zitronensaft")
 * name the same thing. Words are normalized.
 */
export function isIntermediate(word: string, name: string, names: ReadonlySet<string> = new Set()): boolean {
  if (word.length < name.length + 3 || !word.startsWith(name)) return false;
  const rest = word.slice(name.length);
  // A linking element ("Zitronen-saft", "Hefe-n") may stand in between.
  return [rest, rest.slice(1), rest.slice(2)].some(
    (t) => t.length >= 3 && (INTERMEDIATE_TAILS.includes(t) || names.has(t)),
  );
}

/** The name without trailing additions ("Olivenöl extra vergine" → "Olivenöl"), as far as other words remain. */
export function withoutTrailing(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  while (words.length > 1 && TRAILING.has(normalize(words.at(-1) ?? ""))) words.pop();
  return words.join(" ");
}
