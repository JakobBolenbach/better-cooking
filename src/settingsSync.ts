// Settings of the plugin that change outside of it (data.json synchronised from another device, #90) and what the
// open views do about changed settings. The merge itself is pure: src/settingsMerge.ts.
import type BetterCookingPlugin from "./main";
import { BetterCookingView, VIEW_TYPE } from "./view";
import { language } from "./i18n";
import type { Settings } from "./settings";
import { applyExternal, emptyRemoved, trackRemoved } from "./settingsMerge";

export class SettingsSync {
  /** Removed here since loading; does not come back from an external data.json. */
  private removed = emptyRemoved();

  constructor(private plugin: BetterCookingPlugin) {}

  /** Call at every change of the settings (`save`). */
  track(before: Settings, after: Settings) {
    trackRemoved(this.removed, before, after);
  }

  /**
   * data.json was changed by another device (Sync, Git, iCloud) or program: merge it into the settings in memory, so the
   * next save does not overwrite it with an old state (`applyExternal`). Obsidian may also call this after the plugin's
   * own write: the content then equals the settings in memory and nothing happens.
   */
  async onExternal() {
    const p = this.plugin;
    const r = applyExternal(p.settings, await p.loadData(), this.removed);
    if (!r.changed.length && !r.behind) return;
    p.settings = r.settings;
    if (r.changed.includes("language")) p.applyLanguage();
    // This device had something the file lacks (a new job): write it back, so the other device gets it too.
    if (r.behind) await p.saveData(r.settings);
    if (r.changed.length) this.refreshViews(r.changed, true);
  }

  /** Shows changed settings in the open views (`external`: also another recipe folder). */
  refreshViews(keys: string[], external = false) {
    // Another note for the shopping list or meal plan: the pages read the new one.
    const shopping = ["shoppingList", "mealPlan", "noteFormat", "language"].some((k) => keys.includes(k));
    const folder = external && ["folder", "extraProperties"].some((k) => keys.includes(k));
    for (const leaf of this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (!(leaf.view instanceof BetterCookingView)) continue;
      if (keys.includes("language")) leaf.view.contentEl.setAttribute("lang", language());
      if (folder) void leaf.view.reload();
      else if (shopping) void leaf.view.refreshLists();
      else leaf.view.render();
    }
  }
}
