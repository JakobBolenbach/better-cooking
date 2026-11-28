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

/**
 * The words of a step that may name an ingredient, as one text. In German text a lower-case word is never a noun
 * ("kalt", "frisch", "gemahlen"), so it does not count, unless the text is written in lower case throughout (no capital
 * apart from the start of a sentence). In English text the descriptors above do not count. Other text stays as it is.
 */
export function matchableText(text: string): string {
  const words = text.match(/[\p{L}\d]+(?:-\/?[\p{L}\d]+)*/gu) ?? [];
  const english = looksEnglish(text);
  const german = !english && looksGerman(text) && /[\p{L}\d,;)]\s+\p{Lu}/u.test(text);
  return (
    words
      .filter((w) => !(english ? DESCRIPTORS_EN.has(w.toLowerCase()) : german && LOWER.test(w)))
      .join(" ")
      // In "Knoblauch-Dip" only the end names a thing: the first part is no hit by itself.
      .replace(/[\p{L}\d]+-\/?(?=[\p{L}\d])/gu, "")
  );
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

/** What may follow the first part of a compound without making it another thing ("Zitronensaft" is still lemon). */
const SAME_THING =
  /^(?:e?n|e?s)?(?:saft|schale|schalen|abrieb|zeste|zesten|scheibe|scheiben|stuck|stucke|wurfel|blatt|blatter|blattchen|pulver)$/;

/**
 * Is the step word a compound that begins with the ingredient word and names something else ("Hefewasser" and "Hefe",
 * "Zuckerguss" and "Zucker")? Only the end of a compound is its head ("Olivenöl" is oil). Words are normalized.
 * A short ending is an inflection ("Mehle"), and a few endings name the same thing ("Zitronensaft").
 */
export const isIntermediate = (word: string, name: string): boolean =>
  word.length >= name.length + 3 && word.startsWith(name) && !SAME_THING.test(word.slice(name.length));

/** The name without trailing additions ("Olivenöl extra vergine" → "Olivenöl"), as far as other words remain. */
export function withoutTrailing(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  while (words.length > 1 && TRAILING.has(normalize(words.at(-1) ?? ""))) words.pop();
  return words.join(" ");
}
