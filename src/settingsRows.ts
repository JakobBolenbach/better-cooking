// Building blocks of the settings tab (src/settingsTab.ts): row types, recipe folder, secrets, folder suggestions.
import { AbstractInputSuggest, App as ObsidianApp, Notice, normalizePath, Setting, TFolder } from "obsidian";
import type BetterCookingPlugin from "./main";
import { DEFAULT_FOLDER, cleanFolder, folderMissing } from "./folder";
import { tr } from "./i18n";

/** One row: name and description for rendering and search, `render` adds the controls. */
export interface Row {
  name: string;
  desc?: string;
  aliases?: string[];
  visible?: () => boolean;
  render: (s: Setting) => void;
}

export interface Group {
  heading?: string;
  /** Text below the heading. */
  intro?: string;
  rows: Row[];
}

/** What a row needs from the tab: the app, the plugin and a way to update other rows after a change. */
export interface RowContext {
  app: ObsidianApp;
  plugin: BetterCookingPlugin;
  /** Brings all registered descriptions up to date. */
  refresh: () => void;
  /** Registers a function that refresh() calls. */
  onRefresh: (f: () => void) => void;
}

/** Recipe folder with suggestions from the vault; saved when leaving the field, not on every keystroke. */
export function folderRow(ctx: RowContext): Row {
  const p = ctx.plugin;
  const existing = (path: string) => !folderMissing(path, ctx.app.vault.getFolderByPath(path) !== null);
  return {
    name: tr("setFolder"),
    desc: tr("setFolderDesc"),
    render: (s) => {
      const describe = (path: string) =>
        s.setDesc(existing(path) ? tr("setFolderDesc") : tr("setFolderMissing", { path }));
      describe(p.settings.folder);
      s.addSearch((search) => {
        search.setPlaceholder(DEFAULT_FOLDER).setValue(p.settings.folder);
        const apply = async () => {
          const folder = cleanFolder(normalizePath(search.getValue() || DEFAULT_FOLDER));
          search.setValue(folder);
          describe(folder);
          if (folder !== p.settings.folder) await p.changeFolder(folder);
        };
        new FolderSuggest(ctx.app, search.inputEl, () => void apply());
        search.inputEl.addEventListener("change", () => void apply());
      });
    },
  };
}

/** Input for a secret in Obsidian's secret storage: never shown, only replaced or removed. */
export function secretRow(ctx: RowContext, id: string, name: string, description: string, placeholder: string): Row {
  const st = ctx.app.secretStorage;
  return {
    name,
    desc: description,
    render: (s) => {
      let input: HTMLInputElement | undefined;
      let remove: HTMLElement | undefined;
      const describe = () => {
        const stored = !!ctx.plugin.secret(id);
        s.setDesc(`${description} ${stored ? tr("setSecretSaved") : tr("setSecretNone")}`);
        if (input) input.placeholder = stored ? tr("setSecretReplace") : placeholder;
        remove?.toggle(stored);
      };
      const store = (value: string, notice?: string) => {
        try {
          st.setSecret(id, value);
          if (notice) new Notice(notice);
        } catch {
          if (value) new Notice(tr("setSecretFailed", { name }));
        }
        void ctx.plugin.save({});
        describe();
        ctx.refresh();
      };
      s.addText((t) => {
        input = t.inputEl;
        t.inputEl.type = "password";
        t.inputEl.autocomplete = "off";
        t.inputEl.addEventListener("change", () => {
          const v = t.getValue().trim();
          t.setValue("");
          if (v) store(v, tr("setSecretStored", { name }));
        });
      });
      s.addButton((b) => {
        remove = b.buttonEl;
        b.setButtonText(tr("setRemove")).onClick(() => store(""));
      });
      describe();
    },
  };
}

/** Folder suggestions while typing (Obsidian's standard for path fields). */
class FolderSuggest extends AbstractInputSuggest<TFolder> {
  constructor(
    app: ObsidianApp,
    private field: HTMLInputElement,
    private chosen: () => void,
  ) {
    super(app, field);
  }

  getSuggestions(input: string): TFolder[] {
    const q = input.toLowerCase();
    return this.app.vault
      .getAllFolders()
      .filter((f) => f.path.toLowerCase().includes(q))
      .slice(0, 50);
  }

  renderSuggestion(folder: TFolder, el: HTMLElement) {
    el.setText(folder.path);
  }

  selectSuggestion(folder: TFolder) {
    this.field.value = folder.path;
    this.field.trigger("input");
    this.close();
    this.chosen();
  }
}
