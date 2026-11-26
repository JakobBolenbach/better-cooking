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
export type PlanDialog =
  { kind: "add"; date: string } | { kind: "move"; date: string; raw: string; nth: number; title: string };

/** A removed entry the page offers to put back: its lines, where it was, and its name for the announcement. */
export interface PlanUndo {
  date: string;
  lines: string[];
  after?: { raw: string; nth: number };
  title: string;
}

/**
 * Layers a page change closes: everything that lies above a page, because the page has to be visible afterwards
 * (a recipe, cooking mode, the attempt dialog, the lists sheet, the import dialog, the dialog of the meal plan page, and
 * the question and opened item of the shopping list). "dialog" belongs to the recipe and goes with it. Timers are no layer: they run on and
 * stay in their bar.
 */
export const CLOSED_BY_PAGE_CHANGE: readonly EscapeLayer[] = [
  "attempt",
  "view",
  "import",
  "cooking",
  "recipe",
  "ask",
  "details",
  "planDialog",
  "undo",
];

/**
 * Does a dialog stop a page change? Only a dialog that is shown and has text the user typed (a note of an attempt, a link
 * to import) does; any other dialog just closes with the change. A dialog for a recipe that is gone is not shown.
 */
export function blocksPageChange(o: {
  attempt: { open: boolean; recipeExists: boolean; dirty: boolean };
  import: { open: boolean; dirty: boolean };
}): boolean {
  return (o.attempt.open && o.attempt.recipeExists && o.attempt.dirty) || (o.import.open && o.import.dirty);
}

/** A remembered step of cooking mode is offered again for this long (ms), within the session. */
export const RESUME_MS = 3 * 60 * 60 * 1000;

/** The step to continue at: the remembered one while it is recent, kept inside the recipe's steps; otherwise the first. */
export function resumeAt(saved: { step: number; at: number } | undefined, now: number, stepCount: number): number {
  if (!saved || now - saved.at > RESUME_MS || stepCount < 1) return 0;
  return Math.max(0, Math.min(saved.step, stepCount - 1));
}

/** The page of a request that was not shown yet; `handled` is the id of the last one shown. */
export function pendingGoTo(handled: number, goto: GoTo | undefined): Page | null {
  return goto && goto.id > handled ? goto.page : null;
}
