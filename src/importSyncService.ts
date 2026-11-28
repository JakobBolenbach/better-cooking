// Asks the Git plugin of the vault to sync while an import waits (rules: src/importSync.ts). Another plugin's command
// runs only from a fixed list, only for a job that this device started and only while it waits.
import type { App } from "obsidian";
import type BetterCookingPlugin from "./main";
import {
  afterRun,
  lockSeconds,
  resolveSyncCommand,
  syncDecision,
  SYNC_TICK_MS,
  notRunReason,
  reportAfterSync,
  watchedJobs,
  type NotRunReason,
  type SyncReport,
  type SyncState,
  type SyncTrigger,
} from "./importSync";
import { checkJobs } from "./processor";
import { recipeStubs } from "./recipeStubs";
import { keyOf } from "./source";

interface CommandApi {
  commands?: Record<string, unknown>;
  executeCommandById?(id: string): boolean;
}

const DEVICE_KEY = "better-cooking-device";

/** Obsidian's command list is not public API: narrow cast, and "nothing there" instead of an error. */
const commandApi = (app: App): CommandApi => (app as unknown as { commands?: CommandApi }).commands ?? {};

function commandIds(app: App): string[] {
  try {
    return Object.keys(commandApi(app).commands ?? {});
  } catch {
    return [];
  }
}

/** ID of this device, kept in Obsidian's local storage (not synchronised); null if that is not possible. */
export function deviceId(app: App): string | null {
  try {
    const known: unknown = app.loadLocalStorage(DEVICE_KEY);
    if (typeof known === "string" && known) return known;
    const fresh = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    app.saveLocalStorage(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return null;
  }
}

export class ImportSync {
  private state: SyncState = { lastAt: 0, counts: {} };
  constructor(private plugin: BetterCookingPlugin) {}

  /** Timer and return to the foreground; both are cleaned up with the plugin. */
  start() {
    const p = this.plugin;
    p.registerInterval(window.setInterval(() => this.run("interval"), SYNC_TICK_MS));
    // The main window's document: the one whose visibility says whether Obsidian is in the foreground.
    const doc = window.document;
    p.registerDomEvent(doc, "visibilitychange", () => {
      if (doc.visibilityState === "visible") this.run("foreground");
    });
  }

  /** The pull command if the Git plugin is there, or null. The setting does not matter: it governs automatic pulls only. */
  command(): string | null {
    return resolveSyncCommand(commandIds(this.plugin.app));
  }

  private pulling: Promise<SyncReport> | null = null;

  /**
   * The button "Pull now": runs the pull for every open job, whatever the setting says. Obsidian Git gives no signal
   * when the pull is done, so afterwards the vault is looked at every second for up to a minute (`reportAfterSync`).
   * Only the jobs that were open and without a note before the pull count (a snapshot). A press while a pull of the
   * button is still watched joins it and gets its result. A press right after an automatic pull does not pull again:
   * it says when a new try is possible (or that the note is there).
   */
  now(): Promise<SyncReport> {
    if (!this.pulling) {
      const p = this.pull().finally(() => {
        this.pulling = null;
      });
      this.pulling = p;
    }
    return this.pulling;
  }

  private async pull(): Promise<SyncReport> {
    const watch = watchedJobs(this.plugin.settings.jobs, Date.now(), this.arrived());
    const r = this.attempt("manual");
    if (!r.ran) {
      if (r.reason !== "lock") return { ran: false, reason: r.reason, found: [] };
      const found = [...this.arrived()].filter((id) => watch.includes(id));
      return { ran: false, reason: "lock", retryIn: lockSeconds(this.state.lastAt, Date.now()), found };
    }
    return reportAfterSync(
      () => [...this.arrived()],
      (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
      watch,
    );
  }

  /**
   * Jobs whose note (or failure note) is already in the recipe folder: the same files as the view reads (recipe files, no list notes) and
   * the same check as `checkJobs` (job ID, or the same source changed after the job), from the metadata cache so no
   * view is needed. Only called when a sync would otherwise run.
   */
  private check(): { done: Set<string>; failed: Set<string> } {
    const { settings } = this.plugin;
    const recipes = recipeStubs(this.plugin);
    const r = checkJobs(settings.jobs, recipes, keyOf, Date.now(), this.plugin.improve.proposals());
    return { done: new Set(r.done.map((d) => d.job.id)), failed: new Set(r.failed.map((d) => d.job.id)) };
  }

  /** Jobs that need no more syncing: their note or failure note is there. */
  private arrived(): Set<string> {
    const { done, failed } = this.check();
    return new Set([...done, ...failed]);
  }

  private run(trigger: SyncTrigger): boolean {
    return this.attempt(trigger).ran;
  }

  private attempt(trigger: SyncTrigger): { ran: boolean; reason?: NotRunReason } {
    const p = this.plugin;
    if (!p.settings.jobs.length) return { ran: false, reason: "other" };
    const now = Date.now();
    const d = syncDecision({
      trigger,
      jobs: p.settings.jobs,
      device: deviceId(p.app),
      enabled: p.settings.syncWhileImporting,
      command: resolveSyncCommand(commandIds(p.app)),
      online: navigator.onLine,
      lastAt: this.state.lastAt,
      now,
      counts: this.state.counts,
      arrived: () => this.arrived(),
    });
    if (!d.run) return { ran: false, reason: notRunReason(d.reason) };
    let ran = false;
    try {
      ran = commandApi(p.app).executeCommandById?.(d.command) === true;
    } catch {
      // The other plugin failed; no lock, the next tick tries again.
    }
    this.state = afterRun(this.state, d, ran, now);
    return ran ? { ran } : { ran, reason: notRunReason("failed") };
  }
}
