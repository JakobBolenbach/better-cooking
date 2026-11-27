// Parts of the meal plan page (issue #65): a day with its recipe cards, and the card with its servings control.
import { rowKey, shortDate, weekday, type PlanRow } from "../mealPlan";
import { nextServing } from "../quantities";
import { planServings } from "../planServings";
import { Icon } from "./icons";
import { Image } from "./shared";
import { tr } from "../i18n";
import type { RecipeView } from "../types";

export interface CardActions {
  onServings: (row: PlanRow, recipe: RecipeView | undefined, count: number, which: "less" | "more") => void;
  onMove: (row: PlanRow, title: string) => void;
  onRemove: (row: PlanRow, title: string) => void;
  onRecipe: (path: string) => void;
  onCook: (path: string) => void;
}

export function DaySection(
  p: {
    date: string;
    isToday: boolean;
    rows: PlanRow[];
    recipeOf: (row: PlanRow) => RecipeView | undefined;
    onAdd: () => void;
  } & CardActions,
) {
  const day = `${weekday(p.date)}, ${shortDate(p.date)}`;
  return (
    <section
      class={`rz-plan-tag-abschnitt${p.isToday ? " heute" : ""}`}
      aria-current={p.isToday ? "date" : undefined}
      data-key={`day:${p.date}`}
    >
      <div class="rz-plan-tag-kopf">
        <h2 class="rz-plan-tag-titel rz-plan-fokus" tabIndex={-1}>
          {weekday(p.date)} <span class="rz-leise">{shortDate(p.date)}</span>
          {p.isToday && <span class="rz-pille rz-plan-heute-pille">{tr("today")}</span>}
        </h2>
        <button type="button" class="rz-symbol" aria-label={tr("planAddFor", { day })} onClick={p.onAdd}>
          <Icon n="plus" large={20} />
        </button>
      </div>
      {p.rows.length === 0 ? (
        <p class="rz-plan-leer">{tr("planNothing")}</p>
      ) : (
        <ul class="rz-plan-karten">
          {p.rows.map((r) => (
            <Card key={rowKey(r)} row={r} recipe={p.recipeOf(r)} {...p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Stepper(p: {
  title: string;
  count: number;
  base: number;
  label: string;
  onChange: (count: number, which: "less" | "more") => void;
}) {
  return (
    <div class="rz-plan-portionen">
      <button
        type="button"
        class="rz-symbol rz-plan-less"
        aria-label={tr("planLessFor", { title: p.title })}
        onClick={() => p.onChange(nextServing(p.count, -1, p.base), "less")}
      >
        <Icon n="minus" large={16} />
      </button>
      <span>{p.label}</span>
      <button
        type="button"
        class="rz-symbol rz-plan-more"
        aria-label={tr("planMoreFor", { title: p.title })}
        onClick={() => p.onChange(nextServing(p.count, 1, p.base), "more")}
      >
        <Icon n="plus" large={16} />
      </button>
    </div>
  );
}

function Card(p: { row: PlanRow; recipe?: RecipeView } & CardActions) {
  const { row, recipe } = p;
  const title = recipe?.title ?? row.target.replace(/^.*\//, "");
  // The unit written in the entry wins; an entry without a number of servings shows the recipe's own.
  const count = row.servings ?? recipe?.servings?.count;
  const shown = planServings({ count: row.servings, unit: row.unit }, recipe?.servings);
  const base = recipe?.servings?.count ?? count ?? 1;
  const open = () => recipe && p.onRecipe(recipe.path);
  return (
    <li class={`rz-plan-karte${recipe ? "" : " fehlt"}`} data-key={rowKey(row)}>
      {/* The picture is no second stop for the keyboard: the title opens the recipe. */}
      <button
        type="button"
        class="rz-plan-bild-knopf"
        tabIndex={-1}
        aria-hidden="true"
        disabled={!recipe}
        onClick={open}
      >
        <Image src={recipe?.imageSrc} alt="" className="rz-plan-bild" />
      </button>
      <div class="rz-plan-info">
        <button type="button" class="rz-plan-titel rz-plan-fokus" disabled={!recipe} onClick={open}>
          {title}
        </button>
        {!recipe && <span class="rz-leise">{tr("planMissing")}</span>}
        {count !== undefined && (
          <Stepper
            title={title}
            count={count}
            base={base}
            label={shown.text}
            onChange={(n, which) => p.onServings(row, recipe, n, which)}
          />
        )}
      </div>
      <div class="rz-plan-aktionen">
        {recipe && recipe.steps.length > 0 && (
          <button
            type="button"
            class="rz-symbol"
            aria-label={tr("planCookFor", { title })}
            onClick={() => p.onCook(recipe.path)}
          >
            <Icon n="flamme" large={18} />
          </button>
        )}
        <button
          type="button"
          class="rz-symbol"
          aria-label={tr("planMoveFor", { title })}
          onClick={() => p.onMove(row, title)}
        >
          <Icon n="kalender" large={18} />
        </button>
        <button
          type="button"
          class="rz-symbol"
          aria-label={tr("planRemoveFor", { title })}
          onClick={() => p.onRemove(row, title)}
        >
          <Icon n="papierkorb" large={18} />
        </button>
      </div>
    </li>
  );
}
