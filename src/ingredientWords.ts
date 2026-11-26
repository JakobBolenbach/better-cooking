// Word lists and patterns shared by the places that read ingredient text: amounts (quantities.ts), step matching
// (cooking.ts) and ingredient identity (ingredientKey.ts), so none of them keeps its own copy.

/** Lower case, ß → ss, umlauts and accents to the base letter, ae/oe/ue like ä/ö/ü. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u");
}

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

/** From the first of these words on, a text is a use, not part of the ingredient: "Salz nach Geschmack", "oil for frying". "von" and "aus" are not here: "Saft von Orangen". */
export const USE_WORDS = ["zum", "zur", "zu", "für", "fürs", "nach", "to", "for", "as", "plus"];

/** Kitchen work and state without a product of its own: not part of the ingredient anywhere. */
export const NOISE_WORDS = [
  ...["gesiebt", "zimmerwarm", "weich", "geschmolzen", "zerlassen", "flüssig", "kalt", "warm", "lauwarm", "gekühlt"],
  ...["abgetropft", "aufgetaut", "gewaschen", "klein", "groß", "mittelgroß", "reif", "bio", "ca", "circa", "etwa"],
  ...["etwas", "evtl", "optional", "zimmertemperatur", "raumtemperatur", "softened", "melted", "sifted", "room"],
  ...["temperature", "cold", "lukewarm", "large", "small", "medium", "ripe", "packed", "organic", "thawed"],
  ...["washed", "drained", ...MEASURE_WORDS, ...MEASURE_ABBREVIATIONS],
];

/** Kitchen work that does not change what is bought: counts in front of the noun ("gehackte Zwiebeln"), ignored after a comma or in brackets. */
export const KITCHEN_WORDS = [
  ...["gehackt", "gewürfelt", "geschnitten", "gerieben", "geraspelt", "verquirlt", "zerkleinert", "gepresst"],
  ...["zerdrückt", "halbiert", "geputzt", "chopped", "diced", "minced", "beaten", "grated", "trimmed", "divided"],
];

/** Words that make another product: count everywhere, also as a prefix of a hyphenated word ("TK-Erbsen"). */
export const PRODUCT_WORDS = [
  ...["tk", "tiefgekühlt", "frozen", "gekocht", "cooked", "geschält", "peeled", "grob", "fein", "coarse", "fine"],
  ...["leicht", "gehobelt", "sliced", "crushed", "geräuchert", "smoked", "püriert", "entkernt", "frisch", "fresh"],
];

/** "fein gehackt", "thinly sliced": these words in front of a kitchen word are adverbs and fall away with it. */
export const ADVERB_WORDS = ["fein", "grob", "dünn", "thin", "thinly", "finely", "coarsely", "roughly"];

/** All words of state and preparation, for places that must not take them for an ingredient (steps in the cooking mode). */
export const STATE_WORDS = [...NOISE_WORDS, ...KITCHEN_WORDS, ...PRODUCT_WORDS, ...ADVERB_WORDS];

/**
 * Ingredients where preparation is only kitchen work (issue #69): in front of these nouns (and after a comma) the
 * words below are ignored, so "gehackte Zwiebeln" is "Zwiebeln" and "fein gehackte Petersilie" is "Petersilie".
 * Single words or two-word endings in the written form; plural and the synonym table (Mohrrübe, Küchenzwiebel) are
 * matched too. Kept short on purpose: a word is here only if the same thing is bought either way. Not here: Zitronen
 * (zest and juice are other products), Tomaten (gehackte Tomaten are a tin), Mandeln, Käse, Pilze, spices that are
 * also sold dried, ground or as seed (Ingwer, Koriander, Thymian, Rosmarin, Minze, Dill, Basilikum, Paprika: "frisch",
 * "gerieben" or "gehackt" may tell the products apart), and compounds (Frühlingszwiebel, Staudensellerie, Knoblauchpulver).
 *
 * - produce: vegetables, fruit and herbs that are bought fresh anyway. Ignored: KITCHEN_WORDS and WORK_WORDS (peeled,
 *   sliced, fresh). "frisch" is ignored here because nobody buys dried parsley or chives under the plain name.
 * - garlic: like produce, and crushing is kitchen work too (a clove is crushed, nothing else is bought).
 */
export const WORK_NOUNS: Record<"produce" | "garlic", string[]> = {
  produce: [
    ...["Zwiebel", "Schalotte", "Frühlingszwiebel", "Lauchzwiebel", "Petersilie", "Schnittlauch", "Koriandergrün"],
    ...["Karotte", "Möhre", "Sellerie", "Lauch", "Paprikaschote", "Zucchini", "Kartoffel", "Apfel"],
    ...["onion", "shallot", "scallion", "parsley", "chives", "cilantro", "carrot", "celery", "leek", "bell pepper"],
    ...["zucchini", "courgette", "potato", "apple"],
  ],
  garlic: ["Knoblauch", "Knoblauchzehe", "garlic"],
};

/** Product words that are only kitchen work in front of produce and garlic: peeled onions are onions, fresh is the default. */
export const WORK_WORDS = ["geschält", "gepellt", "gewürfelt", "frisch", "peeled", "sliced", "fresh"];

/** Crushing is kitchen work only for garlic ("zerdrückt" and "gepresst" are kitchen words anywhere). */
export const CRUSH_WORDS = ["zerstoßen", "crushed"];
