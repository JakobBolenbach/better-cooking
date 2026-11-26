// Asks the Git plugin of the vault to sync while an import waits (rules: src/importSync.ts). Another plugin's command
// runs only from a fixed list, only for a job that this device started and only while it waits.
import type { App } from "obsidian";
import type BetterCookingPlugin from "./main";
import {
  afterRun,
  resolveSyncCommand,
  syncDecision,
  SYNC_TICK_MS,
  type SyncState,
  type SyncTrigger,
} from "./importSync";
import { checkJobs } from "./processor";
import { isRecipeFile } from "./folder";
import { readField } from "./noteFormat";
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

  /** The command that would run, or null (setting off, or the Git plugin is not there). */
  command(): string | null {
    return this.plugin.settings.syncWhileImporting ? resolveSyncCommand(commandIds(this.plugin.app)) : null;
  }

  /** The button "Sync now": for every open job, with its own short lock. True if the command really ran. */
  now(): boolean {
    return this.run("manual");
  }

  /**
   * Jobs whose note is already in the recipe folder: the same files as the view reads (recipe files, no list notes) and
   * the same check as `checkJobs` (job ID, or the same source changed after the job), from the metadata cache so no
   * view is needed. Only called when a sync would otherwise run.
   */
  private arrived(): Set<string> {
    const { app, settings, lists } = this.plugin;
    const fields = this.plugin.noteFormat().fields;
    const str = (v: unknown) => (typeof v === "string" ? v : undefined);
    const recipes = app.vault
      .getMarkdownFiles()
      .filter((f) => !lists.isListNote(f.path) && isRecipeFile(f.path, settings.folder))
      .map((f) => {
        const fm = app.metadataCache.getFileCache(f)?.frontmatter ?? {};
        return {
          path: f.path,
          job: str(readField(fm, fields, "job")),
          source: str(readField(fm, fields, "source")),
          modified: f.stat.mtime,
        };
      });
    return new Set(checkJobs(settings.jobs, recipes, keyOf, Date.now()).done.map((d) => d.job.id));
  }

  private run(trigger: SyncTrigger): boolean {
    const p = this.plugin;
    if (!p.settings.jobs.length) return false;
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
    if (!d.run) return false;
    let ran = false;
    try {
      ran = commandApi(p.app).executeCommandById?.(d.command) === true;
    } catch {
      // The other plugin failed; no lock, the next tick tries again.
    }
    this.state = afterRun(this.state, d, ran, now);
    return ran;
  }
}
