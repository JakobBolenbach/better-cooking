// The dialogs of an open recipe: plan, translate, share (one at a time, chosen on the recipe page).
import { useEffect, useRef } from "preact/hooks";
import { PlanModal } from "./planModal";
import { ShareModal } from "./shareModal";
import { TranslateModal } from "./translateModal";
import { RefetchModal, type RefetchApi } from "./refetchModal";
import { FeedbackModal } from "./feedbackModal";
import type { FeedbackApi } from "./feedbackPanel";
import { DeleteModal, type DeleteApi } from "./deleteModal";
import { RecipeEditor } from "./recipeEditor";
import type { EditApi, Saved } from "./editApi";
import type { ImproveApi } from "./improveBanner";
import type { MutableRef } from "preact/hooks";
import type { RecipeView, Status } from "../types";

/** "menu" is the menu of the toolbar (it draws nothing here, the toolbar does). */
export type RecipeDialog =
  "plan" | "translate" | "share" | "refetch" | "delete" | "edit" | "menu" | "improve" | "feedback";

export function RecipeDialogs(p: {
  dialog: RecipeDialog | null;
  r: RecipeView;
  factor: number;
  canPrint: boolean;
  onHint: (text: string) => void;
  onPlan: (path: string, date: string, factor: number) => void;
  onTranslate?: (path: string, language: string) => Promise<{ ok: boolean; message?: string; path?: string }>;
  refetch?: RefetchApi;
  feedback?: FeedbackApi;
  improve?: ImproveApi;
  deleteRecipe?: DeleteApi;
  /** The recipe editor, with what the App needs to know of it (see RecipeEditor). */
  edit?: { api: EditApi; categories: string[]; translations: boolean; guard: MutableRef<(() => boolean) | null> };
  onEditDirty?: (dirty: boolean) => void;
  onEdited?: (path: string, saved: Saved) => void;
  onStatus: (path: string, s: Status) => void;
  /** The recipe is gone: back to the overview. */
  onDeleted: (paths: string[]) => void;
  onOpen: (path: string) => void;
  /** Switches to another dialog of the same recipe ("Edit by hand" in the feedback dialog). */
  onDialog?: (dialog: RecipeDialog) => void;
  onClose: () => void;
}) {
  const { r, factor } = p;
  // A translation can finish after the dialog was closed or another recipe was opened: then drop the result.
  const current = useRef({ mounted: true, path: r.path });
  current.current.path = r.path;
  useEffect(() => {
    current.current.mounted = true;
    return () => {
      current.current.mounted = false;
    };
  }, []);
  if (p.dialog === "plan")
    return (
      <PlanModal r={r} factor={factor} onPlan={(date) => p.onPlan(r.path, date, factor)} onCloseView={p.onClose} />
    );
  if (p.dialog === "share")
    return <ShareModal r={r} factor={factor} canPrint={p.canPrint} onHint={p.onHint} onCloseView={p.onClose} />;
  if (p.dialog === "refetch" && p.refetch) {
    const api = p.refetch;
    return (
      <RefetchModal
        r={r}
        onPreview={(useAi) => api.preview(r.path, useAi)}
        onApply={(replace) => api.apply(r.path, replace)}
        onCancel={() => api.cancel(r.path)}
        onCloseView={p.onClose}
      />
    );
  }
  if (p.dialog === "feedback" && p.refetch && p.feedback) {
    const api = p.refetch;
    const { onDialog } = p;
    return (
      <FeedbackModal
        r={r}
        api={p.feedback}
        onEdit={p.edit && onDialog ? () => onDialog("edit") : undefined}
        onApply={(replace) => api.apply(r.path, replace)}
        onCancel={() => api.cancel(r.path)}
        onCloseView={p.onClose}
      />
    );
  }
  if (p.dialog === "improve" && p.improve) {
    const api = p.improve;
    return (
      <RefetchModal
        r={r}
        improve
        onDiscard={() => api.discard(r.path)}
        onPreview={() => api.preview(r.path)}
        onApply={(replace) => api.apply(r.path, replace)}
        onCancel={() => api.cancel(r.path)}
        onCloseView={p.onClose}
      />
    );
  }
  if (p.dialog === "edit" && p.edit)
    return (
      <RecipeEditor
        r={r}
        {...p.edit}
        onDirty={p.onEditDirty}
        onSaved={(saved) => {
          p.onEdited?.(r.path, saved);
          p.onClose();
        }}
        onCloseView={p.onClose}
      />
    );
  if (p.dialog === "delete" && p.deleteRecipe)
    return (
      <DeleteModal
        r={r}
        api={p.deleteRecipe}
        onDiscard={() => {
          p.onStatus(r.path, "verworfen");
          p.onClose();
        }}
        onDeleted={p.onDeleted}
        onCloseView={p.onClose}
      />
    );
  if (p.dialog === "translate" && p.onTranslate) {
    const translate = p.onTranslate;
    return (
      <TranslateModal
        r={r}
        onTranslate={async (language) => {
          const res = await translate(r.path, language);
          if (res.ok && current.current.mounted && current.current.path === r.path) {
            p.onClose();
            if (res.path) p.onOpen(res.path);
          }
          return res;
        }}
        onCloseView={p.onClose}
      />
    );
  }
  return null;
}
