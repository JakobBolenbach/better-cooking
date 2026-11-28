// What "Pull now" does after a press (#163), without Obsidian: run the pull, then watch the vault for the note. Obsidian
// Git reports no end, so the phase "pulling" lasts a fixed short window after the command; after that the button is
// usable again while the watch goes on. Everything that touches the app is injected, so tests need no timer.
import {
  MANUAL_GAP_MS,
  SYNC_POLL_MS,
  SYNC_WAIT_MS,
  type NotRunReason,
  type SyncPhase,
  type SyncReport,
} from "./importSync";

export interface PullDeps {
  /** Open jobs without a note, asked when no watch runs (may throw). */
  watched(): string[];
  /** Runs the pull command (or says why not). */
  attempt(): { ran: boolean; reason?: NotRunReason };
  /** For the report "already": jobs with a recipe, jobs with a failure note. */
  settled(): { done: ReadonlySet<string>; failed: ReadonlySet<string> };
  /** Jobs whose note is there (may throw). */
  arrived(): ReadonlySet<string>;
  /** Seconds until the lock after the last pull ends. */
  lockSeconds(): number;
  now(): number;
  sleep(ms: number): Promise<void>;
  signal?: AbortSignal;
}

interface Watch {
  jobs: readonly string[];
  phase: SyncPhase;
  windowEnd: number;
  deadline: number;
  listeners: Set<(p: SyncPhase) => void>;
  result: Promise<SyncReport>;
}

/** A sleep that an AbortSignal cuts short; the abort listener goes away when the timer ends. */
export function abortableSleep(signal: AbortSignal): (ms: number) => Promise<void> {
  return (ms) =>
    new Promise<void>((resolve) => {
      const stop = () => {
        window.clearTimeout(timer);
        resolve();
      };
      const timer = window.setTimeout(() => {
        signal.removeEventListener("abort", stop);
        resolve();
      }, ms);
      signal.addEventListener("abort", stop, { once: true });
    });
}

export class PullWatch {
  private watch: Watch | null = null;
  constructor(private d: PullDeps) {}

  /** A watch is running. */
  get pulling(): boolean {
    return this.watch !== null;
  }

  /**
   * One press. Without a watch: nothing to wait for (`already`), or pull and start one. Within the window of the last
   * pull: join the watch, no second pull. After the window: pull again and extend the watch. If the pull is locked
   * while a watch runs, the press joins it; without a watch the report says when to try again.
   */
  async press(phase?: (p: SyncPhase) => void): Promise<SyncReport> {
    const d = this.d;
    const w = this.watch;
    if (w && d.now() < w.windowEnd) return this.join(w, phase);
    const jobs = w ? w.jobs : d.watched();
    if (!jobs.length) {
      const s = d.settled();
      return { ran: false, already: { done: [...s.done], failed: [...s.failed] }, found: [] };
    }
    const r = d.attempt();
    if (!r.ran) {
      // Locked while a watch runs: the pull of the last few seconds is the one being watched. Any other reason is told.
      if (w && r.reason === "lock") return this.join(w, phase);
      const retry = r.reason === "lock" ? { retryIn: d.lockSeconds() } : {};
      return { ran: false, reason: r.reason, ...retry, found: [] };
    }
    const t = d.now();
    if (w) {
      w.windowEnd = t + MANUAL_GAP_MS;
      w.deadline = t + SYNC_WAIT_MS;
      this.set(w, "pulling");
      return this.join(w, phase);
    }
    const fresh: Watch = {
      jobs,
      phase: "pulling",
      windowEnd: t + MANUAL_GAP_MS,
      deadline: t + SYNC_WAIT_MS,
      listeners: new Set(),
      result: Promise.resolve({ ran: true, found: [] }),
    };
    this.watch = fresh;
    fresh.result = this.observe(fresh).finally(() => {
      if (this.watch === fresh) this.watch = null;
    });
    return this.join(fresh, phase);
  }

  private join(w: Watch, phase?: (p: SyncPhase) => void): Promise<SyncReport> {
    if (phase) {
      w.listeners.add(phase);
      phase(w.phase);
    }
    return w.result;
  }

  private set(w: Watch, p: SyncPhase) {
    w.phase = p;
    for (const f of w.listeners) f(p);
  }

  private async observe(w: Watch): Promise<SyncReport> {
    const d = this.d;
    for (;;) {
      await d.sleep(SYNC_POLL_MS);
      if (d.signal?.aborted) return { ran: true, found: [] };
      const found = [...d.arrived()].filter((id) => w.jobs.includes(id));
      const t = d.now();
      if (w.phase === "pulling" && t >= w.windowEnd) this.set(w, "waiting");
      if (found.length) return { ran: true, found };
      if (t >= w.deadline) return { ran: true, found: [] };
    }
  }
}
