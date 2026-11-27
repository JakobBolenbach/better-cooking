// The recipe editor (issue #131, part 2 of #118): a full-screen dialog for title, yield, times, category, ingredients,
// steps and tips. The dialog only collects a draft (src/ui/useRecipeDraft.ts); what is written, and only the parts that
// changed, is decided by src/recipeEdit.ts and done by the host (src/recipeEditService.ts).
import type { MutableRef } from "preact/hooks";
import { Modal } from "./shared";
import { EditGroups, rowsFor } from "./editGroups";
import { EditSteps } from "./editSteps";
import { EditFields } from "./editFields";
import { EditFooter } from "./editFooter";
import { useEditorFlow } from "./useEditorFlow";
import { useRecipeDraft } from "./useRecipeDraft";
import type { EditApi, Saved } from "./editApi";
import { tr } from "../i18n";
import type { RecipeView } from "../types";

function Tips(p: { value: string; onChange: (v: string) => void }) {
  return (
    <section class="rz-edit-block" aria-labelledby="rz-edit-tipps">
      <h3 id="rz-edit-tipps" class="rz-edit-kopf">
        {tr("editTips")}
      </h3>
      <label class="rz-feld">
        <span class="rz-feld-name">{tr("editTipsHint")}</span>
        <textarea
          rows={rowsFor(p.value)}
          value={p.value}
          autocapitalize="sentences"
          onInput={(e) => p.onChange((e.target as HTMLTextAreaElement).value)}
        />
      </label>
    </section>
  );
}

export function RecipeEditor(p: {
  r: RecipeView;
  api: EditApi;
  /** Existing categories, for the suggestions of the category field. */
  categories: string[];
  /** The recipe has translations: they do not change with it. */
  translations: boolean;
  /** The App asks it before Esc closes the dialog: true if the editor handled it (it asks about unsaved changes). */
  guard: MutableRef<(() => boolean) | null>;
  /** Reports whether there are unsaved changes (a page change waits for them). */
  onDirty?: (dirty: boolean) => void;
  onSaved: (saved: Saved) => void;
  onCloseView: () => void;
}) {
  const d = useRecipeDraft();
  const f = useEditorFlow({ ...p, path: p.r.path }, d);
  const ready = !!d.base;
  const { state, set } = d;
  const footer = (
    <EditFooter
      d={d}
      asking={f.asking}
      saving={f.saving}
      ready={ready}
      problem={f.problem}
      keepButton={f.keepButton}
      cancelButton={f.cancelButton}
      onKeep={() => f.setAsking(false)}
      onDiscard={p.onCloseView}
      onCancel={f.requestClose}
      onSave={() => void f.save()}
    />
  );
  return (
    <Modal title={tr("editRecipe")} id="rz-edit-titel" full onCloseView={f.requestClose} footer={footer}>
      {f.loadError && (
        <div class="rz-hinweis rz-hinweis-warn" role="alert">
          {f.loadError}
        </div>
      )}
      {!ready && !f.loadError && <p class="rz-leise">{tr("editLoading")}</p>}
      {ready && (
        <>
          {p.translations && <p class="rz-leise rz-edit-hinweis">{tr("editTranslations")}</p>}
          <EditFields d={d} categories={p.categories} />
          <EditGroups groups={state.groups} nextId={d.nextId} onChange={(groups) => set({ groups })} />
          <EditSteps steps={state.steps} nextId={d.nextId} onChange={(steps) => set({ steps })} />
          <Tips value={state.tips} onChange={(tips) => set({ tips })} />
        </>
      )}
    </Modal>
  );
}
