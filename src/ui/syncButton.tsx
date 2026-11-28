// The button "Pull now" on an import card and the line that says what came of it (issue #82, #115).
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useEffect, useState } from "preact/hooks";
import type { Job } from "../types";
import { processorName } from "../processor";
import { syncOutcome, type SyncOutcome, type SyncReport } from "../importSync";
import { tr } from "../i18n";
import { failedText } from "../failedText";
import { Icon } from "./icons";

export type SyncProp = { run: () => Promise<SyncReport>; button: boolean };

/** How long the result of "Pull now" stays on the card. */
const RESULT_MS = 30_000;

/**
 * The button "Pull now" (the pull of Obsidian Git): while it waits for the vault, up to a minute, it is off with a
 * spinner and says so; then the card says what came of it (recipe here, processor probably still working, or the
 * pull did not run).
 */
export function SyncButton({ a, run }: { a: Job; run: () => Promise<SyncReport> }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  useEffect(() => {
    if (!result) return;
    const t = window.setTimeout(() => setResult(null), RESULT_MS);
    return () => window.clearTimeout(t);
  }, [result]);
  // "found" says nothing here: the notice and the changed card do.
  const text = (o: SyncOutcome, r: SyncReport): string | null => {
    const by: Record<SyncOutcome, string | null> = {
      found: null,
      waiting:
        a.processor === "github"
          ? tr("syncResultWaitingGithub")
          : tr("syncResultWaiting", { processor: processorName(a.processor) }),
      lock: tr("syncNotRunLock", { s: r.retryIn ?? 1 }),
      offline: tr("syncNotRunOffline"),
      unavailable: tr("syncNotRunMissing"),
      other: tr("syncNotRunOther"),
    };
    return by[o];
  };
  const tap = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await run();
      setResult(text(syncOutcome(r, a.id), r));
    } catch (e) {
      setResult(failedText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span class="rz-auftrag-sync" aria-live="polite">
      <button
        type="button"
        class="rz-knopf rz-knopf-klein"
        disabled={busy}
        title={tr("syncNowHint")}
        aria-label={`${busy ? tr("syncing") : tr("syncNow")}. ${tr("syncNowHint")}`}
        onClick={() => void tap()}
      >
        <Icon n={busy ? "lader" : "herunter"} large={14} className={busy ? "rz-dreht" : undefined} />
        {busy ? tr("syncing") : tr("syncNow")}
      </button>
      {result && <span class="rz-leise rz-auftrag-ergebnis">{result}</span>}
    </span>
  );
}

/** Without Obsidian Git there is no button: this says how the recipe arrives instead. */
export const NoGitHint = () => <span class="rz-karte-grund">{tr("syncByOwn")}</span>;
