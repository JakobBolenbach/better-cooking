// Pages of the view besides the overview (the start page). The navigation (sidebar, list sheet) is built from
// SUBPAGES, so a new page only needs an entry here and a branch where App renders the page.
import type { IconName } from "./icons";
import type { Key } from "../i18n";

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
