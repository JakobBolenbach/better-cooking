// Buttons of an import card: "Lauf ansehen", "Sync now", "Nochmal", "Entfernen".
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useState } from "preact/hooks";
import type { Job } from "../types";
import { jobFailed, retryGuard } from "../processor";
import { noteName } from "../parse";
import { failureNotesOf } from "../importFailure";
import { tr } from "../i18n";
import { failedText } from "../failedText";
import { Icon } from "./icons";
import { useTick } from "./shared";
import { removable, type JobActions } from "./jobActions";
import { RemoveButton } from "./removeButton";
import { SyncButton, type SyncProp } from "./syncButton";

/**
 * "Nochmal": a failed job can be retried at once; a running one only after two minutes and after a question,
 * because its run cannot be stopped (retryGuard).
 */
function RetryButton({ a, onRetry }: { a: Job; onRetry: () => Promise<void> }) {
  const [sending, setSending] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string>();
  const guard = retryGuard(a, useTick());
  const run = () =>
    void (async () => {
      setAsking(false);
      setSending(true);
      setError(undefined);
      try {
        await onRetry();
      } catch (e) {
        setError(failedText(e));
      } finally {
        setSending(false);
      }
    })();
  if (asking)
    return (
      <span class="rz-auftrag-frage" role="alertdialog" aria-label={tr("retryAsk")}>
        <span class="rz-leise">{tr("retryAsk")}</span>
        <button type="button" class="rz-knopf rz-knopf-klein" onClick={run}>
          {tr("retryAskYes")}
        </button>
        <button type="button" class="rz-knopf rz-knopf-klein" onClick={() => setAsking(false)}>
          {tr("cancel")}
        </button>
      </span>
    );
  return (
    <>
      <button
        type="button"
        class="rz-knopf rz-knopf-klein"
        disabled={sending || guard === "wait"}
        onClick={() => (guard === "confirm" ? setAsking(true) : run())}
      >
        {sending ? <Icon n="lader" large={14} className="rz-dreht" /> : <Icon n="nochmal" large={14} />}
        {tr("retry")}
      </button>
      {guard === "wait" && <span class="rz-leise">{tr("retryWaitHint")}</span>}
      {error && (
        <span class="rz-leise" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

/** "Lauf ansehen" (Claude session), "Sync now", "Nochmal" and, for a failed job with a note, "Entfernen". */
export function JobButtons(p: { a: Job; actions: JobActions; sync?: SyncProp }) {
  const { a, actions } = p;
  const [removing, setRemoving] = useState(false);
  return (
    <span class="rz-auftrag-knoepfe">
      {a.session && (
        <a class="rz-knopf rz-knopf-klein" href={a.session} target="_blank" rel="noopener">
          <Icon n="extern" large={14} />
          {tr("viewRun")}
        </a>
      )}
      {p.sync?.button && !jobFailed(a) && <SyncButton a={a} run={p.sync.run} />}
      {!removing && <RetryButton a={a} onRetry={() => actions.onRetry(a.id)} />}
      {removable(a, actions) && (
        <RemoveButton
          names={failureNotesOf(a).map((n) => noteName(n.note))}
          onRemove={() => actions.onRemoveFailed?.(a.id)}
          onAsk={setRemoving}
        />
      )}
    </span>
  );
}
