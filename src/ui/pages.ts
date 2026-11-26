// Pages of the view besides the overview (the start page). The navigation (sidebar, list sheet) is built from
// SUBPAGES, so a new page only needs an entry here and a branch where App renders the page.
import type { IconName } from "./icons";
import type { Key } from "../i18n";
import type { EscapeLayer } from "./keyboard";

export type Page = "overview" | "shopping" | "plan";

export interface SubPage {
  id: Exclude<Page, "overview">;
  icon: IconName;
  label: Key;
}

export const SUBPAGES: SubPage[] = [
  { id: "shopping", icon: "wagen", label: "pageShopping" },
  { id: "plan", icon: "kalender", label: "pagePlan" },
];

/** Ask the view to show a page (a notice button, a command). A new `id` is a new request. */
export interface GoTo {
  page: Page;
  id: number;
}

/** The dialog open on the meal plan page: pick a recipe for a day, or pick another day for an entry. */
export type PlanDialog = { kind: "add"; date: string } | { kind: "move"; date: string; raw: string; title: string };

/**
 * Layers a page change closes: everything that lies above a page, because the page has to be visible afterwards
 * (a recipe, cooking mode, the attempt dialog, the lists sheet, the import dialog, the dialog of the meal plan page, and
 * the question and opened item of the shopping list). "dialog" belongs to the recipe and goes with it. Timers are no layer: they run on and
 * stay in their bar.
 */
export const CLOSED_BY_PAGE_CHANGE: readonly EscapeLayer[] = [
  "attempt",
  "planDialog",
  "view",
  "import",
  "cooking",
  "recipe",
  "ask",
  "details",
];

/** The page of a request that was not shown yet; `handled` is the id of the last one shown. */
export function pendingGoTo(handled: number, goto: GoTo | undefined): Page | null {
  return goto && goto.id > handled ? goto.page : null;
}
