// The part of the recipe editor's footer that asks which version of a part counts when the note changed meanwhile
// (issue #131). Each row shows the new version as plain text and can be decided either way until the note is saved.
import { tr } from "../i18n";
import { PART_LABEL } from "../recipeEdit";
import type { Conflict, RecipeDraftApi } from "./useRecipeDraft";

export function EditConflicts(p: { conflicts: Conflict[]; choose: RecipeDraftApi["choose"] }) {
  return (
    <>
      {p.conflicts.map((c) => (
        <div class="rz-hinweis rz-hinweis-warn rz-edit-konflikt" role="group" key={c.part}>
          <span>{tr("editChangedPart", { part: tr(PART_LABEL[c.part]) })}</span>
          <details class="rz-edit-neu-fassung">
            <summary>{tr("editShowNew")}</summary>
            <pre>{c.fresh || "–"}</pre>
          </details>
          <span class="rz-edit-knoepfe">
            {c.choice !== "mine" && (
              <button type="button" class="rz-knopf rz-knopf-klein" onClick={() => p.choose(c.part, "mine")}>
                {c.choice === "new" ? tr("editRestoreMine") : tr("editKeepMine")}
              </button>
            )}
            {c.choice !== "new" && (
              <button type="button" class="rz-knopf rz-knopf-klein" onClick={() => p.choose(c.part, "new")}>
                {tr("editTakeNew")}
              </button>
            )}
          </span>
        </div>
      ))}
    </>
  );
}
