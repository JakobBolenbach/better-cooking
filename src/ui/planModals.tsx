// Dialogs of the meal plan page (issue #65): pick a recipe for a day, pick another day for an entry.
import { useMemo, useState } from "preact/hooks";
import { Modal, Image } from "./shared";
import { Icon } from "./icons";
import { DayPicker } from "./dayPicker";
import { locale, tr } from "../i18n";
import type { RecipeView } from "../types";

/** The collection (originals) by title; with text, the paths the search index finds. */
export function PickRecipeModal(p: {
  day: string;
  recipes: RecipeView[];
  /** Paths of the recipes that match a text, best first (the App's search index). */
  search: (q: string) => string[];
  onPick: (path: string) => void;
  onCloseView: () => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    if (!q.trim()) return [...p.recipes].sort((a, b) => a.title.localeCompare(b.title, locale()));
    const byPath = new Map(p.recipes.map((r) => [r.path, r]));
    return p
      .search(q)
      .map((path) => byPath.get(path))
      .filter((r): r is RecipeView => !!r);
  }, [q, p.recipes]);
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
      <DayPicker days={p.days} today={p.today} current={p.current} onPick={p.onPick} />
    </Modal>
  );
}
