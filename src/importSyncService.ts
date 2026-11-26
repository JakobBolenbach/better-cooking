// Asks the Git plugin of the vault to sync while an import waits (rules: src/importSync.ts). Another plugin's command
// runs only from a fixed list, only for a job that this device started and only while it waits.
import type { App } from "obsidian";
import type BetterCookingPlugin from "./main";
import { jobIdsIn, resolveSyncCommand, syncDecision, SYNC_TICK_MS, type SyncTrigger } from "./importSync";

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
  private lastAt = 0;
  private counts: Record<string, number> = {};
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

  /** The button "Sync now": for every open job, with its own short lock. */
  now() {
    this.run("manual");
  }

  /** IDs of jobs whose note is already in the recipe folder (read from the metadata cache, no view needed). */
  private arrived(): Set<string> {
    const { app, settings } = this.plugin;
    const prefix = settings.folder ? `${settings.folder}/` : "";
    const fm = app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(prefix))
      .map((f) => app.metadataCache.getFileCache(f)?.frontmatter);
    return jobIdsIn(fm, ["auftrag", "job", this.plugin.noteFormat().fields.job]);
  }

  private run(trigger: SyncTrigger) {
    const p = this.plugin;
    if (!p.settings.jobs.length) return;
    const now = Date.now();
    const d = syncDecision({
      trigger,
      jobs: p.settings.jobs,
      device: deviceId(p.app),
      enabled: p.settings.syncWhileImporting,
      command: resolveSyncCommand(commandIds(p.app)),
      lastAt: this.lastAt,
      now,
      counts: this.counts,
      arrived: trigger === "manual" ? new Set() : this.arrived(),
    });
    if (!d.run) return;
    let ran = false;
    try {
      ran = commandApi(p.app).executeCommandById?.(d.command) === true;
    } catch {
      // The other plugin failed; no lock, the next tick tries again.
    }
    if (!ran) return;
    this.lastAt = now;
    for (const id of d.jobs) this.counts[id] = (this.counts[id] ?? 0) + 1;
  }
}
