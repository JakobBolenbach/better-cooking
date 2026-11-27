// The button "Sync now" on an import card and the line that says what came of it (issue #82, #115).
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useEffect, useState } from "preact/hooks";
import type { Job } from "../types";
import { processorName } from "../processor";
import { syncOutcome, type SyncOutcome, type SyncReport } from "../importSync";
import { tr } from "../i18n";
import { Icon } from "./icons";

export type SyncProp = { run: () => Promise<SyncReport>; button: boolean };

/** How long the result of "Sync now" stays on the card. */
const RESULT_MS = 30_000;

/**
 * The button "Sync now": while it waits for the vault it is off and says so; then the card says what came of it
 * (recipe here, import failed, processor still working, or the sync did not run).
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
  const text: Record<SyncOutcome, string | null> = {
    found: null,
    waiting: tr("syncResultWaiting", { processor: processorName(a.processor) }),
    lock: tr("syncNotRunLock"),
    offline: tr("syncNotRunOffline"),
    unavailable: tr("syncNotRunMissing"),
    other: tr("syncNotRunOther"),
  };
  const tap = async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult(text[syncOutcome(await run(), a.id)]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span class="rz-auftrag-sync" aria-live="polite">
      <button type="button" class="rz-knopf rz-knopf-klein" disabled={busy} onClick={() => void tap()}>
        <Icon n={busy ? "lader" : "herunter"} large={14} className={busy ? "rz-dreht" : undefined} />
        {busy ? tr("syncing") : tr("syncNow")}
      </button>
      {result && <span class="rz-leise rz-auftrag-ergebnis">{result}</span>}
    </span>
  );
}
