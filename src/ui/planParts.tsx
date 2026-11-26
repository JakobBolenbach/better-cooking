// Parts of the meal plan page (issue #65) around the days: the week header, the bar for putting a removed entry back,
// and the foot with the actions for the shown days.
import { shortDate } from "../mealPlan";
import { Icon } from "./icons";
import type { PlanUndo } from "./pages";
import { tr } from "../i18n";

export function WeekHead(p: {
  week: string[];
  current: boolean;
  onShift: (weeks: number) => void;
  onToday: () => void;
}) {
  return (
    <div class="rz-plan-woche-kopf">
      <button type="button" class="rz-symbol" aria-label={tr("planPrevWeek")} onClick={() => p.onShift(-1)}>
        <Icon n="links" large={22} />
      </button>
      <span class="rz-plan-bereich" aria-live="polite">
        {shortDate(p.week[0])} – {shortDate(p.week[6])}
      </span>
      <button type="button" class="rz-symbol" aria-label={tr("planNextWeek")} onClick={() => p.onShift(1)}>
        <Icon n="rechts" large={22} />
      </button>
      {!p.current && (
        <button type="button" class="rz-chip rz-plan-heute" onClick={p.onToday}>
          {tr("planThisWeek")}
        </button>
      )}
    </div>
  );
}

/** Stays until the next action (or Esc); no announcement of its own, the edit already announced the removal. */
export function UndoBar(p: { undo: PlanUndo; onUndo: () => void }) {
  return (
    <div class="rz-plan-rueckgaengig" data-key="undo">
      <span>{tr("planRemovedUndo", { title: p.undo.title })}</span>
      <button
        type="button"
        class="rz-knopf rz-knopf-klein"
        aria-label={tr("planUndoFor", { title: p.undo.title })}
        onClick={p.onUndo}
      >
        {tr("planUndo")}
      </button>
    </div>
  );
}

export function PlanFoot(p: { nextSeven: boolean; onShopping: () => void; onExport: () => void }) {
  return (
    <div class="rz-plan-fuss">
      <button type="button" class="rz-knopf rz-knopf-haupt" onClick={p.onShopping}>
        <Icon n="wagen" large={18} />
        {tr(p.nextSeven ? "planShopNext" : "planShopDays")}
      </button>
      <button type="button" class="rz-knopf rz-knopf-klein" onClick={p.onExport}>
        <Icon n="kalender" large={15} />
        {tr("planExportButton")}
      </button>
    </div>
  );
}
