// Ingredient identity (issue #66): when two ingredient names are the same ingredient for the shopping list.
// "Mehl, gesiebt" and "Mehl" are one, "Dinkelmehl" and "Weizenmehl" are not. Rules in docs/shopping-identity.md.
// Pure functions without Obsidian, tested in tests/ingredientKey.test.ts. German and English are kept apart: no translation.
// Rule of thumb: when in doubt the names are different (two lines are better than one wrong line).

import {
  ADVERB_WORDS,
  KITCHEN_WORDS,
  NOISE_WORDS,
  PRODUCT_WORDS,
  CRUSH_WORDS,
  USE_WORDS,
  WORK_NOUNS,
  WORK_WORDS,
  normalize,
} from "./ingredientWords";
import { FIXED_PAIRS, UNITS, UNIT_FORMS } from "./units";

const words = (...list: string[]) => new Set(list.map(normalize));

const NOISE = words(...NOISE_WORDS);
const KITCHEN = words(...KITCHEN_WORDS);
const PRODUCT = words(...PRODUCT_WORDS);
const ADVERBS = words(...ADVERB_WORDS);
const TAIL = words(...USE_WORDS);
const WORK = words(...WORK_WORDS);
const CRUSH = words(...CRUSH_WORDS);

/** Only after a comma or in brackets: units of an amount ("(1 stick)", "(ca. 4 Tassen)"), size and function words. */
const UNIT_WORDS = words(...UNITS.map((u) => u.replace(".", "")), ...Object.values(UNIT_FORMS), ...FIXED_PAIRS.flat());
const FILLER = words("größe", "m", "xl", "size", "und", "and", "mit", "at", "into", "very", "sehr", "ggf", "z", "b");

/** Flour types ("Type 405"): other numbers are amounts. */
const TYPES = "405|550|630|812|997|1050|1150|1370|1600|1700|1800";

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
  [/^(zucchini|paprika)s$/u, "$1"],
  [/^eggs$/u, "egg"],
  [/leaves$/u, "leaf"],
  [/loaves$/u, "loaf"],
  [/(\p{L}{3})ies$/u, "$1y"],
];

/** A word without a declension ending ("gehackte" → "gehackt") is a state word too. */
const inSet = (set: Set<string>, w: string) => set.has(w) || set.has(w.replace(/(?:er|es|en|em|e)$/u, ""));

/** Adjectives of kinds, declined in German ("schwarzer Pfeffer", "rote Zwiebel"); other words keep an ending like "-er" ("Butter", "Zucker"). */
const KIND_ADJECTIVE =
  /^(braun|weiss|schwarz|rot|grun|gelb|dunk[e]?l|hell|saur|kraus|glatt|mehlig|fest)(?:er|em|es|en|e)?$/u;

/** Participles declined ("gemahlener Zimt", "getrocknete Kräuter") are the base form ("gemahlen", "getrocknet"). */
const PARTICIPLE = /^(?=.{7,}$)(ge\p{L}+?(?:t|en))(?:er|em|es|en|e)?$/u;

/**
 * Stem of a word: endings "-en", "-n", "-e", "-s" fall away until none is left, so "Tomate" and "Tomaten", "apple" and
 * "apples" meet; declined kind adjectives and participles go back to their base. Short words stay (four letters remain).
 */
function stem(word: string): string {
  if (/\d/u.test(word)) return word;
  let w = word.replace(KIND_ADJECTIVE, "$1").replace(PARTICIPLE, "$1");
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

type Kind = keyof typeof WORK_NOUNS;

let nounKinds: Map<string, Kind> | undefined;

/**
 * Kind of an ingredient of WORK_NOUNS, by the stem of the last word or last two words ("bell pepper"); synonyms of a
 * listed name are listed too ("Mohrrübe", "Küchenzwiebel"). The map is built on the first call, not at load: SYNONYMS is
 * declared further down and used by baseKey while this module loads. A name in two kinds keeps the first.
 */
function kindOfNoun(ws: string[]): Kind | undefined {
  if (ws.length === 0) return undefined;
  if (!nounKinds) {
    const stems = (n: string) => normalize(n).split(" ").map(stem).join(" ");
    const kinds = new Map<string, Kind>();
    const add = (name: string, kind: Kind) => kinds.has(name) || kinds.set(name, kind);
    for (const [kind, list] of Object.entries(WORK_NOUNS) as [Kind, string[]][])
      for (const n of list) add(stems(n), kind);
    for (const [first, ...rest] of SYNONYMS) {
      const kind = kinds.get(stems(first));
      if (kind) for (const r of rest) add(stems(r.split(" ").at(-1) ?? r), kind);
    }
    nounKinds = kinds;
  }
  return nounKinds.get(stem(ws.at(-1) ?? "")) ?? nounKinds.get(ws.slice(-2).map(stem).join(" "));
}

/**
 * Words of a text: folded to lower case without umlauts, written plural, number notations and hyphens resolved.
 * Noise parts of a hyphenated word fall away ("Bio-Eier"), product prefixes are words of their own ("TK-Erbsen"),
 * the rest is one word ("Dinkel-Vollkornmehl").
 */
function plainWords(text: string): string[] {
  const t = normalize(text)
    .replace(/(\p{L})\((?:er|en|n|e|s)\)/gu, "$1")
    // Fat level "3,5 % Fett" → "3.5%".
    .replace(/(\d+)[.,](\d+)\s*%(?:\s*fett)?/g, "$1.$2%")
    .replace(/(\d+)\s*%(?:\s*fett)?/g, "$1%")
    // Flour type: "Type 405", "Typ 405", "T405", "Mehl 405" are one notation; "Mehl 250 g" is an amount.
    .replace(new RegExp(`\\b(?:type|typ|t)\\s*(${TYPES})\\b`, "gu"), "type$1")
    .replace(new RegExp(`(mehl|flour)\\s+(${TYPES})\\b(?!\\s*(?:g|kg|gramm|ml|l)\\b)`, "gu"), "$1 type$2")
    .replace(/(\d\.\d)|\./g, (m: string) => (m.length > 1 ? m : " "))
    .replace(/[^\p{L}\p{N}%.\- ]+/gu, " ")
    .replace(/(?:^|\s)-+|-+(?=\s|$)/g, " ");
  const out: string[] = [];
  for (const w of t.split(/\s+/).filter(Boolean)) {
    const parts = w.split("-").filter(Boolean);
    let joined = "";
    parts.forEach((p, i) => {
      if (i === parts.length - 1) joined += p;
      else if (PRODUCT.has(p)) {
        if (joined) out.push(joined);
        joined = "";
        out.push(p);
      } else if (!NOISE.has(p)) joined += p;
    });
    if (joined) out.push(joined);
  }
  return out;
}

/** Brackets and comma parts apart from the main part; a part with "oder"/"or" (a substitute) is dropped. */
function split(name: string): { main: string; tail: string } {
  const segments: string[] = [];
  const written = /^(?:er|en|n|e|s)$/u;
  const noBrackets = name.replace(/\(([^)]*)\)/g, (_m, inner: string) => {
    // "Ei(er)" is a written plural, not a bracket with a kind.
    if (written.test(inner)) return "";
    segments.push(inner);
    return " ";
  });
  // A comma inside a number ("3,5 %") is not a comma tail; every other comma starts a part of its own.
  const i = noBrackets.search(/,(?!\d)/);
  if (i >= 0) segments.push(...noBrackets.slice(i + 1).split(/,(?!\d)/));
  return {
    main: i >= 0 ? noBrackets.slice(0, i) : noBrackets,
    tail: segments.filter((s) => !/(?:^|\s)(?:oder|or)(?:\s|$)/iu.test(s)).join(" "),
  };
}

/** Preparation phrases after a comma or in brackets ("in Scheiben", "in slices") are ignored there. */
const IN_PIECES =
  /\bin\s+(?:\p{L}+\s+)?(?:scheiben?|würfeln?|streifen|stücken?|ringen?|ringe|spalten|slices|cubes|strips|pieces|rings|wedges|chunks)\b/giu;

/**
 * Words after a comma or in brackets that count, as written: no noise, kitchen work, filler, units or plain numbers
 * (but percent values, and flour types unless a unit follows), cut at a use word.
 */
function countedTail(tail: string, flour: boolean, kind?: Kind): string[] {
  const out: string[] = [];
  const pattern = `\\d+(?:[.,]\\d+)?\\s*%(?:\\s*fett)?|\\b(?:type|typ|t)\\s*(?:${TYPES})\\b|[\\p{L}\\p{N}-]+`;
  const found = tail.replace(IN_PIECES, " ").match(new RegExp(pattern, "giu")) ?? [];
  const plain = found.map((raw) => plainWords(raw).join(" "));
  const use = plain.findIndex((w) => TAIL.has(w));
  found.forEach((raw, i) => {
    const w = plain[i];
    // After a use word nothing counts any more.
    if (!w || (use >= 0 && i >= use)) return;
    if (inSet(NOISE, w) || FILLER.has(w) || UNIT_WORDS.has(w) || dropped(w, plain[i + 1] ?? "", kind, true)) return;
    if (/^\d+$/u.test(w)) {
      // "Weizenmehl (405)": a flour type right behind flour, unless a unit follows ("(250 g)").
      const type = new RegExp(`^(?:${TYPES})$`, "u").test(w) && !UNIT_WORDS.has(plain[i + 1] ?? "");
      if (flour && type) out.push(`Type ${w}`);
    } else out.push(raw);
  });
  return out;
}

/**
 * Kitchen work to ignore for an ingredient of this kind (see WORK_NOUNS), wherever it stands. Without a kind nothing
 * is ignored in front of the noun; after a comma ("tail") the kitchen words are ignored for every ingredient.
 */
function ignored(w: string, kind: Kind | undefined, tail: boolean): boolean {
  if (kind) return inSet(KITCHEN, w) || inSet(WORK, w) || (kind === "garlic" && inSet(CRUSH, w));
  return tail && inSet(KITCHEN, w);
}

/** One rule for main part, comma tail and display name: a word that falls away, or an adverb in front of a kitchen word. */
const dropped = (w: string, next: string, kind: Kind | undefined, tail: boolean): boolean =>
  ignored(w, kind, tail) || (inSet(ADVERBS, w) && (inSet(KITCHEN, next) || ignored(next, kind, tail)));

/**
 * Words of the main part that count: up to a use word, without noise words and dropped words. Also the kind of the
 * ingredient when it is one of WORK_NOUNS (then "in Würfeln" falls away too) and how many words fell away as kitchen work.
 */
function mainWords(main: string): { words: string[]; kind?: Kind; work: number } {
  const head = (text: string) => {
    const all = plainWords(text);
    const cut = all.findIndex((w, i) => i > 0 && TAIL.has(w));
    return cut > 0 ? all.slice(0, cut) : all;
  };
  const bare = head(main.replace(IN_PIECES, " "));
  // The noun is the last word that is no state, work or adverb word for any kind (garlic ignores the most).
  const kind = kindOfNoun(bare.filter((w) => !inSet(NOISE, w) && !ignored(w, "garlic", false) && !inSet(ADVERBS, w)));
  const base = kind ? bare : head(main);
  const counts = base.filter((w, i) => !inSet(NOISE, w) && !dropped(w, base[i + 1] ?? "", kind, false));
  return {
    words: counts.length ? counts : base,
    kind,
    work: kind ? base.filter((w) => !inSet(NOISE, w)).length - counts.length : 0,
  };
}

const isFlour = (ws: string[]) => /(?:mehl|flour)$/u.test(ws.at(-1) ?? "");

/** Key without synonyms: stemmed words, sorted, so "Pfeffer schwarz" and "schwarzer Pfeffer" are the same. */
function baseKey(name: string): string {
  const { main, tail } = split(name);
  const { words: core, kind } = mainWords(main);
  const stems = [...core, ...countedTail(tail, isFlour(core), kind).flatMap(plainWords)].map(stem);
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
  const { words, kind } = mainWords(main);
  return countedTail(tail, isFlour(words), kind).join(" ");
};

/** Name as written, without brackets, comma tail and noise words, but with the kinds that count: "Zucker (braun), fein" → "Zucker, braun". */
export function plainName(name: string): string {
  const { main, tail } = split(name);
  const { words: core, kind } = mainWords(main);
  const ws = (kind ? main.replace(IN_PIECES, " ") : main).split(/\s+/).filter(Boolean);
  const cut = ws.findIndex((w, i) => i > 0 && TAIL.has(normalize(w)));
  const head = cut > 0 ? ws.slice(0, cut) : ws;
  const plain = head.map((w) => plainWords(w).join(""));
  const kept = head.filter((_w, i) => !inSet(NOISE, plain[i]) && !dropped(plain[i], plain[i + 1] ?? "", kind, false));
  const kinds = countedTail(tail, isFlour(core), kind);
  return [(kept.length ? kept : head).join(" "), ...(kinds.length ? [kinds.join(" ")] : [])].join(", ");
}

/**
 * How plain a name is for a merged line, lower is plainer: the main spelling of a synonym group first, then fewer
 * words, where kitchen work written in front of a WORK_NOUNS ingredient counts ("gehackte Zwiebeln" is plainer as "Zwiebel").
 */
export const nameRank = (name: string): number =>
  (CANON.has(baseKey(name)) ? 100 : 0) + baseKey(name).split(" ").length + mainWords(split(name).main).work;

const PLURALS: Record<string, string> = { apfel: "Äpfel", ei: "Eier" };

/**
 * Plural of a counted ingredient for a line with an amount above 1 ("Zwiebel" → "Zwiebeln", "Apfel" → "Äpfel",
 * "onion" → "onions"); the kinds after a comma stay. Names that already are plural, and words the rules do not know, stay as they are.
 */
export function pluralName(name: string): string {
  const [first, ...rest] = name.split(/(?=,)/);
  const m = /^(.*?)(\p{L}+)$/su.exec(first);
  if (!m) return name;
  const [, front, word] = m;
  const lower = word.toLowerCase();
  const done = (w: string) => [front + w, ...rest].join("");
  if (/(?:äpfel|nüsse|blätter|eier)$/u.test(lower)) return name;
  const irregular = PLURALS[lower] ?? (lower.endsWith("nuss") ? `${word.slice(0, -4)}nüsse` : undefined);
  if (irregular) return done(/^\p{Lu}/u.test(word) ? irregular : irregular.toLowerCase());
  // Capitalized words are German nouns, the rest English.
  if (/^\p{Lu}/u.test(word)) return /(?:el|e)$/u.test(lower) ? done(`${word}n`) : name;
  if (lower.endsWith("s")) return name;
  return done(/(?:o|ch|sh|x)$/u.test(lower) ? `${word}es` : `${word}s`);
}
