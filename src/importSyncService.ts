// Asks the Git plugin of the vault to sync while an import waits (src/importSync.ts has the rules). Another plugin's
// command runs only while a job that the user started is open, and never faster than SYNC_MIN_GAP_MS.
import type { App } from "obsidian";
import type BetterCookingPlugin from "./main";
import { resolveSyncCommand, syncCandidates, syncDue, syncWanted, SYNC_EVERY_MS } from "./importSync";

interface CommandApi {
  commands?: Record<string, { id: string; name: string }>;
  executeCommandById?(id: string): boolean;
}

/** Obsidian's command list is not public API: narrow cast, and "nothing there" instead of an error. */
function commandApi(app: App): CommandApi {
  return (app as unknown as { commands?: CommandApi }).commands ?? {};
}

/** All commands that exist, for the setting and the check. */
export function allCommands(app: App): { id: string; name: string }[] {
  try {
    return Object.values(commandApi(app).commands ?? {});
  } catch {
    return [];
  }
}

/** Commands whose ID or name mentions pull or sync (choices in the settings). */
export const syncChoices = (app: App) => syncCandidates(allCommands(app));

export class ImportSync {
  private lastAt = 0;
  constructor(private plugin: BetterCookingPlugin) {}

  /** Timer and return to the foreground; both are cleaned up with the plugin. */
  start() {
    const p = this.plugin;
    p.registerInterval(window.setInterval(() => this.run(false), SYNC_EVERY_MS));
    p.registerDomEvent(activeDocument, "visibilitychange", () => {
      if (activeDocument.visibilityState === "visible") this.run(false);
    });
  }

  /** The command that would run now, or null. */
  command(): string | null {
    return resolveSyncCommand(
      this.plugin.settings.syncCommand,
      allCommands(this.plugin.app).map((c) => c.id),
    );
  }

  /** The button "Sync now": same lock, nothing happens when it is too soon. */
  now() {
    this.run(true);
  }

  private run(manual: boolean) {
    const now = Date.now();
    if (!manual && !syncWanted(this.plugin.settings.jobs, now)) return;
    const id = this.command();
    if (!id || !syncDue(this.lastAt, now)) return;
    this.lastAt = now;
    try {
      commandApi(this.plugin.app).executeCommandById?.(id);
    } catch {
      // The other plugin failed; the next request tries again.
    }
  }
}
