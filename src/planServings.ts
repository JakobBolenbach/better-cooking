// Servings of a meal plan entry, shown on the plan page and used as the factor of "week to the shopping list" (#109).
// One rule for both: the unit written in the entry wins; the recipe's unit is used only for a bare number.
// Pure, no Obsidian, tested in tests/planServings.test.ts.
import { language, type Lang } from "./i18n";
import { servingsText } from "./quantities";
import { isYieldUnit, servingsUnitText } from "./servingsWords";
import { singularUnit, unitFor } from "./units";
import type { Servings } from "./types";

export interface PlanServings {
  /** "8 servings", "2 loaves"; empty when neither the entry nor the recipe has a number. */
  text: string;
  /** Factor for the recipe's amounts. */
  factor: number;
}

/** Same unit (either plural form, any letter case), or both generic servings words ("Portionen", "servings", "Stück", "Personen"). */
function related(entryUnit: string, recipeUnit: string): boolean {
  const a = entryUnit.trim();
  const b = recipeUnit.trim();
  if (!b || isYieldUnit(b)) return isYieldUnit(a);
  return singularUnit(a.toLowerCase()) === singularUnit(b.toLowerCase());
}

/**
 * What an entry (`count` and `unit` as written) means for a recipe's yield.
 * Text: the entry's number with the entry's unit; a bare number or none takes the recipe's unit (and number).
 * A generic word is shown in the interface's language, a unit with a known plural ("loaf" → "loaves") in the form for the number.
 * Factor: entry number / recipe number if the units are the same or both generic, or the entry has a bare number;
 * generic against concrete ("8 servings" for "1 loaf") cannot be related: the recipe as written (1).
 */
export function planServings(
  entry: { count?: number; unit?: string },
  recipe: Servings | undefined,
  lang: Lang = language(),
): PlanServings {
  const count = entry.count ?? recipe?.count;
  if (!count) return { text: "", factor: 1 };
  const written = entry.count !== undefined ? (entry.unit?.trim() ?? "") : "";
  const unit = written || (recipe?.unit ?? "").trim();
  const shown = isYieldUnit(unit) || !unit ? servingsUnitText(unit, count, lang) : unitFor(unit, count);
  const text = servingsText({ count, unit: shown }, 1, lang, true);
  // Without a number in the entry, or without a recipe amount, the recipe stays as written.
  if (entry.count === undefined || !recipe?.count) return { text, factor: 1 };
  const fits = !written || related(written, recipe.unit);
  return { text, factor: fits ? entry.count / recipe.count : 1 };
}
