// The settings tab of Better Cooking. The rows are declared once (getSettingDefinitions, Obsidian 1.13+, so they
// appear in Obsidian's settings search) and rendered by the same functions on older versions (display).
import {
  AbstractInputSuggest,
  App as ObsidianApp,
  Notice,
  normalizePath,
  PluginSettingTab,
  Setting,
  TFolder,
  type SettingDefinitionItem,
} from "obsidian";
import type BetterCookingPlugin from "./main";
import { DEFAULT_FOLDER, cleanFolder } from "./folder";
import { readExtraProperties } from "./extraProperties";
import { FIELD_IDS, makeNoteFormat, ownFieldNames, type NoteLang } from "./noteFormat";
import type { ColorMode } from "./types";
import {
  CLAUDE_TOKEN_ID,
  GITHUB_TOKEN_ID,
  DEFAULT_REPO,
  DEFAULT_ROUTINE,
  routineValid,
  type Processor,
} from "./processor";
import { tr } from "./i18n";

/** One row: name and description for rendering and search, `render` adds the controls. */
interface Row {
  name: string;
  desc?: string;
  aliases?: string[];
  visible?: () => boolean;
  render: (s: Setting) => void;
}

interface Group {
  heading?: string;
  /** Text below the heading. */
  intro?: string;
  rows: Row[];
}

export class BetterCookingSettingTab extends PluginSettingTab {
  /** Functions that bring descriptions up to date after a change in another row. */
  private refreshers: (() => void)[] = [];

  constructor(
    app: ObsidianApp,
    private plugin: BetterCookingPlugin,
  ) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    this.refreshers = [];
    return this.groups().map((g) => ({
      type: "group" as const,
      heading: g.heading,
      items: [
        ...(g.intro ? [{ name: "", desc: g.intro, searchable: false }] : []),
        ...g.rows.map((r) => ({
          name: r.name,
          desc: r.desc,
          aliases: r.aliases,
          visible: r.visible,
          render: (s: Setting) => r.render(s),
        })),
      ],
    }));
  }

  /** Obsidian before 1.13: render the same rows imperatively. */
  display() {
    const el = this.containerEl;
    el.empty();
    this.refreshers = [];
    for (const g of this.groups()) {
      if (g.heading) new Setting(el).setName(g.heading).setHeading();
      if (g.intro) el.createEl("p", { cls: "setting-item-description", text: g.intro });
      for (const r of g.rows) {
        if (r.visible && !r.visible()) continue;
        const s = new Setting(el).setName(r.name);
        if (r.desc) s.setDesc(r.desc);
        r.render(s);
      }
    }
  }

  private refresh() {
    for (const f of this.refreshers) f();
  }

  private groups(): Group[] {
    const p = this.plugin;
    return [
      {
        rows: [
          this.folderRow(),
          {
            name: tr("appearance"),
            desc: tr("setAppearanceDesc"),
            render: (s) =>
              s.addDropdown((d) =>
                d
                  .addOptions({ system: tr("modeAuto"), hell: tr("modeLight"), dunkel: tr("modeDark") })
                  .setValue(p.settings.mode)
                  .onChange((v) => void p.save({ mode: v as ColorMode })),
              ),
          },
          {
            name: tr("setOpenOnStartup"),
            render: (s) =>
              s.addToggle((t) =>
                t.setValue(p.settings.openOnStartup).onChange((v) => void p.save({ openOnStartup: v })),
              ),
          },
          {
            name: tr("setNoteFormat"),
            desc: tr("setNoteFormatDesc"),
            render: (s) =>
              s.addDropdown((d) =>
                d
                  .addOptions({ de: tr("setNoteFormatDe"), en: tr("setNoteFormatEn") })
                  .setValue(p.settings.noteFormat)
                  .onChange((v) => void p.save({ noteFormat: v as NoteLang })),
              ),
          },
          this.linesRow(
            tr("setFieldNames"),
            tr("setFieldNamesDesc", { ids: FIELD_IDS.join(", ") }),
            "category: tags",
            "fieldNames",
            (text) => makeNoteFormat(p.settings.noteFormat, text).hints,
          ),
        ],
      },
      {
        heading: tr("setFetchHeading"),
        intro: tr("setFetchIntro"),
        rows: [
          {
            name: tr("setReadLocally"),
            desc: tr("setReadLocallyDesc"),
            render: (s) =>
              s.addToggle((t) =>
                t.setValue(p.settings.readWebsitesLocally).onChange((v) => void p.save({ readWebsitesLocally: v })),
              ),
          },
          this.linesRow(
            tr("setExtra"),
            tr("setExtraDesc"),
            tr("setExtraPlaceholder"),
            "extraProperties",
            (text) => readExtraProperties(text, ownFieldNames(p.noteFormat())).hints,
          ),
          this.processorRow(),
          this.secretRow(CLAUDE_TOKEN_ID, tr("setClaudeToken"), tr("setClaudeTokenDesc"), "sk-ant-oat01-…"),
          {
            name: tr("setRoutineId"),
            desc: tr("setRoutineIdDesc"),
            render: (s) =>
              s.addText((t) =>
                t
                  .setPlaceholder("trig_…")
                  .setValue(p.settings.routine === DEFAULT_ROUTINE ? "" : p.settings.routine)
                  .onChange(async (v) => {
                    const id = v.trim();
                    if (id && !routineValid(id)) return;
                    await p.save({ routine: id || DEFAULT_ROUTINE });
                    this.refresh();
                  }),
              ),
          },
          this.secretRow(GITHUB_TOKEN_ID, tr("setGithubToken"), tr("setGithubTokenDesc"), "github_pat_…"),
          {
            name: tr("setRepo"),
            desc: tr("setRepoDesc"),
            render: (s) =>
              s.addText((t) =>
                t
                  .setPlaceholder(tr("setRepoPlaceholder"))
                  .setValue(p.settings.repo === DEFAULT_REPO ? "" : p.settings.repo)
                  .onChange(async (v) => {
                    await p.save({ repo: v.trim() || DEFAULT_REPO });
                    this.refresh();
                  }),
              ),
          },
          {
            name: tr("setOpenJobs"),
            visible: () => p.settings.jobs.length > 0,
            render: (s) => {
              s.setDesc(tr("setOpenJobsDesc", { n: p.settings.jobs.length }));
              s.addButton((b) =>
                b.setButtonText(tr("setRemoveAll")).onClick(async () => {
                  await p.save({ jobs: [] });
                  s.settingEl.hide();
                }),
              );
            },
          },
        ],
      },
    ];
  }

  /** Which processor imports go to; the description names the one in use. */
  private processorRow(): Row {
    const p = this.plugin;
    const text = () =>
      tr("setProcessorDesc", {
        active:
          ({ claude: "Claude", github: tr("setGithubAction") } as Record<string, string>)[p.processor() ?? ""] ??
          tr("setProcessorNone"),
      });
    const describe = (s: Setting) => s.setDesc(text());
    return {
      name: tr("setProcessor"),
      desc: text(),
      aliases: ["Claude", "GitHub"],
      render: (s) => {
        describe(s);
        this.refreshers.push(() => describe(s));
        s.addDropdown((d) =>
          d
            .addOptions({ auto: tr("modeAuto"), claude: "Claude", github: tr("setGithubAction") })
            .setValue(p.settings.processor)
            .onChange(async (v) => {
              await p.save({ processor: v as Processor });
              this.refresh();
            }),
        );
      },
    };
  }

  /** Text area with one entry per line and a warning for lines that are skipped. */
  private linesRow(
    name: string,
    desc: string,
    placeholder: string,
    key: "fieldNames" | "extraProperties",
    hints: (text: string) => string[],
  ): Row {
    const p = this.plugin;
    return {
      name,
      desc,
      render: (s) => {
        const hint = s.descEl.createDiv({ cls: "mod-warning" });
        const show = (text: string) => hint.setText(hints(text).join(" "));
        s.addTextArea((t) => {
          t.setPlaceholder(placeholder)
            .setValue(p.settings[key])
            .onChange((v) => {
              show(v);
              void p.save({ [key]: v });
            });
          t.inputEl.rows = 3;
        });
        show(p.settings[key]);
      },
    };
  }

  /** Recipe folder with suggestions from the vault; saved when leaving the field, not on every keystroke. */
  private folderRow(): Row {
    const p = this.plugin;
    const existing = (path: string) => path === "" || this.app.vault.getFolderByPath(path) !== null;
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
          new FolderSuggest(this.app, search.inputEl, () => void apply());
          search.inputEl.addEventListener("change", () => void apply());
        });
      },
    };
  }

  /** Input for a secret in Obsidian's secret storage: never shown, only replaced or removed. */
  private secretRow(id: string, name: string, description: string, placeholder: string): Row {
    const st = (this.app as unknown as { secretStorage?: { setSecret(id: string, s: string): void } }).secretStorage;
    return {
      name,
      desc: st ? description : tr("setSecretNeedsVersion"),
      render: (s) => {
        if (!st) return;
        let input: HTMLInputElement | undefined;
        let remove: HTMLElement | undefined;
        const describe = () => {
          const stored = !!this.plugin.secret(id);
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
          void this.plugin.save({});
          describe();
          this.refresh();
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
