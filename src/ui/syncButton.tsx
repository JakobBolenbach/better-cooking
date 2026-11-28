// The button "Pull now" on an import card and the line that says what came of it (issue #82, #115).
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useEffect, useId, useRef, useState } from "preact/hooks";
import type { Job } from "../types";
import { processorName } from "../processor";
import { syncOutcome, type SyncOutcome, type SyncPhase, type SyncReport, type SyncRun } from "../importSync";
import { tr } from "../i18n";
import { failedText } from "../failedText";
import { Icon } from "./icons";

export type SyncProp = { run: SyncRun; button: boolean };

/** How long the result of "Pull now" stays on the card. */
const RESULT_MS = 30_000;

/**
 * The button "Pull now" (the pull of Obsidian Git). While the command runs (a short, fixed window) it says "Pulling"
 * and does not react; then it is usable again while "Waiting for the recipe" shows (a press pulls again and extends
 * the watch). When the watch ends the line says what came of it (processor probably still working, pull not run,
 * recipe already there); a found note says nothing here, the notice and the changed card do.
 */
export function SyncButton({ a, run }: { a: Job; run: SyncRun }) {
  const [phase, setPhase] = useState<SyncPhase | null>(null);
  const [result, setResult] = useState<{ text: string; ms: number } | null>(null);
  const press = useRef(0);
  const alive = useRef(true);
  const hintId = useId();
  useEffect(() => () => void (alive.current = false), []);
  useEffect(() => {
    if (!result) return;
    const t = window.setTimeout(() => setResult(null), result.ms);
    return () => window.clearTimeout(t);
  }, [result]);
  const text = (o: SyncOutcome, r: SyncReport): { text: string; ms: number } | null => {
    const github = a.processor === "github";
    const by: Record<SyncOutcome, string | null> = {
      found: null,
      already: tr("syncAlready"),
      waiting: github
        ? tr("syncResultWaitingGithub")
        : tr("syncResultWaiting", { processor: processorName(a.processor) }),
      lock: tr("syncNotRunLock", { s: r.retryIn ?? 1 }),
      offline: tr("syncNotRunOffline"),
      unavailable: tr("syncNotRunMissing"),
      other: tr("syncNotRunOther"),
    };
    const t = by[o];
    // The line about the lock goes away when a new try is possible.
    return t ? { text: t, ms: o === "lock" ? (r.retryIn ?? 1) * 1000 : RESULT_MS } : null;
  };
  const tap = async () => {
    if (phase === "pulling") return;
    const mine = ++press.current;
    const live = () => alive.current && press.current === mine;
    setResult(null);
    setPhase("pulling");
    try {
      const r = await run((p) => alive.current && setPhase(p));
      if (live()) setResult(text(syncOutcome(r, a.id), r));
    } catch (e) {
      if (live()) setResult({ text: failedText(e), ms: RESULT_MS });
    } finally {
      if (live()) setPhase(null);
    }
  };
  const pulling = phase === "pulling";
  return (
    <span class="rz-auftrag-sync" aria-busy={phase !== null}>
      <button
        type="button"
        class="rz-knopf rz-knopf-klein"
        aria-disabled={pulling}
        title={tr("syncNowHint")}
        aria-describedby={hintId}
        onClick={() => void tap()}
      >
        <Icon n={pulling ? "lader" : "herunter"} large={14} className={pulling ? "rz-dreht" : undefined} />
        {pulling ? tr("syncing") : tr("syncNow")}
      </button>
      <span id={hintId} hidden>
        {tr("syncNowHint")}
      </span>
      <span role="status" class="rz-leise rz-auftrag-ergebnis">
        {phase === "waiting" && (
          <>
            <Icon n="lader" large={12} className="rz-dreht" /> {tr("syncWaiting")}
          </>
        )}
        {phase === null && result?.text}
      </span>
    </span>
  );
}

/** Without Obsidian Git there is no button: this says how the recipe arrives instead. */
export const NoGitHint = ({ improving }: { improving?: boolean }) => (
  <span class="rz-karte-grund">{tr(improving ? "syncByOwnImproving" : "syncByOwn")}</span>
);
