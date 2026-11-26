// The generic words for a yield ("Portionen", "servings", "Personen", "people", "Stück", "pieces") are translated into the
// language shown; a unit that belongs to the recipe ("Zopf", "Brötchen") stays as written (issue #77).
// Pure functions without Obsidian, tested in tests/language.test.ts.
import { language, trIn, type Lang } from "./i18n";

const SERVING = /^(?:portion|portionen|serving|servings)$/i;
const PIECES = /^(?:stück|stücke|stk\.?|piece|pieces)$/i;
const PERSON = /^(?:person|personen|people|persons)$/i;

/** The unit of a servings text for `count`: the interface's word for a generic one, the written unit otherwise, "servings" for none. */
export function servingsUnitText(unit: string, count: number, lang: Lang = language()): string {
  const u = unit.trim();
  const one = Math.abs(count - 1) < 1e-9;
  if (!u || SERVING.test(u)) return trIn(lang, one ? "servingsUnitOne" : "servingsUnit");
  if (PIECES.test(u)) return trIn(lang, one ? "piecesUnitOne" : "piecesUnit");
  if (PERSON.test(u)) return trIn(lang, one ? "personUnitOne" : "personUnit");
  return u;
}
