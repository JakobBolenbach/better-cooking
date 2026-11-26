// Dialogs of the meal plan page (issue #65): pick a recipe for a day, pick another day for an entry.
import { useMemo, useState } from "preact/hooks";
import { Modal, Image } from "./shared";
import { Icon } from "./icons";
import { RecipeSearch } from "../search";
import { shortDate, weekday } from "../mealPlan";
import { tr } from "../i18n";
import type { RecipeView } from "../types";

/** Recipes by title; with text the search index finds them. */
export function PickRecipeModal(p: {
  day: string;
  recipes: RecipeView[];
  onPick: (path: string) => void;
  onCloseView: () => void;
}) {
  const [q, setQ] = useState("");
  const index = useMemo(() => {
    const s = new RecipeSearch();
    s.reconcile(p.recipes);
    return s;
  }, [p.recipes]);
  const list = useMemo(() => {
    if (!q.trim()) return [...p.recipes].sort((a, b) => a.title.localeCompare(b.title, "de"));
    const byPath = new Map(p.recipes.map((r) => [r.path, r]));
    return index
      .search(q)
      .map((h) => byPath.get(h.path))
      .filter((r): r is RecipeView => !!r);
  }, [q, index, p.recipes]);
  return (
    <Modal title={tr("planAddTitle", { day: p.day })} onCloseView={p.onCloseView} id="rz-plan-wahl-titel">
      <label class="rz-feld">
        <span class="rz-sr">{tr("planSearchLabel")}</span>
        <input
          type="text"
          autocomplete="off"
          spellcheck={false}
          placeholder={tr("planSearchPlaceholder")}
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        />
      </label>
      {list.length === 0 ? (
        <p class="rz-leise">{tr("planNoMatch")}</p>
      ) : (
        <ul class="rz-plan-wahl">
          {list.map((r) => (
            <li key={r.path}>
              <button type="button" class="rz-plan-wahl-zeile" onClick={() => p.onPick(r.path)}>
                <Image src={r.imageSrc} alt="" className="rz-plan-wahl-bild" />
                <span class="rz-plan-wahl-titel">{r.title}</span>
                <Icon n="plus" large={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export function MoveEntryModal(p: {
  title: string;
  current: string;
  days: string[];
  today: string;
  onPick: (date: string) => void;
  onCloseView: () => void;
}) {
  return (
    <Modal title={tr("planMoveTitle", { title: p.title })} onCloseView={p.onCloseView} id="rz-plan-weg-titel">
      <div class="rz-plan-tage">
        {p.days.map((d) => (
          <button key={d} type="button" class="rz-plan-tag" disabled={d === p.current} onClick={() => p.onPick(d)}>
            <b>{d === p.today ? tr("today") : weekday(d)}</b>
            <span class="rz-leise">{shortDate(d)}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
