// Which recipe needs how much of a shopping list line (issue #66, for the list page).
// The note keeps only `- [ ] 500 g Mehl · A, B`: the amounts per recipe are not stored but calculated again from the
// recipes, so the note stays plain and cannot disagree with the recipes. Pure functions, tested in tests/shoppingShares.test.ts.

import { itemsFromRecipe, mergeItems, type Item } from "./shopping";
import type { IngredientGroup } from "./types";

/** A recipe a list line names, with what is needed to calculate its ingredients again. */
export interface RecipeSource {
  /** Title as written after "·" on the line. */
  recipe: string;
  groups: IngredientGroup[];
  /** Servings factor the recipe was added with (planned servings / recipe servings); 1 if unknown. */
  factor?: number;
  /** Ingredients checked as already there ("group-line"), as for `itemsFromRecipe`. */
  skip?: readonly string[];
}

/** What one recipe needs of a line; `amount` and `unit` as for Item (the unit of the first matching ingredient, or the base unit). */
export interface RecipeShare {
  recipe: string;
  amount?: number;
  unit?: string;
}

/**
 * Per recipe named on the line: the sum of its ingredients that are the item's ingredient and add up with its
 * unit. A recipe without a source is listed without amount; a source whose ingredients no longer contain the item
 * (the recipe was edited) is listed without amount too.
 */
export function recipeShares(item: Item, sources: readonly RecipeSource[]): RecipeShare[] {
  const open = { ...item, checked: false };
  return item.recipes.map((recipe) => {
    const source = sources.find((s) => s.recipe === recipe);
    if (!source) return { recipe };
    let sum: Item | undefined;
    for (const i of itemsFromRecipe(recipe, source.groups, source.factor ?? 1, source.skip)) {
      // Only ingredients that would have been merged into this line.
      if (!mergeItems(open, i)) continue;
      sum = sum ? (mergeItems(sum, i) ?? sum) : i;
    }
    return sum ? { recipe, amount: sum.amount, unit: sum.unit } : { recipe };
  });
}
