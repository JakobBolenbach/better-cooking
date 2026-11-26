// "Add to the meal plan" (issue #11): pick one of the next seven days.
import { Modal } from "./shared";
import { days, weekday } from "../mealPlan";
import { todayIso } from "../parse";
import { servingsText } from "../quantities";
import { formatDate, tr } from "../i18n";
import type { RecipeView } from "../types";

export function PlanModal(p: {
  r: RecipeView;
  factor: number;
  onPlan: (date: string) => void;
  onCloseView: () => void;
}) {
  const list = days(todayIso(), 7);
  const servings = p.r.servings ? servingsText(p.r.servings, p.factor) : undefined;
  return (
    <Modal title={tr("planTitle")} onCloseView={p.onCloseView} id="rz-plan-titel">
      <p class="rz-leise">
        {servings ? tr("planIntro", { title: p.r.title, servings }) : tr("planIntroNoServings", { title: p.r.title })}
      </p>
      <div class="rz-plan-tage">
        {list.map((d, i) => (
          <button
            key={d}
            type="button"
            class="rz-plan-tag"
            onClick={() => {
              p.onPlan(d);
              p.onCloseView();
            }}
          >
            <b>{i === 0 ? tr("today") : i === 1 ? tr("tomorrow") : weekday(d)}</b>
            <span class="rz-leise">{formatDate(d)}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
