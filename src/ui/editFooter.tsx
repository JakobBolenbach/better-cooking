// The footer of the recipe editor (issue #131): messages, conflicts and checks above the buttons, or the question
// whether to discard unsaved changes. It lies outside the scrolling part of the dialog, so it is always in view.
import type { Ref } from "preact";
import { tr, type Key } from "../i18n";
import type { Issue } from "../recipeEdit";
import { EditConflicts } from "./editConflicts";
import type { RecipeDraftApi } from "./useRecipeDraft";

export const ISSUE_KEY: Record<Issue["code"], Key> = {
  title: "editIssueTitle",
  time: "editIssueTime",
  groupName: "editIssueGroupName",
  servings: "editIssueServings",
  format: "editIssueFormat",
  ingredients: "editIssueIngredients",
  steps: "editIssueSteps",
  stepText: "editIssueStepText",
};

export interface FooterProps {
  d: RecipeDraftApi;
  asking: boolean;
  saving: boolean;
  ready: boolean;
  problem?: string;
  keepButton: Ref<HTMLButtonElement>;
  cancelButton: Ref<HTMLButtonElement>;
  onKeep: () => void;
  onDiscard: () => void;
  onCancel: () => void;
  onSave: () => void;
}

function Question(p: FooterProps) {
  return (
    <div class="rz-edit-fuss">
      <p class="rz-edit-frage" role="alert">
        {tr("editDiscardAsk")}
      </p>
      <div class="rz-edit-knoepfe">
        <button type="button" class="rz-knopf" ref={p.keepButton} onClick={p.onKeep}>
          {tr("editKeepEditing")}
        </button>
        <button type="button" class="rz-knopf rz-knopf-gefahr" onClick={p.onDiscard}>
          {tr("editDiscard")}
        </button>
      </div>
    </div>
  );
}

export function EditFooter(p: FooterProps) {
  if (p.asking) return <Question {...p} />;
  const { d } = p;
  const waiting = d.conflicts.some((c) => c.choice === "open");
  return (
    <div class="rz-edit-fuss">
      {p.problem && (
        <div class="rz-hinweis rz-hinweis-warn" role="alert">
          <span>{p.problem}</span>
        </div>
      )}
      <EditConflicts conflicts={d.conflicts} choose={d.choose} />
      {waiting && <p class="rz-leise rz-edit-hinweis">{tr("editDecideFirst")}</p>}
      {d.issues.length > 0 && (
        <ul class="rz-edit-fehler" role="alert">
          {d.issues.map((i) => (
            <li key={i.code}>{tr(ISSUE_KEY[i.code], "max" in i ? { max: i.max } : undefined)}</li>
          ))}
        </ul>
      )}
      <div class="rz-edit-knoepfe">
        <button type="button" class="rz-knopf" ref={p.cancelButton} onClick={p.onCancel}>
          {tr("cancel")}
        </button>
        <button
          type="button"
          class="rz-knopf rz-knopf-haupt"
          disabled={!p.ready || !d.dirty || d.issues.length > 0 || p.saving || waiting}
          onClick={p.onSave}
        >
          {p.saving ? tr("editSaving") : tr("save")}
        </button>
      </div>
    </div>
  );
}
