// Pick one of several days: "Today", "Tomorrow", then the weekday, with the date. For "Add to the meal plan" (recipe
// page) and for moving an entry on the meal plan page.
import { addDays, weekday } from "../mealPlan";
import { formatDate, tr } from "../i18n";

export function DayPicker(p: { days: string[]; today: string; current?: string; onPick: (date: string) => void }) {
  return (
    <div class="rz-plan-tage">
      {p.days.map((d) => (
        <button key={d} type="button" class="rz-plan-tag" disabled={d === p.current} onClick={() => p.onPick(d)}>
          <b>{d === p.today ? tr("today") : d === addDays(p.today, 1) ? tr("tomorrow") : weekday(d)}</b>
          <span class="rz-leise">{formatDate(d)}</span>
        </button>
      ))}
    </div>
  );
}
