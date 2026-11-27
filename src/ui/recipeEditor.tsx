// The recipe editor (issue #131, part 2 of #118): a full-screen dialog for title, yield, times, category, ingredients,
// steps and tips. The dialog only collects a draft (src/ui/useRecipeDraft.ts); what is written, and only the parts that
// changed, is decided by src/recipeEdit.ts and done by the host (src/recipeEditService.ts).
import { useEffect, useRef, useState } from "preact/hooks";
import type { MutableRef } from "preact/hooks";
import { Modal } from "./shared";
import { EditGroups, rowsFor } from "./editGroups";
import { EditSteps } from "./editSteps";
import { useRecipeDraft } from "./useRecipeDraft";
import { normalizeDraft, type EditPart, type Issue, type RecipeDraft } from "../recipeEdit";
import { tr, type Key } from "../i18n";
import type { RecipeView } from "../types";

export type SaveResult =
  | { ok: true; parts: EditPart[] }
  /** `conflict`: another device changed a part meanwhile; the draft stays and "Reload" offers the new text. */
  | { ok: false; conflict: boolean; message: string; issues?: Issue[] };

/** What the host (the plugin, or the preview) offers for editing. */
export interface EditApi {
  open: (path: string) => Promise<{ ok: true; base: RecipeDraft } | { ok: false; message: string }>;
  save: (path: string, base: RecipeDraft, draft: RecipeDraft) => Promise<SaveResult>;
}

const ISSUE: Record<Issue["code"], Key> = {
  title: "editIssueTitle",
  time: "editIssueTime",
  groupName: "editIssueGroupName",
  ingredients: "editIssueIngredients",
  steps: "editIssueSteps",
  stepText: "editIssueStepText",
};

/** The number of steps before and after a save: the remembered step of cooking mode no longer fits if it changed. */
export interface Saved {
  stepsBefore: number;
  stepsAfter: number;
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
  const { r, api } = p;
  const d = useRecipeDraft();
  const [loadError, setLoadError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<{ text: string; conflict: boolean }>();
  const alive = useRef(true);
  const path = useRef(r.path);
  path.current = r.path;

  const load = () => {
    setLoadError(undefined);
    void api.open(path.current).then((a) => {
      if (!alive.current) return;
      if (a.ok) {
        d.load(a.base);
        setProblem(undefined);
        setAsking(false);
      } else setLoadError(a.message);
    });
  };
  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    p.onDirty?.(d.dirty);
  }, [d.dirty]);
  useEffect(() => () => p.onDirty?.(false), []);

  const requestClose = () => {
    if (saving) return;
    if (d.dirty) setAsking(true);
    else p.onCloseView();
  };
  p.guard.current = () => {
    if (saving) return true;
    if (!d.dirty) return false;
    setAsking(true);
    return true;
  };
  useEffect(() => () => void (p.guard.current = null), []);

  const save = async () => {
    const base = d.base;
    if (!base || saving || !d.dirty || d.issues.length) return;
    setSaving(true);
    setProblem(undefined);
    const res = await api.save(path.current, base, d.draft);
    if (!alive.current) return;
    setSaving(false);
    if (res.ok)
      p.onSaved({ stepsBefore: normalizeDraft(base).steps.length, stepsAfter: normalizeDraft(d.draft).steps.length });
    else if (res.message) setProblem({ text: res.message, conflict: res.conflict });
  };
  const ready = !!d.base;
  const { state, set } = d;
  const timeBad = d.issues.some((i) => i.code === "time");

  const footer = asking ? (
    <div class="rz-edit-fuss">
      <p class="rz-edit-frage" role="alert">
        {tr("editDiscardAsk")}
      </p>
      <div class="rz-edit-knoepfe">
        <button type="button" class="rz-knopf" onClick={() => setAsking(false)}>
          {tr("editKeepEditing")}
        </button>
        <button type="button" class="rz-knopf rz-knopf-gefahr" onClick={p.onCloseView}>
          {tr("editDiscard")}
        </button>
      </div>
    </div>
  ) : (
    <div class="rz-edit-fuss">
      {problem && (
        <div class="rz-hinweis rz-hinweis-warn" role="alert">
          <span>{problem.text}</span>
          {problem.conflict && (
            <button type="button" class="rz-knopf rz-knopf-klein" onClick={load}>
              {tr("editReload")}
            </button>
          )}
        </div>
      )}
      {d.issues.length > 0 && (
        <ul class="rz-edit-fehler" role="alert">
          {d.issues.map((i) => (
            <li key={i.code}>{tr(ISSUE[i.code], "max" in i ? { max: i.max } : undefined)}</li>
          ))}
        </ul>
      )}
      <div class="rz-edit-knoepfe">
        <button type="button" class="rz-knopf" onClick={requestClose}>
          {tr("cancel")}
        </button>
        <button
          type="button"
          class="rz-knopf rz-knopf-haupt"
          disabled={!ready || !d.dirty || d.issues.length > 0 || saving}
          onClick={() => void save()}
        >
          {saving ? tr("editSaving") : tr("save")}
        </button>
      </div>
    </div>
  );

  return (
    <Modal title={tr("editRecipe")} id="rz-edit-titel" full onCloseView={requestClose} footer={footer}>
      {loadError && (
        <div class="rz-hinweis rz-hinweis-warn" role="alert">
          {loadError}
        </div>
      )}
      {!ready && !loadError && <p class="rz-leise">{tr("editSaving")}</p>}
      {ready && (
        <>
          {p.translations && <p class="rz-leise rz-edit-hinweis">{tr("editTranslations")}</p>}
          <label class="rz-feld">
            <span class="rz-feld-name">{tr("editFieldTitle")}</span>
            <input
              type="text"
              value={state.title}
              aria-invalid={d.issues.some((i) => i.code === "title")}
              enterkeyhint="next"
              onInput={(e) => set({ title: (e.target as HTMLInputElement).value })}
            />
          </label>
          <label class="rz-feld">
            <span class="rz-feld-name">{tr("editFieldYield")}</span>
            <input
              type="text"
              value={state.result}
              placeholder={tr("editYieldHint")}
              enterkeyhint="next"
              onInput={(e) => set({ result: (e.target as HTMLInputElement).value })}
            />
          </label>
          <div class="rz-edit-zeiten">
            {(["timeActive", "timeTotal"] as const).map((k) => (
              <label class="rz-feld" key={k}>
                <span class="rz-feld-name">{tr(k === "timeActive" ? "editActive" : "editTotal")}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={state[k]}
                  aria-invalid={timeBad}
                  enterkeyhint="next"
                  onInput={(e) => set({ [k]: (e.target as HTMLInputElement).value })}
                />
              </label>
            ))}
          </div>
          {d.base?.categoryList ? (
            <div class="rz-feld">
              <span class="rz-feld-name">{tr("editCategory")}</span>
              <p class="rz-leise">{tr("editCategoryList", { list: d.base.categoryList.join(", ") })}</p>
            </div>
          ) : (
            <label class="rz-feld">
              <span class="rz-feld-name">{tr("editCategory")}</span>
              <input
                type="text"
                list="rz-edit-kategorien"
                value={state.category}
                enterkeyhint="next"
                onInput={(e) => set({ category: (e.target as HTMLInputElement).value })}
              />
              <datalist id="rz-edit-kategorien">
                {p.categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
          )}
          <EditGroups groups={state.groups} nextId={d.nextId} onChange={(groups) => set({ groups })} />
          <EditSteps steps={state.steps} nextId={d.nextId} onChange={(steps) => set({ steps })} />
          <section class="rz-edit-block" aria-labelledby="rz-edit-tipps">
            <h3 id="rz-edit-tipps" class="rz-edit-kopf">
              {tr("editTips")}
            </h3>
            <label class="rz-feld">
              <span class="rz-feld-name">{tr("editTipsHint")}</span>
              <textarea
                rows={rowsFor(state.tips)}
                value={state.tips}
                autocapitalize="sentences"
                onInput={(e) => set({ tips: (e.target as HTMLTextAreaElement).value })}
              />
            </label>
          </section>
        </>
      )}
    </Modal>
  );
}
