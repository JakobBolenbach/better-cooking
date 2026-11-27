// The generic words for a yield ("Portionen", "servings", "Personen", "people", "Stück", "pieces") are translated into the
// language shown; a unit that belongs to the recipe ("Zopf", "Brötchen") stays as written (issue #77).
// Pure functions without Obsidian, tested in tests/language.test.ts.
import { language, trIn, type Lang } from "./i18n";

const SERVING = /^(?:portion|portionen|portions|port\.?|serving|servings)$/i;
const PIECES = /^(?:stück|stücke|stk\.?|piece|pieces)$/i;
const PERSON = /^(?:person|personen|people|persons|pers\.?)$/i;

/**
 * Plurals of units of a yield (what a recipe makes: "1 loaf", "1 Zopf"), singular → plural. A small table of its own,
 * only for showing amounts of a yield; the ingredient parser does not use it (units.ts). Looked up without regard to letter case.
 */
const YIELD_FORMS: Record<string, string> = {
  loaf: "loaves",
  roll: "rolls",
  slice: "slices",
  cake: "cakes",
  tray: "trays",
  muffin: "muffins",
  cookie: "cookies",
  zopf: "Zöpfe",
  brot: "Brote",
  blech: "Bleche",
  kuchen: "Kuchen",
};
const YIELD_SINGULAR = new Set(Object.keys(YIELD_FORMS));

/** The written unit in the form for `count`: a known singular becomes its plural unless the count is 1 (letter case of the original kept); everything else stays as written. */
function yieldUnitFor(unit: string, count: number): string {
  const many = YIELD_FORMS[unit.toLowerCase()];
  if (!many || !YIELD_SINGULAR.has(unit.toLowerCase()) || Math.abs(count - 1) < 1e-9) return unit;
  const upper = unit[0] !== unit[0].toLowerCase();
  return upper ? many[0].toUpperCase() + many.slice(1) : many[0].toLowerCase() + many.slice(1);
}

/** The unit of a servings text for `count`: the interface's word for a generic one, a known count noun in its plural for a number other than 1, the written unit otherwise, "servings" for none. */
export function servingsUnitText(unit: string, count: number, lang: Lang = language()): string {
  const u = unit.trim();
  const one = Math.abs(count - 1) < 1e-9;
  if (!u || SERVING.test(u)) return trIn(lang, one ? "servingsUnitOne" : "servingsUnit");
  if (PIECES.test(u)) return trIn(lang, one ? "piecesUnitOne" : "piecesUnit");
  if (PERSON.test(u)) return trIn(lang, one ? "personUnitOne" : "personUnit");
  return yieldUnitFor(u, count);
}

/** Unit and the free text after it ("Portionen (Gäste)", "loaf - about 10 slices"): the unit's own word is the head. */
export function splitUnitNote(unit: string): { head: string; tail: string } {
  const m = /^(.*?)(\s*[(–—,-].*)?$/su.exec(unit.trim());
  return { head: (m?.[1] ?? "").trim(), tail: m?.[2] ?? "" };
}

/**
 * Servings in the sense of people eating ("Portionen", "servings", "Personen", "people", "Pers."): for scaling a meal plan
 * entry against a recipe. "Stück"/"pieces" is not one (it is a thing counted: "24 Stück" is no number of people), although
 * its word is translated like the others (`isYieldUnit`). No unit counts as servings.
 */
export const isServingsWord = (unit: string) => {
  const u = splitUnitNote(unit).head;
  return !u || SERVING.test(u) || PERSON.test(u);
};

/** A generic unit of a yield ("Portionen", "Stück", "Personen", "servings"); not a time and not a word of the recipe. */
export const isYieldUnit = (unit: string) =>
  SERVING.test(unit.trim()) || PIECES.test(unit.trim()) || PERSON.test(unit.trim());
