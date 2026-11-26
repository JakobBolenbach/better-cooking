// Meal plan page (issue #65): the plan note as a week, one section per day with small recipe cards.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { addDays, days, readPlanRows, rowKey, shortDate, weekday, type PlanRow } from "../mealPlan";
import { servingsRaw, type PlanEdit } from "../planEdit";
import { todayIso } from "../parse";
import { Icon } from "./icons";
import { PageTitle } from "./pageTitle";
import { DaySection, servingsLabel } from "./planCard";
import { MoveEntryModal, PickRecipeModal } from "./planModals";
import type { PlanDialog } from "./pages";
import { useEditFollow } from "./useEditFollow";
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
  dialog: PlanDialog | null;
  onDialog: (d: PlanDialog | null) => void;
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
  const recipeOf = (row: PlanRow) => byName.get(baseName(row.target));
  const { said, run } = useEditFollow<PlanEdit>({
    text: p.text,
    count: 0,
    root,
    target: ".rz-plan-fokus",
    onEdit: p.onEdit,
  });
  const [undo, setUndo] = useState<{ date: string; lines: string[]; title: string } | null>(null);
  useEffect(() => {
    if (!undo) return;
    const t = window.setTimeout(() => setUndo(null), 7000);
    return () => window.clearTimeout(t);
  }, [undo]);
  // Swipe sideways (touch and pen) for the next or previous week.
  useSwipeSteps(list, (d) => setWeeks((w) => w + (d === "next" ? 1 : -1)));

  const ref = (r: PlanRow) => ({ date: r.date, raw: r.raw, nth: r.nth });
  const onServings = (r: PlanRow, recipe: RecipeView | undefined, count: number, which: "less" | "more") => {
    const title = recipe?.title ?? r.target;
    const key = rowKey({ ...r, raw: servingsRaw(r.raw, count) });
    void run(
      { kind: "servings", ...ref(r), count },
      {
        focus: { key, target: `.rz-plan-${which}` },
        say: () => tr("planAnnounceServings", { title, servings: servingsLabel(count, recipe?.servings?.unit) }),
      },
    );
  };
  const onMove = (r: PlanRow, title: string, to: string) => {
    const nth = rows.filter((x) => x.date === to && x.raw === r.raw).length;
    void run(
      { kind: "move", ...ref(r), to },
      {
        focus: { key: rowKey({ date: to, raw: r.raw, nth }) },
        say: () => tr("planAnnounceMoved", { title, day: weekday(to) }),
      },
    );
  };
  const onRemove = async (r: PlanRow, title: string) => {
    const after = rows.filter((x) => x.date === r.date && rows.indexOf(x) > rows.indexOf(r))[0];
    // An identical entry before it that goes away moves its number up by one.
    const next = after && rowKey({ ...after, nth: after.nth - (after.raw === r.raw && after.nth > r.nth ? 1 : 0) });
    const changed = await run(
      { kind: "remove", ...ref(r) },
      { focus: next ? { key: next } : { key: `day:${r.date}` }, say: () => tr("planAnnounceRemoved", { title }) },
    );
    if (changed) setUndo({ date: r.date, lines: [r.raw, ...r.hanging], title });
  };
  const onUndo = () => {
    if (!undo) return;
    const { date, lines, title } = undo;
    setUndo(null);
    void run(
      { kind: "restore", date, lines },
      { focus: { key: `day:${date}` }, say: () => tr("planAddedShort", { title }) },
    );
  };

  const dialog = p.dialog;
  return (
    <div class="rz-uebersicht rz-einkauf rz-plan" ref={root}>
      <PageTitle title={tr("pagePlan")} noteLabel={tr("planOpenNote")} onBack={p.onBack} onOpenNote={p.onOpenNote} />
      <div class="rz-sr" role="status" aria-live="polite" aria-atomic="true">
        {said}
      </div>
      <div class="rz-plan-woche-kopf">
        <button type="button" class="rz-symbol" aria-label={tr("planPrevWeek")} onClick={() => setWeeks(weeks - 1)}>
          <Icon n="links" large={22} />
        </button>
        <span class="rz-plan-bereich" aria-live="polite">
          {shortDate(week[0])} – {shortDate(week[6])}
        </span>
        <button type="button" class="rz-symbol" aria-label={tr("planNextWeek")} onClick={() => setWeeks(weeks + 1)}>
          <Icon n="rechts" large={22} />
        </button>
        {weeks !== 0 && (
          <button type="button" class="rz-chip rz-plan-heute" onClick={() => setWeeks(0)}>
            {tr("planThisWeek")}
          </button>
        )}
      </div>

      <div class="rz-plan-tage-liste" ref={list}>
        {week.map((d) => (
          <DaySection
            key={d}
            date={d}
            isToday={d === today}
            rows={rows.filter((r) => r.date === d)}
            recipeOf={recipeOf}
            onAdd={() => p.onDialog({ kind: "add", date: d })}
            onServings={onServings}
            onMove={(r, title) => p.onDialog({ kind: "move", ...ref(r), title })}
            onRemove={(r, title) => void onRemove(r, title)}
            onRecipe={p.onRecipe}
            onCook={p.onCook}
          />
        ))}
      </div>

      {undo && (
        <div class="rz-plan-rueckgaengig" role="status">
          <span>{tr("planRemovedUndo", { title: undo.title })}</span>
          <button type="button" class="rz-knopf rz-knopf-klein" onClick={onUndo}>
            {tr("planUndo")}
          </button>
        </div>
      )}

      <div class="rz-plan-fuss">
        <button type="button" class="rz-knopf rz-knopf-haupt" onClick={() => p.onShopping(start)}>
          <Icon n="wagen" large={18} />
          {tr(weeks === 0 ? "planShopNext" : "planShopDays")}
        </button>
        <button type="button" class="rz-knopf rz-knopf-klein" onClick={p.onExport}>
          <Icon n="kalender" large={15} />
          {tr("planExportButton")}
        </button>
      </div>

      {dialog?.kind === "add" && (
        <PickRecipeModal
          day={`${weekday(dialog.date)}, ${shortDate(dialog.date)}`}
          recipes={p.pickable}
          search={p.search}
          onPick={(path) => {
            p.onAdd(path, dialog.date);
            p.onDialog(null);
          }}
          onCloseView={() => p.onDialog(null)}
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
            if (row) onMove(row, dialog.title, to);
            p.onDialog(null);
          }}
          onCloseView={() => p.onDialog(null)}
        />
      )}
    </div>
  );
}
