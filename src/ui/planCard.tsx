// Parts of the meal plan page (issue #65): a day with its recipe cards, and the card with its servings control.
import { shortDate, weekday, type PlanRow } from "../mealPlan";
import { nextServing, servingsText } from "../quantities";
import { rowKey } from "../mealPlan";
import { Icon } from "./icons";
import { Image } from "./shared";
import { tr } from "../i18n";
import type { RecipeView } from "../types";

/** "4 Portionen", "1 Portion", or in the unit of the recipe ("9 Brötchen", "1 Zopf"). */
export function servingsLabel(count: number, unit?: string): string {
  return !unit && count === 1 ? tr("planServingsOne") : servingsText({ count, unit: unit ?? "" });
}

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

function Card(p: { row: PlanRow; recipe?: RecipeView } & CardActions) {
  const { row, recipe } = p;
  const title = recipe?.title ?? row.target.replace(/^.*\//, "");
  // An entry without a number of servings shows the recipe's own.
  const count = row.servings ?? recipe?.servings?.count;
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
          <div class="rz-plan-portionen">
            <button
              type="button"
              class="rz-symbol rz-plan-less"
              aria-label={tr("planLessFor", { title })}
              onClick={() => p.onServings(row, recipe, nextServing(count, -1, base), "less")}
            >
              <Icon n="minus" large={16} />
            </button>
            <span>{servingsLabel(count, recipe?.servings?.unit)}</span>
            <button
              type="button"
              class="rz-symbol rz-plan-more"
              aria-label={tr("planMoreFor", { title })}
              onClick={() => p.onServings(row, recipe, nextServing(count, 1, base), "more")}
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
