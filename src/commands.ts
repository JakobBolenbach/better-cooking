// Commands of the plugin (command palette); each one opens a page or a note, or starts a list action.
import type { Plugin } from "obsidian";
import type { ListNotes } from "./listNotes";
import type { Page } from "./ui/pages";
import { tr } from "./i18n";

type Host = Plugin & {
  lists: ListNotes;
  open(start?: { importRecipe?: boolean; page?: Page }): Promise<void>;
};

export function registerCommands(p: Host) {
  p.addCommand({ id: "open-recipes", name: tr("openRecipes"), callback: () => void p.open() });
  p.addCommand({
    id: "import-recipe",
    name: tr("fetchRecipeCommand"),
    callback: () => void p.open({ importRecipe: true }),
  });
  p.addCommand({
    id: "shopping-list",
    name: tr("openShoppingList"),
    callback: () => void p.open({ page: "shopping" }),
  });
  p.addCommand({
    id: "shopping-list-note",
    name: tr("openShoppingNote"),
    callback: () => void p.lists.openShoppingList(),
  });
  p.addCommand({
    id: "shopping-list-clear",
    name: tr("clearShoppingList"),
    callback: () => void p.lists.clearShoppingList(),
  });
  p.addCommand({
    id: "meal-plan",
    name: tr("openMealPlan"),
    callback: () => void p.open({ page: "plan" }),
  });
  p.addCommand({
    id: "meal-plan-note",
    name: tr("openMealPlanNote"),
    callback: () => void p.lists.openMealPlan(),
  });
  p.addCommand({
    id: "meal-plan-shopping",
    name: tr("planToShopping"),
    callback: () => void p.lists.planToShoppingList(),
  });
  p.addCommand({
    id: "meal-plan-ics",
    name: tr("planExport"),
    callback: () => void p.lists.exportMealPlan(),
  });
}
