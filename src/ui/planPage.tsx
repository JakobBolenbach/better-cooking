// Meal plan page (issue #65): the plan note as a week, one section per day with small recipe cards.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useMemo, useRef, useState } from "preact/hooks";
import { addDays, days, shortDate, weekday } from "../mealPlan";
import { readPlanRows, type PlanEdit, type PlanRow } from "../planEdit";
import { todayIso } from "../parse";
import { Icon } from "./icons";
import { Image } from "./shared";
import { MoveEntryModal, PickRecipeModal } from "./planModals";
import type { PlanDialog } from "./pages";
import { tr } from "../i18n";
import type { RecipeView } from "../types";

export function PlanPage(p: {
  /** Text of the plan note ("" without a note). */
  text: string;
  recipes: RecipeView[];
  dialog: PlanDialog | null;
  onDialog: (d: PlanDialog | null) => void;
  onEdit: (edit: PlanEdit) => void;
  onAdd: (path: string, date: string) => void;
  onRecipe: (path: string) => void;
  onCook: (path: string) => void;
  /** The week starting on this day goes on the shopping list. */
  onShopping: (start: string) => void;
  onExport: () => void;
  onOpenNote: () => void;
  onBack: () => void;
}) {
  const today = todayIso();
  const [start, setStart] = useState(today);
  const week = useMemo(() => days(start, 7), [start]);
  const rows = useMemo(() => readPlanRows(p.text), [p.text]);
  const byName = useMemo(() => new Map(p.recipes.map((r) => [r.name, r])), [p.recipes]);
  const shift = (n: number) => setStart(addDays(start, n * 7));

  // Swipe sideways (touch and pen) for the next or previous week.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: PointerEvent) => {
    swipe.current = e.pointerType === "mouse" ? null : { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 70 && Math.abs(e.clientY - s.y) < 40) shift(dx < 0 ? 1 : -1);
  };

  const range = `${shortDate(week[0])} – ${shortDate(week[6])}`;
  const dialog = p.dialog;
  return (
    <div class="rz-uebersicht rz-einkauf rz-plan">
      <header class="rz-ue-kopf">
        <div class="rz-ue-titelzeile">
          <button type="button" class="rz-symbol rz-nur-schmal" aria-label={tr("back")} onClick={p.onBack}>
            <Icon n="links" large={22} />
          </button>
          <h1 id="rz-titel" class="rz-ue-titel rz-ek-titel">
            {tr("pagePlan")}
          </h1>
          <button
            type="button"
            class="rz-knopf rz-knopf-klein rz-ek-notiz"
            aria-label={tr("planOpenNote")}
            onClick={p.onOpenNote}
          >
            <Icon n="notiz" large={15} />
            <span class="rz-ek-notiz-text">{tr("planOpenNote")}</span>
          </button>
        </div>
      </header>

      <div class="rz-plan-woche-kopf">
        <button type="button" class="rz-symbol" aria-label={tr("planPrevWeek")} onClick={() => shift(-1)}>
          <Icon n="links" large={22} />
        </button>
        <span class="rz-plan-bereich" aria-live="polite">
          {range}
        </span>
        <button type="button" class="rz-symbol" aria-label={tr("planNextWeek")} onClick={() => shift(1)}>
          <Icon n="rechts" large={22} />
        </button>
        {start !== today && (
          <button type="button" class="rz-chip rz-plan-heute" onClick={() => setStart(today)}>
            {tr("planThisWeek")}
          </button>
        )}
      </div>

      <div class="rz-plan-tage-liste" onPointerDown={onDown} onPointerUp={onUp}>
        {week.map((d) => (
          <DaySection
            key={d}
            date={d}
            isToday={d === today}
            rows={rows.filter((r) => r.date === d)}
            byName={byName}
            onAdd={() => p.onDialog({ kind: "add", date: d })}
            onEdit={p.onEdit}
            onMove={(r, title) => p.onDialog({ kind: "move", date: d, raw: r.raw, title })}
            onRecipe={p.onRecipe}
            onCook={p.onCook}
          />
        ))}
      </div>

      <div class="rz-plan-fuss">
        <button type="button" class="rz-knopf rz-knopf-haupt" onClick={() => p.onShopping(start)}>
          <Icon n="wagen" large={18} />
          {tr("planShopWeek")}
        </button>
        <button type="button" class="rz-knopf rz-knopf-klein" onClick={p.onExport}>
          <Icon n="kalender" large={15} />
          {tr("planExportButton")}
        </button>
      </div>

      {dialog?.kind === "add" && (
        <PickRecipeModal
          day={`${weekday(dialog.date)}, ${shortDate(dialog.date)}`}
          recipes={p.recipes}
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
            p.onEdit({ kind: "move", date: dialog.date, raw: dialog.raw, to });
            p.onDialog(null);
          }}
          onCloseView={() => p.onDialog(null)}
        />
      )}
    </div>
  );
}

function DaySection(p: {
  date: string;
  isToday: boolean;
  rows: PlanRow[];
  byName: Map<string, RecipeView>;
  onAdd: () => void;
  onEdit: (edit: PlanEdit) => void;
  onMove: (row: PlanRow, title: string) => void;
  onRecipe: (path: string) => void;
  onCook: (path: string) => void;
}) {
  return (
    <section class={`rz-plan-tag-abschnitt${p.isToday ? " heute" : ""}`} aria-current={p.isToday ? "date" : undefined}>
      <div class="rz-plan-tag-kopf">
        <h2 class="rz-plan-tag-titel">
          {weekday(p.date)} <span class="rz-leise">{shortDate(p.date)}</span>
          {p.isToday && <span class="rz-pille rz-plan-heute-pille">{tr("today")}</span>}
        </h2>
        <button type="button" class="rz-symbol" aria-label={tr("planAddRecipe")} onClick={p.onAdd}>
          <Icon n="plus" large={20} />
        </button>
      </div>
      {p.rows.length === 0 ? (
        <p class="rz-plan-leer">{tr("planNothing")}</p>
      ) : (
        <ul class="rz-plan-karten">
          {p.rows.map((r) => (
            <Card
              key={r.raw}
              row={r}
              recipe={p.byName.get(r.target)}
              onEdit={p.onEdit}
              onMove={(title) => p.onMove(r, title)}
              onRecipe={p.onRecipe}
              onCook={p.onCook}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Card(p: {
  row: PlanRow;
  recipe?: RecipeView;
  onEdit: (edit: PlanEdit) => void;
  onMove: (title: string) => void;
  onRecipe: (path: string) => void;
  onCook: (path: string) => void;
}) {
  const { row, recipe } = p;
  const title = recipe?.title ?? row.target;
  // An entry without a number of servings shows the recipe's own.
  const count = row.servings ?? recipe?.servings?.count;
  const set = (n: number) =>
    p.onEdit({ kind: "servings", date: row.date, raw: row.raw, count: Math.min(99, Math.max(1, n)) });
  return (
    <li class={`rz-plan-karte${recipe ? "" : " fehlt"}`}>
      <button
        type="button"
        class="rz-plan-bild-knopf"
        aria-label={title}
        disabled={!recipe}
        onClick={() => recipe && p.onRecipe(recipe.path)}
      >
        <Image src={recipe?.imageSrc} alt="" className="rz-plan-bild" />
      </button>
      <div class="rz-plan-info">
        <button
          type="button"
          class="rz-plan-titel"
          disabled={!recipe}
          onClick={() => recipe && p.onRecipe(recipe.path)}
        >
          {title}
        </button>
        {!recipe && <span class="rz-leise">{tr("planMissing")}</span>}
        {count !== undefined && (
          <div class="rz-plan-portionen">
            <button
              type="button"
              class="rz-symbol"
              aria-label={tr("planLess")}
              onClick={() => set(Math.round(count) - 1)}
            >
              <Icon n="minus" large={16} />
            </button>
            <span>{count === 1 ? tr("planServingsOne") : tr("planServingsCount", { n: count })}</span>
            <button
              type="button"
              class="rz-symbol"
              aria-label={tr("planMore")}
              onClick={() => set(Math.round(count) + 1)}
            >
              <Icon n="plus" large={16} />
            </button>
          </div>
        )}
      </div>
      <div class="rz-plan-aktionen">
        {recipe && recipe.steps.length > 0 && (
          <button
            type="button"
            class="rz-symbol"
            aria-label={`${tr("cook")}: ${title}`}
            onClick={() => p.onCook(recipe.path)}
          >
            <Icon n="flamme" large={18} />
          </button>
        )}
        <button type="button" class="rz-symbol" aria-label={tr("planMove")} onClick={() => p.onMove(title)}>
          <Icon n="kalender" large={18} />
        </button>
        <button
          type="button"
          class="rz-symbol"
          aria-label={tr("planRemove")}
          onClick={() => p.onEdit({ kind: "remove", date: row.date, raw: row.raw })}
        >
          <Icon n="papierkorb" large={18} />
        </button>
      </div>
    </li>
  );
}
