// "Fetch again" (issue #63) and the review of an improvement proposal (ADR 0007): reads the source, shows what would
// change, and only writes after confirmation. Feedback has its own dialog (src/ui/feedbackModal.tsx).
import { useEffect } from "preact/hooks";
import { Modal } from "./shared";
import { Icon } from "./icons";
import { ApplyButton, ChangeList, Loading, Warning } from "./changeList";
import { useChanges, type Done } from "./useChanges";
import { tr } from "../i18n";
import { hostOf } from "../source";
import { canRefetch, type Preview } from "../refetch";
import type { Part } from "../fingerprint";
import type { RecipeView } from "../types";

export { changeText } from "./changeList";

/** What the host (the plugin, or the preview) offers for "Fetch again". */
export interface RefetchApi {
  preview: (path: string, useAi?: boolean) => Promise<Preview>;
  cancel: (path: string) => void;
  apply: (path: string, replace: Part[]) => Promise<Done>;
}

/** The toolbar action: only where `canRefetch` allows it (imported note, source is a recipe page, no translation). */
export const refetchAction = (r: RecipeView, available: boolean, open: () => void) =>
  available && canRefetch(r).ok ? { onClick: open } : undefined;

export function RefetchModal(p: {
  r: RecipeView;
  /** The dialog for an improvement proposal (ADR 0007): the same changes and hand-edit choices, other texts. */
  improve?: boolean;
  /** Proposal dialog: "Discard" deletes the proposal and closes the job. */
  onDiscard?: () => Promise<{ ok: boolean; message?: string }>;
  onPreview: (useAi?: boolean) => Promise<Preview>;
  onApply: (replace: Part[]) => Promise<Done>;
  onCancel: () => void;
  onCloseView: () => void;
}) {
  const can = p.improve ? ({ ok: true } as const) : canRefetch(p.r);
  const s = useChanges({ path: p.r.path, startLoading: can.ok, onCancel: p.onCancel, onCloseView: p.onCloseView });
  const { preview } = s;
  const read = (useAi?: boolean) => s.read(() => p.onPreview(useAi));
  useEffect(() => {
    if (can.ok) read();
  }, [p.r.path]);
  const host = hostOf(p.r.source ?? "", p.r.source ?? "");
  const blocked = !can.ok ? tr(can.reason) : preview && !preview.ok ? preview.message : undefined;
  return (
    <Modal
      title={tr(p.improve ? "improveTitle" : "refetchTitle")}
      onCloseView={p.onCloseView}
      id="rz-neu-holen-titel"
      footer={
        <>
          <button type="button" class="rz-knopf" onClick={p.onCloseView}>
            {tr("cancel")}
          </button>
          {p.onDiscard && (
            <button type="button" class="rz-knopf" disabled={s.acting} onClick={() => void s.act(p.onDiscard!)}>
              <Icon n="x" large={16} />
              {tr("improveDiscard")}
            </button>
          )}
          <ApplyButton
            label={tr(p.improve ? "improveApply" : "refetchApply")}
            busyLabel={tr(p.improve ? "improveApplying" : "refetchApplying")}
            acting={s.acting}
            disabled={!s.changes.length || s.keptAll || s.acting}
            // The note changed since it was read: read it again; the button stays locked until then.
            onClick={() => void s.act(() => p.onApply(s.replace), read)}
          />
        </>
      }
    >
      <p class="rz-leise">{p.improve ? tr("improveIntro") : tr("refetchIntro", { host })}</p>
      {!p.improve && <p class="rz-leise">{tr("refetchContract")}</p>}
      {/* One live region that stays in the page, so changes of state are announced. */}
      <div aria-live="polite" class="rz-neu-holen-stand">
        {s.loading && <Loading />}
        {preview?.ok && (
          <ChangeList preview={preview} replace={s.replace} onReplace={s.setReplace} improve={p.improve} />
        )}
      </div>
      {blocked && <Warning text={blocked} />}
      {preview && !preview.ok && preview.canUseAi && (
        <>
          <p class="rz-leise">{tr("refetchAiNote")}</p>
          <button type="button" class="rz-knopf" onClick={() => read(true)}>
            <Icon n="funken" large={16} />
            {tr("refetchUseAi")}
          </button>
        </>
      )}
      {s.message && <Warning text={s.message} />}
    </Modal>
  );
}
