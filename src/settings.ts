// Settings of Better Cooking: data model, defaults and the page in Obsidian's settings.
import {
  AbstractInputSuggest,
  App as ObsidianApp,
  Notice,
  normalizePath,
  PluginSettingTab,
  Setting,
  TFolder,
} from "obsidian";
import type BetterCookingPlugin from "./main";
import { DEFAULT_FOLDER, cleanFolder } from "./folder";
import { readExtraProperties } from "./extraProperties";
import type { Job, ColorMode } from "./types";
import {
  CLAUDE_TOKEN_ID,
  GITHUB_TOKEN_ID,
  DEFAULT_REPO,
  DEFAULT_ROUTINE,
  routineValid,
  type Processor,
} from "./processor";
import { tr } from "./i18n";

export interface Settings {
  /** Folder with the recipe notes, as Obsidian stores it ("" = top level). */
  folder: string;
  mode: ColorMode;
  openOnStartup: boolean;
  list?: string;
  processor: Processor;
  /** Read recipe websites in the plugin (schema.org); off: prefer the processor if one is set up. */
  readWebsitesLocally: boolean;
  /** Lines "name: value" for the frontmatter of new notes (readExtraProperties). */
  extraProperties: string;
  /** ID of the scheduled task "Rezept-Import" (not a secret; the token is in the secret storage). */
  routine: string;
  repo: string;
  /** Open jobs (survive a restart, so "Wird geholt" does not disappear). */
  jobs: Job[];
}

export const DEFAULTS: Settings = {
  folder: DEFAULT_FOLDER,
  mode: "system",
  openOnStartup: false,
  processor: "auto",
  readWebsitesLocally: true,
  extraProperties: "",
  routine: DEFAULT_ROUTINE,
  repo: DEFAULT_REPO,
  jobs: [],
};

export class BetterCookingSettingTab extends PluginSettingTab {
  constructor(
    app: ObsidianApp,
    private plugin: BetterCookingPlugin,
  ) {
    super(app, plugin);
  }

  display() {
    const { containerEl: el } = this;
    const p = this.plugin;
    el.empty();
    this.folderField(el);
    new Setting(el)
      .setName(tr("appearance"))
      .setDesc(tr("setAppearanceDesc"))
      .addDropdown((d) =>
        d
          .addOptions({ system: tr("modeAuto"), hell: tr("modeLight"), dunkel: tr("modeDark") })
          .setValue(p.settings.mode)
          .onChange((v) => void p.save({ mode: v as ColorMode })),
      );
    new Setting(el)
      .setName(tr("setOpenOnStartup"))
      .addToggle((t) => t.setValue(p.settings.openOnStartup).onChange((v) => void p.save({ openOnStartup: v })));

    new Setting(el).setName(tr("setFetchHeading")).setHeading();
    el.createEl("p", {
      cls: "setting-item-description",
      text: tr("setFetchIntro"),
    });
    this.importFields(el);
    new Setting(el)
      .setName(tr("setProcessor"))
      .setDesc(
        tr("setProcessorDesc", {
          active:
            ({ claude: "Claude", github: tr("setGithubAction") } as Record<string, string>)[p.processor() ?? ""] ??
            tr("setProcessorNone"),
        }),
      )
      .addDropdown((d) =>
        d
          .addOptions({ auto: tr("modeAuto"), claude: "Claude", github: tr("setGithubAction") })
          .setValue(p.settings.processor)
          .onChange(async (v) => {
            await p.save({ processor: v as Processor });
            this.display();
          }),
      );
    this.secretField(el, CLAUDE_TOKEN_ID, tr("setClaudeToken"), tr("setClaudeTokenDesc"), "sk-ant-oat01-…");
    new Setting(el)
      .setName(tr("setRoutineId"))
      .setDesc(tr("setRoutineIdDesc"))
      .addText((t) =>
        t
          .setPlaceholder("trig_…")
          .setValue(p.settings.routine === DEFAULT_ROUTINE ? "" : p.settings.routine)
          .onChange(async (v) => {
            const id = v.trim();
            if (id && !routineValid(id)) return;
            await p.save({ routine: id || DEFAULT_ROUTINE });
          }),
      );
    this.secretField(el, GITHUB_TOKEN_ID, tr("setGithubToken"), tr("setGithubTokenDesc"), "github_pat_…");
    new Setting(el)
      .setName(tr("setRepo"))
      .setDesc(tr("setRepoDesc"))
      .addText((t) =>
        t
          .setPlaceholder(tr("setRepoPlaceholder"))
          .setValue(p.settings.repo === DEFAULT_REPO ? "" : p.settings.repo)
          .onChange((v) => void p.save({ repo: v.trim() || DEFAULT_REPO })),
      );
    if (p.settings.jobs.length) {
      new Setting(el)
        .setName(tr("setOpenJobs"))
        .setDesc(tr("setOpenJobsDesc", { n: p.settings.jobs.length }))
        .addButton((b) =>
          b.setButtonText(tr("setRemoveAll")).onClick(async () => {
            await p.save({ jobs: [] });
            this.display();
          }),
        );
    }
  }

  /** How recipe websites are fetched and what new notes get in their frontmatter in addition. */
  private importFields(el: HTMLElement) {
    const p = this.plugin;
    new Setting(el)
      .setName(tr("setReadLocally"))
      .setDesc(tr("setReadLocallyDesc"))
      .addToggle((t) =>
        t.setValue(p.settings.readWebsitesLocally).onChange((v) => void p.save({ readWebsitesLocally: v })),
      );
    const hint = createDiv();
    const show = (text: string) => hint.setText(readExtraProperties(text).hints.join(" "));
    new Setting(el)
      .setName(tr("setExtra"))
      .setDesc(tr("setExtraDesc"))
      .addTextArea((t) => {
        t.setPlaceholder(tr("setExtraPlaceholder"))
          .setValue(p.settings.extraProperties)
          .onChange((v) => {
            show(v);
            void p.save({ extraProperties: v });
          });
        t.inputEl.rows = 3;
      })
      .descEl.appendChild(hint);
    hint.addClass("mod-warning");
    show(p.settings.extraProperties);
  }

  /** Recipe folder with suggestions from the vault; saved when leaving the field, not on every keystroke. */
  private folderField(el: HTMLElement) {
    const p = this.plugin;
    const existing = (path: string) => path === "" || this.app.vault.getFolderByPath(path) !== null;
    const s = new Setting(el).setName(tr("setFolder"));
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
      new FolderSuggest(this.app, search.inputEl, () => void apply());
      search.inputEl.addEventListener("change", () => void apply());
    });
  }

  /** Input for a secret in Obsidian's secret storage: never shown, only replaced or removed. */
  private secretField(el: HTMLElement, id: string, name: string, description: string, placeholder: string) {
    const st = (this.app as unknown as { secretStorage?: { setSecret(id: string, s: string): void } }).secretStorage;
    const stored = !!this.plugin.secret(id);
    const s = new Setting(el)
      .setName(name)
      .setDesc(
        st ? `${description} ${stored ? tr("setSecretSaved") : tr("setSecretNone")}` : tr("setSecretNeedsVersion"),
      );
    if (!st) return;
    s.addText((t) => {
      t.inputEl.type = "password";
      t.inputEl.autocomplete = "off";
      t.setPlaceholder(stored ? tr("setSecretReplace") : placeholder);
      t.inputEl.addEventListener("change", () => {
        const v = t.getValue().trim();
        if (!v) return;
        try {
          st.setSecret(id, v);
          new Notice(tr("setSecretStored", { name }));
        } catch {
          new Notice(tr("setSecretFailed", { name }));
        }
        t.setValue("");
        void this.plugin.save({});
        this.display();
      });
    });
    if (stored) {
      s.addButton((b) =>
        b.setButtonText(tr("setRemove")).onClick(() => {
          try {
            st.setSecret(id, "");
          } catch {
            /* keep the old value */
          }
          void this.plugin.save({});
          this.display();
        }),
      );
    }
  }
}

/** Folder suggestions while typing (Obsidian's standard for path fields). */
class FolderSuggest extends AbstractInputSuggest<TFolder> {
  constructor(
    app: ObsidianApp,
    private field: HTMLInputElement,
    private gewaehlt: () => void,
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
    this.gewaehlt();
  }
}
