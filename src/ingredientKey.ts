// Ingredient identity (issue #66): when two ingredient names are the same ingredient for the shopping list.
// "Mehl, gesiebt" and "Mehl" are one, "Dinkelmehl" and "Weizenmehl" are not. Rules in docs/shopping-identity.md.
// Pure functions without Obsidian, tested in tests/ingredientKey.test.ts. German and English are kept apart: no translation.
// Rule of thumb: when in doubt the names are different (two lines are better than one wrong line).

import { MEASURE_ABBREVIATIONS, MEASURE_WORDS } from "./ingredientWords";
import { normalize } from "./search";

const words = (...list: string[]) => new Set(list.map(normalize));

/** Kitchen work and state without a product of its own: ignored everywhere, also in front of the noun. */
const NOISE = words(
  ...["gesiebt", "zimmerwarm", "weich", "geschmolzen", "zerlassen", "flüssig", "kalt", "warm", "lauwarm", "gekühlt"],
  ...["abgetropft", "aufgetaut", "gewaschen", "klein", "groß", "mittelgroß", "reif", "bio", "fett", "ca", "circa"],
  ...["etwa", "etwas", "evtl", "optional", "softened", "melted", "sifted", "room", "temperature", "cold", "warm"],
  ...["lukewarm", "large", "small", "medium", "ripe", "packed", "organic", "thawed", "washed", "drained"],
  ...MEASURE_WORDS,
  ...MEASURE_ABBREVIATIONS,
);

/** Preparation that can make another product ("gehackte Tomaten", "tiefgekühlter Spinat"): counts in front of the noun, ignored after a comma. */
const PREP = words(
  ...["gehackt", "gerieben", "geraspelt", "geschält", "entkernt", "halbiert", "gepresst", "zerdrückt", "püriert"],
  ...["gekocht", "tiefgekühlt", "tk", "leicht", "grob", "fein", "frisch", "zerkleinert", "gewürfelt", "geschnitten"],
  ...["gehobelt", "chopped", "finely", "coarsely", "roughly", "fresh", "diced", "sliced", "grated", "minced"],
  ...["crushed", "peeled", "cooked", "frozen", "fine", "coarse"],
);

/** Only after a comma or in brackets: size and filler words, and units of an amount ("(400 g)"). */
const FILLER = words(
  ...["größe", "m", "l", "xl", "size", "und", "and", "g", "kg", "mg", "ml", "cl", "dl", "el", "tl", "stück", "stk"],
  ...["oz", "lb", "cup", "cups", "tbsp", "tsp"],
);

/** From the first of these words on the text is a use, not part of the ingredient: "Salz nach Geschmack". "von" and "aus" are not here: "Saft von Orangen". */
const TAIL = words("zum", "zur", "zu", "für", "fürs", "nach", "to", "for", "as", "plus");

/** Irregular plurals and adjective forms as endings → base. */
const IRREGULAR: [RegExp, string][] = [
  [/^dunkl$/u, "dunkel"],
  [/eier$/u, "ei"],
  [/nusse$/u, "nuss"],
  [/blatter$/u, "blatt"],
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

/** A word without a declension ending ("gehackte" → "gehackt") is a state word too. */
const inSet = (set: Set<string>, w: string) => set.has(w) || set.has(w.replace(/(?:er|es|en|em|e)$/u, ""));

/** Adjectives of kinds that German declines with "-er", "-em", "-es" ("schwarzer Pfeffer"); other words keep an ending like that ("Butter", "Zucker"). */
const KIND_ADJECTIVE = /^(braun|weiss|schwarz|rot|grun|gelb|dunk[e]?l|hell|saur|kraus|glatt|mehlig|fest)(?:er|em|es)$/u;

/**
 * Stem of a word: endings "-en", "-n", "-e", "-s" fall away until none is left, so "Tomate" and "Tomaten", "braune" and
 * "braun", "apple" and "apples" meet; kind adjectives lose "-er" too. Short words stay (four letters remain).
 */
function stem(word: string): string {
  if (/\d/u.test(word)) return word;
  let w = word.replace(KIND_ADJECTIVE, "$1");
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
  for (const [re, to] of IRREGULAR) w = w.replace(re, to);
  return w;
}

/**
 * Words of a text: folded to lower case without umlauts, written plural, number notations and hyphens resolved.
 * Parts of a hyphenated word that are noise fall away ("Bio-Eier"), the rest is one word ("Dinkel-Vollkornmehl").
 */
function plainWords(text: string): string[] {
  const t = normalize(text)
    .replace(/(\p{L})\((?:er|en|n|e|s)\)/gu, "$1")
    // Fat level "3,5 %" → "3.5%".
    .replace(/(\d+)[.,](\d+)\s*%/g, "$1.$2%")
    .replace(/(\d+)\s*%/g, "$1%")
    // Flour type: "Type 405", "Typ 405", "T405", "Mehl 405" are one notation.
    .replace(/\b(?:type|typ|t)\s*(\d{3,4})\b/gu, "type$1")
    .replace(/(mehl|flour)\s+(\d{3,4})\b/gu, "$1 type$2")
    .replace(/(\d\.\d)|\./g, (m: string) => (m.length > 1 ? m : " "))
    .replace(/[^\p{L}\p{N}%.\- ]+/gu, " ")
    .replace(/(?:^|\s)-+|-+(?=\s|$)/g, " ");
  return t
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      const parts = w.split("-").filter(Boolean);
      const kept = parts.filter((p, i) => i === parts.length - 1 || !NOISE.has(p));
      return kept.join("");
    })
    .filter(Boolean);
}

/** Main part of a name and the segments after a comma and in brackets; segments with "oder"/"or" (a substitute) are dropped. */
function split(name: string): { main: string; tail: string } {
  const segments: string[] = [];
  const noBrackets = name.replace(/\(([^)]*)\)/g, (_m, inner: string) => {
    // "Ei(er)" is a written plural, not a bracket with a kind.
    if (!/^(?:er|en|n|e|s)$/u.test(inner)) segments.push(inner);
    return /^(?:er|en|n|e|s)$/u.test(inner) ? "" : " ";
  });
  // A comma inside a number ("3,5 %") is not a comma tail.
  const i = noBrackets.search(/,(?!\d)/);
  if (i >= 0) segments.push(noBrackets.slice(i + 1));
  return {
    main: i >= 0 ? noBrackets.slice(0, i) : noBrackets,
    tail: segments.filter((s) => !/(?:^|\s)(?:oder|or)(?:\s|$)/iu.test(s)).join(" "),
  };
}

/** Preparation phrases after a comma or in brackets ("in Scheiben", "in slices") are ignored there. */
const IN_PIECES =
  /\bin\s+(?:\p{L}+\s+)?(?:scheiben?|würfeln?|streifen|stücken?|ringen|spalten|slices|cubes|strips|pieces|rings|wedges)\b/giu;

/** Words of the tail that count, as written: no state, preparation or filler words, no plain numbers (but percent and flour types). */
function countedTail(tail: string, flour: boolean): string[] {
  const out: string[] = [];
  const found =
    tail.replace(IN_PIECES, " ").match(/\d+(?:[.,]\d+)?\s*%|\b(?:type|typ|t)\s*\d{3,4}\b|[\p{L}\p{N}-]+/giu) ?? [];
  for (const raw of found) {
    const [w = ""] = plainWords(raw);
    if (!w || TAIL.has(w)) {
      if (w) break;
      continue;
    }
    if (/^\d+$/u.test(w)) {
      // "Weizenmehl (405)": a number of 3 or 4 digits right behind flour is its type.
      if (flour && /^\d{3,4}$/u.test(w)) out.push(`Type ${w}`);
    } else if (!inSet(NOISE, w) && !inSet(PREP, w) && !FILLER.has(w)) out.push(raw);
  }
  return out;
}

/** Words of the main part that count: up to a use word, without noise words. */
function mainWords(main: string): string[] {
  const all = plainWords(main);
  const cut = all.findIndex((w, i) => i > 0 && TAIL.has(w));
  const head = cut > 0 ? all.slice(0, cut) : all;
  const kept = head.filter((w) => !inSet(NOISE, w));
  return kept.length ? kept : head;
}

const isFlour = (ws: string[]) => /(?:mehl|flour)$/u.test(ws.at(-1) ?? "");

/** The words of a name that count for identity, as written: main words without noise, then the counted tail. */
function identityWords(name: string): { main: string[]; tail: string[] } {
  const { main, tail } = split(name);
  const core = mainWords(main);
  return { main: core, tail: countedTail(tail, isFlour(core)) };
}

/** Key without synonyms: stemmed words, sorted, so "Pfeffer schwarz" and "schwarzer Pfeffer" are the same. */
function baseKey(name: string): string {
  const { main, tail } = identityWords(name);
  const stems = [...main, ...tail.flatMap(plainWords)].map(stem);
  return [...new Set(stems)].sort().join(" ");
}

/** Groups of names that are the same ingredient; the first is the main spelling. German and English apart. */
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

const KEYS = new Map<string, string>();

/** Key of an ingredient name: names with the same key are the same ingredient (see docs/shopping-identity.md). Empty for a name without letters. */
export function ingredientKey(name: string): string {
  let key = KEYS.get(name);
  if (key === undefined) {
    const base = baseKey(name);
    key = CANON.get(base) ?? base;
    // The shopping list asks for the same few names again and again; a long session must not grow without limit.
    if (KEYS.size > 2000) KEYS.clear();
    KEYS.set(name, key);
  }
  return key;
}

/** The same ingredient: equal keys. Names without any key words are never equal to anything but themselves. */
export function sameIngredient(a: string, b: string): boolean {
  const x = ingredientKey(a);
  return x !== "" ? x === ingredientKey(b) : a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Kinds written after a comma or in brackets that count for identity, as written: "Zucker, braun (fein gehackt)" → "braun". */
export const kindsOf = (text: string): string => {
  const { main, tail } = split(text);
  return countedTail(tail, isFlour(mainWords(main))).join(" ");
};

/** Name as written, without brackets, comma tail and noise words, but with the kinds that count: "Zucker (braun), fein" → "Zucker, braun". */
export function plainName(name: string): string {
  const { main, tail } = split(name);
  const ws = main.split(/\s+/).filter(Boolean);
  const cut = ws.findIndex((w, i) => i > 0 && TAIL.has(normalize(w)));
  const head = cut > 0 ? ws.slice(0, cut) : ws;
  const kept = head.filter((w) => !inSet(NOISE, plainWords(w).join("")));
  const kinds = countedTail(tail, isFlour(mainWords(main)));
  return [(kept.length ? kept : head).join(" "), ...(kinds.length ? [kinds.join(" ")] : [])].join(", ");
}

/** How plain a name is for a merged line, lower is plainer: the main spelling of a synonym group first, then fewer words. */
export const nameRank = (name: string): number =>
  (CANON.has(baseKey(name)) ? 100 : 0) + baseKey(name).split(" ").length;
