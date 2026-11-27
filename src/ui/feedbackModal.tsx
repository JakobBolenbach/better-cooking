// "Something wrong? Fetch again with feedback" (issue #120): the user says what is wrong; nothing is read before the
// click. Own AI: the changes like "Fetch again" and "Update". Claude or GitHub: one button that sends. Nothing set up:
// the way to the editor. The parts are src/ui/feedbackPanel.tsx and src/ui/changeList.tsx.
import { useState } from "preact/hooks";
import { Modal } from "./shared";
import { Icon } from "./icons";
import { ApplyButton, ChangeList, Loading, Warning } from "./changeList";
import { FeedbackPanel, hasFeedback, type FeedbackApi } from "./feedbackPanel";
import { useChanges, type Done } from "./useChanges";
import { tr } from "../i18n";
import { processorName } from "../processor";
import { hostOf } from "../source";
import type { FeedbackWay } from "../feedback";
import type { Part } from "../fingerprint";
import type { RecipeView } from "../types";

function SendButton(p: { processor: "claude" | "github"; disabled: boolean; sending: boolean; onClick: () => void }) {
  return (
    <button type="button" class="rz-knopf rz-knopf-haupt" disabled={p.disabled} onClick={p.onClick}>
      {p.sending ? <Icon n="lader" large={16} className="rz-dreht" /> : <Icon n="rechts" large={16} />}
      {p.sending ? tr("feedbackSending") : tr("feedbackSend", { name: processorName(p.processor) })}
    </button>
  );
}

export function FeedbackModal(p: {
  r: RecipeView;
  api: FeedbackApi;
  /** Opens the editor (nothing set up). */
  onEdit?: () => void;
  onApply: (replace: Part[]) => Promise<Done>;
  onCancel: () => void;
  onCloseView: () => void;
}) {
  const way: FeedbackWay = p.api.way(p.r);
  const [text, setText] = useState("");
  const s = useChanges({ path: p.r.path, startLoading: false, onCancel: p.onCancel, onCloseView: p.onCloseView });
  const { preview } = s;
  const offered = way.via !== "off" ? way : undefined;
  const blocked = !offered ? tr("feedbackOff") : preview && !preview.ok ? preview.message : undefined;
  return (
    <Modal
      title={tr("feedbackTitle")}
      onCloseView={p.onCloseView}
      id="rz-hinweis-titel"
      footer={
        <>
          <button type="button" class="rz-knopf" onClick={p.onCloseView}>
            {tr("cancel")}
          </button>
          {offered?.via === "processor" && (
            <SendButton
              processor={offered.processor}
              disabled={!hasFeedback(text) || s.acting}
              sending={s.acting}
              onClick={() => void s.act(() => p.api.send(p.r.path, text))}
            />
          )}
          {offered?.via === "ai" && (
            <ApplyButton
              label={tr("refetchApply")}
              busyLabel={tr("refetchApplying")}
              acting={s.acting}
              disabled={!s.changes.length || s.keptAll || s.acting}
              // The note changed since it was read: nothing is read again without a click (it costs tokens).
              onClick={() => void s.act(() => p.onApply(s.replace), s.clear)}
            />
          )}
        </>
      }
    >
      {offered && (
        <FeedbackPanel
          way={offered}
          host={hostOf(p.r.source ?? "", p.r.source ?? "")}
          text={text}
          onText={setText}
          busy={s.loading}
          onRead={() => s.read(() => p.api.preview(p.r.path, text))}
          onEdit={p.onEdit}
        />
      )}
      {/* One live region that stays in the page, so changes of state are announced. */}
      <div aria-live="polite" class="rz-neu-holen-stand">
        {s.loading && <Loading />}
        {preview?.ok && <ChangeList preview={preview} replace={s.replace} onReplace={s.setReplace} />}
      </div>
      {blocked && <Warning text={blocked} />}
      {s.message && <Warning text={s.message} />}
    </Modal>
  );
}
