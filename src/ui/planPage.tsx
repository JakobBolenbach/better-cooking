// Meal plan page (issue #65): the plan note as a week, one section per day with small recipe cards.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { addDays, days, readPlanRows, shortDate, weekday, type PlanRow } from "../mealPlan";
import type { PlanEdit } from "../planEdit";
import { todayIso } from "../parse";
import { PageTitle } from "./pageTitle";
import { DaySection } from "./planCard";
import { MoveEntryModal, PickRecipeModal } from "./planModals";
import { PlanFoot, UndoBar, WeekHead } from "./planParts";
import type { PlanUi } from "./planUi";
import { useEditFollow } from "./useEditFollow";
import { usePlanEdits } from "./usePlanEdits";
import { useSwipeSteps } from "./useSwipeSteps";
import { tr } from "../i18n";
import type { RecipeView } from "../types";

/** Today's date, kept current: it changes at midnight and when the view becomes visible again after a night. */
function useToday(root: { current: HTMLElement | null }): string {
  const [today, setToday] = useState(todayIso());
  useEffect(() => {
    const doc = root.current?.ownerDocument ?? activeDocument;
    const win = doc.defaultView ?? window;
    const update = () => setToday(todayIso());
    const timer = win.setInterval(update, 60_000);
    doc.addEventListener("visibilitychange", update);
    return () => {
      win.clearInterval(timer);
      doc.removeEventListener("visibilitychange", update);
    };
  }, []);
  return today;
}

/** The recipe a link target means: by the file name, also when the link has a folder, whatever the case. */
const baseName = (target: string) => target.replace(/^.*\//, "").toLowerCase();

export function PlanPage(p: {
  /** Text of the plan note ("" without a note). */
  text: string;
  /** All recipes (translations too): an entry may link to any of them. */
  recipes: RecipeView[];
  /** The originals, for choosing a recipe. */
  pickable: RecipeView[];
  /** Paths of the recipes matching a text (the App's search index). */
  search: (q: string) => string[];
  ui: PlanUi;
  /** Resolves to true when the note changed. */
  onEdit: (edit: PlanEdit) => Promise<boolean>;
  onAdd: (path: string, date: string) => void;
  onRecipe: (path: string) => void;
  onCook: (path: string) => void;
  /** The 7 days starting on this day go on the shopping list. */
  onShopping: (start: string) => void;
  onExport: () => void;
  onOpenNote: () => void;
  onBack: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const today = useToday(root);
  const [weeks, setWeeks] = useState(0);
  const start = addDays(today, weeks * 7);
  const week = useMemo(() => days(start, 7), [start]);
  const rows = useMemo(() => readPlanRows(p.text), [p.text]);
  const byName = useMemo(() => new Map(p.recipes.map((r) => [r.name.toLowerCase(), r])), [p.recipes]);
  const { said, run } = useEditFollow<PlanEdit>({
    text: p.text,
    count: 0,
    root,
    target: ".rz-plan-fokus",
    onEdit: p.onEdit,
  });
  const edits = usePlanEdits({ rows, ui: p.ui, run });
  // Swipe sideways (touch and pen) for the next or previous week.
  useSwipeSteps(list, (d) => setWeeks((w) => w + (d === "next" ? 1 : -1)));

  const { dialog, undo } = p.ui;
  return (
    <div class="rz-uebersicht rz-einkauf rz-plan" ref={root}>
      <PageTitle title={tr("pagePlan")} noteLabel={tr("planOpenNote")} onBack={p.onBack} onOpenNote={p.onOpenNote} />
      <div class="rz-sr" role="status" aria-live="polite" aria-atomic="true">
        {said}
      </div>
      <WeekHead week={week} current={weeks === 0} onShift={(n) => setWeeks(weeks + n)} onToday={() => setWeeks(0)} />
      <div class="rz-plan-tage-liste" ref={list}>
        {week.map((d) => (
          <DaySection
            key={d}
            date={d}
            isToday={d === today}
            rows={rows.filter((r) => r.date === d)}
            recipeOf={(row: PlanRow) => byName.get(baseName(row.target))}
            onAdd={() => p.ui.setDialog({ kind: "add", date: d })}
            onServings={edits.servings}
            onMove={(r, title) => p.ui.setDialog({ kind: "move", date: r.date, raw: r.raw, nth: r.nth, title })}
            onRemove={(r, title) => void edits.remove(r, title)}
            onRecipe={p.onRecipe}
            onCook={p.onCook}
          />
        ))}
      </div>
      {undo && <UndoBar undo={undo} onUndo={edits.undo} />}
      <PlanFoot nextSeven={weeks === 0} onShopping={() => p.onShopping(start)} onExport={p.onExport} />

      {dialog?.kind === "add" && (
        <PickRecipeModal
          day={`${weekday(dialog.date)}, ${shortDate(dialog.date)}`}
          recipes={p.pickable}
          search={p.search}
          onPick={(path) => {
            p.onAdd(path, dialog.date);
            p.ui.setDialog(null);
          }}
          onCloseView={() => p.ui.setDialog(null)}
        />
      )}
      {dialog?.kind === "move" && (
        <MoveEntryModal
          title={dialog.title}
          current={dialog.date}
          days={week}
          today={today}
          onPick={(to) => {
            const row = rows.find((r) => r.date === dialog.date && r.raw === dialog.raw && r.nth === dialog.nth);
            if (row) edits.move(row, dialog.title, to);
            p.ui.setDialog(null);
          }}
          onCloseView={() => p.ui.setDialog(null)}
        />
      )}
    </div>
  );
}
