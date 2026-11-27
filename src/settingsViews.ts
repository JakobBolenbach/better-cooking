// What the open views and the settings tab do about changed settings, and the wiring of SettingsSync to the plugin (#90).
import type { WorkspaceLeaf } from "obsidian";
import type BetterCookingPlugin from "./main";
import { BetterCookingView, VIEW_TYPE } from "./view";
import type { BetterCookingSettingTab } from "./settingsTab";
import { language } from "./i18n";
import type { SettingsIo } from "./settingsSync";

/**
 * The tab shows `getDisplayText()` from when it was drawn. Obsidian's `WorkspaceLeaf.updateHeader()` draws it again; it
 * is not in the public typings (and may go away), so it is called only if it exists.
 */
function refreshTabTitle(leaf: WorkspaceLeaf) {
  const l = leaf as WorkspaceLeaf & { updateHeader?: () => void };
  if (typeof l.updateHeader === "function") l.updateHeader();
}

export class SettingsViews {
  tab: BetterCookingSettingTab | null = null;

  constructor(private plugin: BetterCookingPlugin) {}

  /** load, save and memory of the plugin for `SettingsSync`; a merge from outside also applies the language and the views. */
  io(): SettingsIo {
    const p = this.plugin;
    return {
      load: () => p.loadData() as Promise<unknown>,
      save: (s) => p.saveData(s),
      get: () => p.settings,
      set: (s) => {
        p.settings = s;
      },
      changed: (keys) => {
        if (keys.includes("language")) p.applyLanguage();
        this.refresh(keys, true);
        this.tab?.redrawAfterExternalChange();
      },
    };
  }

  /** Shows changed settings in the open views (`external`: also another recipe folder). */
  refresh(keys: string[], external = false) {
    // Another note for the shopping list or meal plan: the pages read the new one.
    const shopping = ["shoppingList", "mealPlan", "noteFormat", "language"].some((k) => keys.includes(k));
    const folder = external && keys.includes("folder");
    for (const leaf of this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (!(leaf.view instanceof BetterCookingView)) continue;
      if (keys.includes("language")) {
        leaf.view.contentEl.setAttribute("lang", language());
        refreshTabTitle(leaf);
      }
      if (folder) void leaf.view.reload();
      else if (shopping) void leaf.view.refreshLists();
      else leaf.view.render();
    }
  }
}
