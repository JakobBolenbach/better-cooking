// Two notes for the shopping list or the meal plan have entries (issue #76): the page says so and lets the user choose.
// Nothing is merged or deleted; the choice is stored as the path of the setting.
import type { ListFile } from "../listNoteResolve";
import { tr } from "../i18n";

export function ListConflict(p: {
  kind: "shopping" | "plan";
  /** The notes, the one used now first. */
  files: ListFile[];
  onChoose: (path: string) => void;
}) {
  const entries = (n: number) => (n === 1 ? tr("listEntriesOne") : tr("listEntriesMany", { n }));
  return (
    <div
      class="rz-hinweis rz-hinweis-warn"
      role="group"
      aria-label={tr(p.kind === "plan" ? "listConflictPlan" : "listConflictShopping")}
    >
      <p>
        {tr(p.kind === "plan" ? "listConflictPlan" : "listConflictShopping")}{" "}
        {p.files.map((f) => `${f.path} (${entries(f.entries)})`).join(", ")}. {tr("listConflictHint")}
      </p>
      <p>
        {p.files.map((f) => (
          <button key={f.path} type="button" class="rz-knopf rz-knopf-klein" onClick={() => p.onChoose(f.path)}>
            {tr("listConflictUse", { file: f.path })}
          </button>
        ))}
      </p>
    </div>
  );
}
