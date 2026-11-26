// Ingredient identity (issue #66): when two ingredient names are the same ingredient for the shopping list.
// "Mehl, gesiebt" and "Mehl" are one, "Dinkelmehl" and "Weizenmehl" are not. Rules in docs/shopping-identity.md.
// Pure functions without Obsidian, tested in tests/ingredientKey.test.ts. German and English are kept apart: no translation.

/** Words that say how an ingredient is prepared, its state, size or amount, but not what it is. Base forms; endings are tried too. */
const DROP = new Set(
  [
    // State and preparation, German.
    ...["gehackt", "gehackte", "fein", "grob", "frisch", "zimmerwarm", "weich", "gesiebt", "geschmolzen", "gewürfelt"],
    ...["geschnitten", "gerieben", "geraspelt", "geschält", "entkernt", "halbiert", "gepresst", "zerdrückt", "püriert"],
    ...[
      "zerlassen",
      "flüssig",
      "kalt",
      "warm",
      "lauwarm",
      "gekühlt",
      "gekocht",
      "abgetropft",
      "tiefgekühlt",
      "aufgetaut",
    ],
    ...["klein", "gross", "groß", "mittelgross", "mittelgroß", "reif", "bio", "gewaschen", "zerkleinert", "fett"],
    // Amount words.
    ...[
      "gestr",
      "gestrichen",
      "geh",
      "gehäuft",
      "gehaeuft",
      "leicht",
      "ca",
      "circa",
      "etwa",
      "etwas",
      "evtl",
      "optional",
    ],
    // English.
    ...[
      "chopped",
      "finely",
      "coarsely",
      "roughly",
      "fresh",
      "diced",
      "softened",
      "melted",
      "sifted",
      "sliced",
      "grated",
    ],
    ...["minced", "crushed", "peeled", "room", "temperature", "cold", "warm", "lukewarm", "large", "small", "medium"],
    ...[
      "ripe",
      "packed",
      "level",
      "heaped",
      "organic",
      "cooked",
      "thawed",
      "frozen",
      "washed",
      "drained",
      "fine",
      "coarse",
    ],
  ].map((w) => norm(w)),
);

/** From the first of these words on (not at the start), the text is a use, not part of the ingredient: "Salz nach Geschmack". */
const TAIL = new Set(
  ["zum", "zur", "zu", "für", "fürs", "nach", "aus", "to", "for", "as", "von", "vom", "plus"].map((w) => norm(w)),
);

/** Irregular plurals as endings → singular. */
const IRREGULAR: [RegExp, string][] = [
  [/eier$/u, "ei"],
  [/nüsse$/u, "nuss"],
  [/äpfel$/u, "apfel"],
  [/blätter$/u, "blatt"],
  [/kräuter$/u, "kraut"],
  [/zehen$/u, "zehe"],
  [/^beten$/u, "bete"],
  [/^chilis$/u, "chili"],
  [/^(?:chilies|chillies|chilli)$/u, "chili"],
  [/^eggs$/u, "egg"],
  [/oes$/u, "o"],
  [/leaves$/u, "leaf"],
  [/loaves$/u, "loaf"],
  [/(\p{L}{3})ies$/u, "$1y"],
];

function norm(w: string): string {
  return w.toLowerCase().replace(/ß/g, "ss");
}

/** A word without its adjective ending ("gehackte" → "gehackt") is a drop word too. */
function isDrop(word: string): boolean {
  return DROP.has(word) || DROP.has(word.replace(/(?:er|es|en|em|e)$/u, ""));
}

/**
 * Stem of a noun: endings "-en", "-n", "-e", "-s" fall away until none is left, so "Tomate" and "Tomaten", "apple" and
 * "apples" meet. Short words stay (at least four letters remain).
 */
function stemNoun(word: string): string {
  let w = word;
  for (const [re, to] of IRREGULAR) w = w.replace(re, to);
  for (let again = true; again;) {
    again = false;
    for (const end of ["en", "n", "e", "s"]) {
      if (!w.endsWith(end) || w.length - end.length < 4) continue;
      // "Haselnuss", "Hummus", "Kürbis", "Ananas": the s belongs to the word.
      if (end === "s" && /(?:ss|us|is|as)$/u.test(w)) continue;
      w = w.slice(0, -end.length);
      again = true;
      break;
    }
  }
  return w;
}

/** A word in front of the last one: adjective endings fall away first ("brauner", "braune" → "braun"). */
const stemFront = (w: string): string =>
  stemNoun(/\d/u.test(w) ? w : (/^(.{3,}?)(?:er|em|en|es|e)$/u.exec(w)?.[1] ?? w));

/** Name as normalized words: lower case, written plural, brackets, comma tail, "in Scheiben" and number notations resolved. */
function plainWords(name: string): string[] {
  let t = norm(name)
    .replace(/(\p{L})\((?:er|en|n|e|s)\)/gu, "$1")
    .replace(/\([^)]*\)/g, " ")
    // Fat level "3,5 %" → "3.5%"; the comma is not a comma tail.
    .replace(/(\d+)[.,](\d+)\s*%/g, "$1.$2%")
    .replace(/(\d+)\s*%/g, "$1%")
    .replace(/,.*$/, "")
    .replace(
      /\bin\s+(?:\p{L}+\s+)?(?:scheiben?|würfeln?|streifen|stücken?|ringen|spalten|slices|cubes|strips|pieces|rings|wedges)\b/gu,
      " ",
    )
    .replace(/(\p{L})-(\p{L})/gu, "$1$2")
    // Flour type: "Type 405", "Typ 405", "T405", "Mehl 405" are one notation.
    .replace(/\b(?:type|typ|t)\s*(\d{3,4})\b/gu, "type$1")
    .replace(/(mehl|flour)\s+(\d{3,4})\b/gu, "$1 type$2")
    .replace(/(\d\.\d)|\./g, (m: string) => (m.length > 1 ? m : " "))
    .replace(/[^\p{L}\p{N}%. ]+/gu, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t ? t.split(" ") : [];
}

/** Words that are part of the ingredient, in order. */
function coreWords(name: string): string[] {
  const all = plainWords(name);
  const cut = all.findIndex((w, i) => i > 0 && TAIL.has(w));
  const head = cut > 0 ? all.slice(0, cut) : all;
  const kept = head.filter((w) => !isDrop(w));
  return kept.length ? kept : head;
}

/** Key without synonyms: stemmed words, sorted, so "Zucker, brauner" and "brauner Zucker" are the same. */
function baseKey(name: string): string {
  const words = coreWords(name);
  return words
    .map((w, i) => (i === words.length - 1 ? stemNoun(w) : stemFront(w)))
    .sort()
    .join(" ");
}

/** Groups of names that are the same ingredient; the first is the key. German and English apart. */
const SYNONYMS: string[][] = [
  // German
  ["Zucker", "Kristallzucker", "Haushaltszucker", "weißer Zucker", "Feinkristallzucker"],
  ["Puderzucker", "Staubzucker"],
  ["Ei", "Hühnerei"],
  ["Eigelb", "Eidotter"],
  ["Eiweiß", "Eiklar"],
  ["Salz", "Speisesalz", "Kochsalz"],
  ["Pfeffer", "schwarzer Pfeffer"],
  ["Natron", "Speisenatron"],
  ["Hefe", "Frischhefe", "Hefewürfel"],
  ["Möhre", "Karotte", "Mohrrübe"],
  ["Zwiebel", "Küchenzwiebel", "gelbe Zwiebel"],
  ["Quark", "Speisequark"],
  ["Joghurt", "Yoghurt", "Jogurt"],
  ["Naturjoghurt", "Joghurt natur"],
  ["Schlagsahne", "Schlagobers"],
  ["Milch", "Frischmilch", "H-Milch"],
  ["Vollmilch", "Milch 3,5 %", "Milch 3,8 %"],
  ["fettarme Milch", "Milch 1,5 %"],
  // English
  ["sugar", "granulated sugar", "white sugar"],
  ["powdered sugar", "icing sugar", "confectioners' sugar"],
  ["all-purpose flour", "plain flour"],
  ["cornstarch", "corn starch", "cornflour"],
  ["baking soda", "bicarbonate of soda", "sodium bicarbonate"],
  ["scallion", "spring onion", "green onion"],
  ["zucchini", "courgette"],
  ["eggplant", "aubergine"],
  ["chickpea", "garbanzo bean"],
  ["heavy cream", "heavy whipping cream"],
  ["whole milk", "full fat milk"],
  ["skim milk", "skimmed milk"],
];

const CANON = new Map<string, string>(
  SYNONYMS.flatMap(([first, ...rest]) => rest.map((s): [string, string] => [baseKey(s), baseKey(first)])),
);

/** Key of an ingredient name: names with the same key are the same ingredient (see docs/shopping-identity.md). Empty for a name without letters. */
export function ingredientKey(name: string): string {
  const key = baseKey(name);
  return CANON.get(key) ?? key;
}

/** The same ingredient: equal keys. Names without any key words are never equal to anything but themselves. */
export function sameIngredient(a: string, b: string): boolean {
  const x = ingredientKey(a);
  return x !== "" ? x === ingredientKey(b) : a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Name as written, without brackets, comma tail, preparation and amount words: "gehackte Zwiebeln, fein" → "Zwiebeln". */
export function plainName(name: string): string {
  const words = name
    .replace(/\([^)]*\)/g, " ")
    .replace(/,.*$/, "")
    .split(/\s+/)
    .filter(Boolean);
  const cut = words.findIndex((w, i) => i > 0 && TAIL.has(norm(w)));
  const head = cut > 0 ? words.slice(0, cut) : words;
  const kept = head.filter((w) => !isDrop(norm(w).replace(/[^\p{L}]/gu, "")));
  return (kept.length ? kept : head).join(" ");
}

/** How plain a name is for a merged line, lower is plainer: the main spelling of a synonym group first, then fewer words. */
export const nameRank = (name: string): number => (CANON.has(baseKey(name)) ? 100 : 0) + coreWords(name).length;
