// The pages besides the overview and what the host gives them (shopping list, meal plan). App renders `SubPage` for
// them, so a new page adds its props here and a branch in `SubPage`, not in App.
import type { PlanEdit } from "../planEdit";
import type { ShoppingEdit } from "../shoppingEdit";
import type { RecipeView } from "../types";
import type { PlanDialog } from "./pages";
import { PlanPage } from "./planPage";
import { ShoppingPage } from "./shoppingPage";
import type { ShoppingUi } from "./shoppingUi";

/** What the host (Obsidian view or preview) gives the pages: the notes' text, the changes and the notes themselves. */
export interface SubPageProps {
  /** Text of the shopping list note ("" without one), and what the page changes in it (src/shoppingEdit.ts). */
  shopping: string;
  /** Resolves to false when the note could not be changed. */
  onShoppingEdit: (edit: ShoppingEdit) => Promise<boolean>;
  /** The notes themselves, for power users. */
  onOpenShoppingNote: () => void;
  onOpenPlanNote: () => void;
  /** Text of the meal plan note, and what the page changes in it (src/planEdit.ts); adding goes through `onPlan`. */
  plan: string;
  /** Resolves to true when the note changed. */
  onPlanEdit: (edit: PlanEdit) => Promise<boolean>;
  /** The week starting on this day to the shopping list. */
  onPlanShopping: (start: string) => void;
  onPlanExport: () => void;
  /** Plans a recipe on a day for a factor of its servings; `onPage`: from the meal plan page. */
  onPlan: (path: string, date: string, factor: number, onPage?: boolean) => void;
}

/** What the App holds for the pages and gives them. */
export interface SubPageState {
  /** All recipes, the originals (for choosing) and the search over them. */
  recipes: RecipeView[];
  originals: RecipeView[];
  searchPaths: (q: string) => string[];
  shoppingUi: ShoppingUi;
  planDialog: PlanDialog | null;
  onPlanDialog: (d: PlanDialog | null) => void;
  onRecipe: (path: string) => void;
  onCook: (path: string) => void;
  onBack: () => void;
}

export function SubPage(p: { page: "shopping" | "plan" } & SubPageProps & SubPageState) {
  if (p.page === "shopping")
    return (
      <ShoppingPage
        text={p.shopping}
        onEdit={p.onShoppingEdit}
        ui={p.shoppingUi}
        onOpenNote={p.onOpenShoppingNote}
        onBack={p.onBack}
      />
    );
  return (
    <PlanPage
      text={p.plan}
      recipes={p.recipes}
      pickable={p.originals}
      search={p.searchPaths}
      dialog={p.planDialog}
      onDialog={p.onPlanDialog}
      onEdit={p.onPlanEdit}
      onAdd={(path, date) => p.onPlan(path, date, 1, true)}
      onRecipe={p.onRecipe}
      onCook={p.onCook}
      onShopping={p.onPlanShopping}
      onExport={p.onPlanExport}
      onOpenNote={p.onOpenPlanNote}
      onBack={p.onBack}
    />
  );
}
