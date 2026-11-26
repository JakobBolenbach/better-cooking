// "Add to the meal plan" (issue #11): pick one of the next seven days.
import { Modal } from "./shared";
import { DayPicker } from "./dayPicker";
import { days } from "../mealPlan";
import { todayIso } from "../parse";
import { servingsText } from "../quantities";
import { tr } from "../i18n";
import type { RecipeView } from "../types";

export function PlanModal(p: {
  r: RecipeView;
  factor: number;
  onPlan: (date: string) => void;
  onCloseView: () => void;
}) {
  const today = todayIso();
  const servings = p.r.servings ? servingsText(p.r.servings, p.factor) : undefined;
  return (
    <Modal title={tr("planTitle")} onCloseView={p.onCloseView} id="rz-plan-titel">
      <p class="rz-leise">
        {servings ? tr("planIntro", { title: p.r.title, servings }) : tr("planIntroNoServings", { title: p.r.title })}
      </p>
      <DayPicker
        days={days(today, 7)}
        today={today}
        onPick={(d) => {
          p.onPlan(d);
          p.onCloseView();
        }}
      />
    </Modal>
  );
}
