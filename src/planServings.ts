// Servings of a meal plan entry, shown on the plan page and used as the factor of "week to the shopping list" (#109).
// One rule for both: the unit written in the entry wins; the recipe's unit is used only for a bare number.
// Pure, no Obsidian, tested in tests/planServings.test.ts.
import { language, type Lang } from "./i18n";
import { servingsText } from "./quantities";
import { isServingsWord, servingsUnitText, splitUnitNote } from "./servingsWords";
import type { Servings } from "./types";

export interface PlanServings {
  /** "8 servings", "2 loaves", "4 to 6 servings"; empty when neither the entry nor the recipe has a number. */
  text: string;
  /** Factor for the recipe's amounts. */
  factor: number;
  /** The entry counts something else than the recipe yields (servings against a loaf): the factor is 1 and the recipe is taken as written. */
  mismatch: boolean;
  /** The recipe's own yield as written ("1 loaf"), what the shopping list takes on a mismatch. */
  asWritten: string;
}

/**
 * What an entry (`count`, `countTo` and `unit` as written) means for a recipe's yield.
 * Text: the entry's number with the entry's unit; a bare number or none takes the recipe's unit (and number).
 * A generic word is shown in the interface's language, a count noun with a known plural ("loaf" → "loaves") in the form for the number.
 * Factor: entry number / recipe number, except for a contrast that is positively known: servings or people against a
 * concrete unit, or the other way round ("8 servings" for "1 loaf", "2 Zöpfe" for "4 Portionen"); then 1.
 * Free text after a unit ("8 Portionen (Gäste)", "1 loaf (about 10 slices)") is not part of the comparison.
 */
export function planServings(
  entry: { count?: number; countTo?: number; unit?: string },
  recipe: Servings | undefined,
  lang: Lang = language(),
): PlanServings {
  const asWritten = recipe?.count ? servingsText({ count: recipe.count, unit: recipe.unit }, 1, lang) : "";
  const count = entry.count ?? recipe?.count;
  if (!count) return { text: "", factor: 1, mismatch: false, asWritten };
  const own = entry.count !== undefined && !!entry.unit?.trim();
  const unit = own ? (entry.unit ?? "").trim() : (recipe?.unit ?? "").trim();
  const upper = entry.count !== undefined ? entry.countTo : recipe?.countTo;
  const { head, tail } = splitUnitNote(unit);
  const text = servingsText(
    { count, unit: servingsUnitText(head, upper ?? count, lang) + tail, ...(upper ? { countTo: upper } : {}) },
    1,
    lang,
    true,
  );
  if (entry.count === undefined || !recipe?.count) return { text, factor: 1, mismatch: false, asWritten };
  const mismatch = own && isServingsWord(unit) !== isServingsWord(recipe.unit);
  return { text, factor: mismatch ? 1 : entry.count / recipe.count, mismatch, asWritten };
}
