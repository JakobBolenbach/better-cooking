// Settings of the plugin that change outside of it (data.json synchronised from another device, #90), the writing of
// data.json, and what the open views do about changed settings. The merge itself is pure: src/settingsMerge.ts.
import type BetterCookingPlugin from "./main";
import { BetterCookingView, VIEW_TYPE } from "./view";
import type { BetterCookingSettingTab } from "./settingsTab";
import { language } from "./i18n";
import type { Settings } from "./settings";
import { applyExternal } from "./settingsMerge";

export class SettingsSync {
  /** The state of data.json this device last read or wrote: the base of the merge. */
  private base: Settings | null = null;
  /** Writes and merges run one after the other, so a save during a merge loses nothing. */
  private chain: Promise<unknown> = Promise.resolve();
  tab: BetterCookingSettingTab | null = null;

  constructor(private plugin: BetterCookingPlugin) {}

  /** The state just read from data.json (at load). */
  setBase(s: Settings) {
    this.base = { ...s };
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.chain.then(job, job);
    this.chain = next.catch(() => undefined);
    return next;
  }

  /** Writes the current settings to data.json (the latest state at the time it runs) and makes them the base. */
  write(): Promise<void> {
    return this.enqueue(async () => {
      const s = this.plugin.settings;
      await this.plugin.saveData(s);
      this.base = s;
    });
  }

  /**
   * data.json was changed by another device (Sync, Git, iCloud) or program: merge it into the settings in memory, so the
   * next save does not overwrite it with an old state (`applyExternal`). Obsidian may also call this after the plugin's
   * own write: the content then equals the settings in memory and nothing happens.
   */
  onExternal(): Promise<void> {
    return this.enqueue(async () => {
      const p = this.plugin;
      let raw: unknown;
      try {
        raw = await p.loadData();
      } catch {
        console.debug("Better Cooking: data.json could not be read");
        return;
      }
      // The snapshots are taken after the read: a save during the read is part of `p.settings`.
      const r = applyExternal(this.base ?? p.settings, p.settings, raw);
      if (!r) return;
      p.settings = r.settings;
      if (r.changed.includes("language")) p.applyLanguage();
      // This device had something the file lacks (a new job, a changed setting): write it, so the others get it too.
      if (r.behind) await p.saveData(r.settings);
      this.base = r.settings;
      if (r.changed.length) {
        this.refreshViews(r.changed, true);
        this.tab?.redrawAfterExternalChange();
      }
    });
  }

  /** Shows changed settings in the open views (`external`: also another recipe folder). */
  refreshViews(keys: string[], external = false) {
    // Another note for the shopping list or meal plan: the pages read the new one.
    const shopping = ["shoppingList", "mealPlan", "noteFormat", "language"].some((k) => keys.includes(k));
    const folder = external && keys.includes("folder");
    for (const leaf of this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (!(leaf.view instanceof BetterCookingView)) continue;
      if (keys.includes("language")) leaf.view.contentEl.setAttribute("lang", language());
      if (folder) void leaf.view.reload();
      else if (shopping) void leaf.view.refreshLists();
      else leaf.view.render();
    }
  }
}
