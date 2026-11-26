// Word lists and patterns shared by the places that read ingredient text: amounts (quantities.ts), step matching
// (cooking.ts) and ingredient identity (ingredientKey.ts), so none of them keeps its own copy.

/** Words that say how an amount is measured ("gestr. TL", "gehäufter EL", "level tsp"): base forms, endings follow. */
export const MEASURE_WORDS = ["gestrichen", "gehäuft", "level", "heaped"];
/** Abbreviations of measure words, written with a period ("gestr.", "geh."). */
export const MEASURE_ABBREVIATIONS = ["gestr", "geh"];

/** First letter in both cases, for patterns that stay case sensitive elsewhere. */
const either = (w: string) => `[${w[0].toUpperCase()}${w[0]}]${w.slice(1)}`;

/** Pattern (source) for one measure word in front of a unit. */
export const MEASURE = `(?:${[
  ...MEASURE_ABBREVIATIONS.map((a) => `${either(a)}\\.`),
  ...MEASURE_WORDS.map((w) => `${either(w)}(?:e[rnms]?)?`),
].join("|")})(?!\\p{L})`;

/** A percent value with the word "Fett" behind it ("3,5 % Fett"): it belongs to the fat level, not to a word of the name. */
export const FAT_PERCENT = /\d+(?:[.,]\d+)?\s*%(?:\s*fett)?/giu;
