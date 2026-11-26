// What the meal plan page does with its entries: change the servings, move, remove (with the offer to put it back).
// Each edit says where the focus goes and what is announced (src/ui/useEditFollow.ts).
import { rowKey, weekday, type PlanRow } from "../mealPlan";
import { servingsRaw, type PlanEdit } from "../planEdit";
import { servingsLabel } from "./planCard";
import type { PlanUi } from "./planUi";
import type { Follow } from "./useEditFollow";
import { tr } from "../i18n";
import type { RecipeView } from "../types";

export function usePlanEdits(o: {
  rows: PlanRow[];
  ui: PlanUi;
  run: (edit: PlanEdit, how: Follow) => Promise<boolean>;
}) {
  const { rows, ui, run } = o;
  const ref = (r: PlanRow) => ({ date: r.date, raw: r.raw, nth: r.nth });
  // Any other edit ends the offer to put a removed entry back.
  const go = (edit: PlanEdit, how: Follow) => {
    ui.setUndo(null);
    return run(edit, how);
  };

  const servings = (r: PlanRow, recipe: RecipeView | undefined, count: number, which: "less" | "more") => {
    const title = recipe?.title ?? r.target;
    void go(
      { kind: "servings", ...ref(r), count },
      {
        focus: { key: rowKey({ ...r, raw: servingsRaw(r.raw, count) }), target: `.rz-plan-${which}` },
        say: () => tr("planAnnounceServings", { title, servings: servingsLabel(count, recipe?.servings?.unit) }),
      },
    );
  };

  const move = (r: PlanRow, title: string, to: string) => {
    const nth = rows.filter((x) => x.date === to && x.raw === r.raw).length;
    void go(
      { kind: "move", ...ref(r), to },
      {
        focus: { key: rowKey({ date: to, raw: r.raw, nth }) },
        say: () => tr("planAnnounceMoved", { title, day: weekday(to) }),
      },
    );
  };

  const remove = async (r: PlanRow, title: string) => {
    const day = rows.filter((x) => x.date === r.date);
    const above = day[day.indexOf(r) - 1];
    // The bar is there before the note changes, so the focus can go to its button.
    ui.setUndo({
      date: r.date,
      lines: [r.raw, ...r.hanging],
      title,
      ...(above ? { after: { raw: above.raw, nth: above.nth } } : {}),
    });
    const changed = await run(
      { kind: "remove", ...ref(r) },
      { focus: { key: "undo", target: "button" }, say: () => tr("planAnnounceRemoved", { title }) },
    );
    if (!changed) ui.setUndo(null);
  };

  const undo = () => {
    const u = ui.undo;
    if (!u) return;
    ui.setUndo(null);
    void run(
      { kind: "restore", date: u.date, lines: u.lines, ...(u.after ? { after: u.after } : {}) },
      { focus: { key: `day:${u.date}` }, say: () => tr("planAddedShort", { title: u.title }) },
    );
  };
  return { servings, move, remove, undo };
}
