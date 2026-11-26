// The settings tab of Better Cooking. The rows are declared once (getSettingDefinitions, Obsidian 1.13+, so they
// appear in Obsidian's settings search) and rendered by the same functions on older versions (display).
import { App as ObsidianApp, PluginSettingTab, requireApiVersion, Setting, type SettingDefinitionItem } from "obsidian";
import type BetterCookingPlugin from "./main";
import { folderRow, secretRow, type Group, type Row, type RowContext } from "./settingsRows";
import { aiGroup } from "./settingsAi";
import { readExtraProperties } from "./extraProperties";
import { FIELD_IDS, makeNoteFormat, ownFieldNames } from "./noteFormat";
import type { ColorMode, Palette } from "./types";
import {
  CLAUDE_TOKEN_ID,
  GITHUB_TOKEN_ID,
  DEFAULT_REPO,
  DEFAULT_ROUTINE,
  routineValid,
  type Processor,
  processorName,
} from "./processor";
import { tr, type LanguageSetting, type NoteLangSetting } from "./i18n";

export class BetterCookingSettingTab extends PluginSettingTab {
  /** Functions that bring descriptions up to date after a change in another row. */
  private refreshers: (() => void)[] = [];

  private ctx: RowContext;

  constructor(
    app: ObsidianApp,
    private plugin: BetterCookingPlugin,
  ) {
    super(app, plugin);
    this.containerEl.addEventListener("focusout", (e) => {
      if (this.redrawPending && !BetterCookingSettingTab.isField(e.relatedTarget)) this.redrawAfterExternalChange();
    });
    this.ctx = {
      app,
      plugin,
      refresh: () => this.refresh(),
      onRefresh: (f) => this.refreshers.push(f),
    };
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

  /** The settings changed on another device (#90) while a text field was being edited: draw the tab again afterwards. */
  private redrawPending = false;

  private static isField(el: unknown): boolean {
    return (
      el instanceof Element &&
      (el.instanceOf(HTMLInputElement) || el.instanceOf(HTMLTextAreaElement) || el.instanceOf(HTMLSelectElement))
    );
  }

  /** data.json changed on another device (#90): draw the open tab again, unless a field is being edited (then at `focusout`). */
  redrawAfterExternalChange() {
    if (!this.containerEl.isShown()) return;
    const a = activeDocument.activeElement;
    if (a && this.containerEl.contains(a) && BetterCookingSettingTab.isField(a)) {
      this.redrawPending = true;
      return;
    }
    this.redrawPending = false;
    if (requireApiVersion("1.13.0")) this.update();
    this.display();
  }

  private refresh() {
    for (const f of this.refreshers) f();
  }

  /** Row for the path of a list note: what the user chose (empty: automatic) and, below, the file in use (issue #76). */
  private listNoteRow(
    kind: "shoppingList" | "mealPlan",
    name: "setShoppingList" | "setMealPlan",
    desc: "setShoppingListDesc" | "setMealPlanDesc",
  ): Row {
    const p = this.plugin;
    const inUse = () => `${tr(desc)} ${tr("listInUse", { file: p.lists.choice(kind).path })}`;
    return {
      name: tr(name),
      desc: inUse(),
      render: (s) =>
        s.addText((t) => {
          t.setPlaceholder(tr("listAutomatic"))
            .setValue(p.settings[kind])
            .onChange(async (v) => {
              await p.save({ [kind]: v.trim() });
              s.setDesc(inUse());
            });
          this.ctx.onRefresh(() => s.setDesc(inUse()));
        }),
    };
  }

  private groups(): Group[] {
    const p = this.plugin;
    return [
      {
        rows: [
          {
            name: tr("setLanguage"),
            desc: tr("setLanguageDesc"),
            aliases: ["Sprache", "Language"],
            render: (s) =>
              s.addDropdown((d) =>
                d
                  .addOptions({ auto: tr("languageAuto"), de: "Deutsch", en: "English" })
                  .setValue(p.settings.language)
                  .onChange(async (v) => {
                    await p.save({ language: v as LanguageSetting });
                    // The names of all rows change: index the tab again for the search (1.13+) and draw it in the new
                    // language. There is no API to redraw a tab, so `display()` does it; `visible` of the rows is read
                    // again by that, so conditional rows stay right.
                    if (requireApiVersion("1.13.0")) this.update();
                    this.display();
                  }),
              ),
          },
          folderRow(this.ctx),
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
            name: tr("setColors"),
            desc: tr("setColorsDesc"),
            aliases: ["Style Settings", "Theme"],
            render: (s) =>
              s.addDropdown((d) =>
                d
                  .addOptions({ kitchen: tr("colorsKitchen"), obsidian: tr("colorsObsidian") })
                  .setValue(p.settings.palette)
                  .onChange((v) => void p.save({ palette: v as Palette })),
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
                  .addOptions({ ui: tr("setNoteFormatUi"), de: tr("setNoteFormatDe"), en: tr("setNoteFormatEn") })
                  .setValue(p.settings.noteFormat)
                  .onChange(async (v) => {
                    await p.save({ noteFormat: v as NoteLangSetting });
                    this.refresh();
                  }),
              ),
          },
          this.linesRow(
            tr("setFieldNames"),
            tr("setFieldNamesDesc", { ids: FIELD_IDS.join(", ") }),
            "category: tags",
            "fieldNames",
            (text) => makeNoteFormat(p.noteLang(), text).hints,
          ),
          this.listNoteRow("shoppingList", "setShoppingList", "setShoppingListDesc"),
          this.linesRow(tr("setStores"), tr("setStoresDesc"), "Rewe: Mehl, Milch\ndm: Backpapier", "stores", () => []),
          this.listNoteRow("mealPlan", "setMealPlan", "setMealPlanDesc"),
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
          secretRow(this.ctx, CLAUDE_TOKEN_ID, tr("setClaudeToken"), tr("setClaudeTokenDesc"), "sk-ant-oat01-…"),
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
          secretRow(this.ctx, GITHUB_TOKEN_ID, tr("setGithubToken"), tr("setGithubTokenDesc"), "github_pat_…"),
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
          this.syncRow(),
        ],
      },
      aiGroup(this.ctx),
    ];
  }

  /** Which processor imports go to; the description names the one in use. */
  private processorRow(): Row {
    const p = this.plugin;
    const text = () => {
      const active = p.processor();
      return tr("setProcessorDesc", {
        active: active
          ? processorName(active)
          : p.settings.processor === "none"
            ? tr("setProcessorNoAi")
            : tr("setProcessorNone"),
      });
    };
    const describe = (s: Setting) => s.setDesc(text());
    return {
      name: tr("setProcessor"),
      desc: text(),
      aliases: ["Claude", "GitHub"],
      render: (s) => {
        describe(s);
        this.ctx.onRefresh(() => describe(s));
        s.addDropdown((d) =>
          d
            .addOptions({
              auto: tr("modeAuto"),
              none: tr("setNone"),
              claude: "Claude",
              github: tr("setGithubAction"),
              ai: tr("setOwnAi"),
            })
            .setValue(p.settings.processor)
            .onChange(async (v) => {
              await p.save({ processor: v as Processor });
              this.refresh();
            }),
        );
      },
    };
  }

  /** Sync while an import waits (issue #82): only with Claude or GitHub, which deliver through Git. */
  private syncRow(): Row {
    const p = this.plugin;
    return {
      name: tr("setSync"),
      desc: tr("setSyncDesc"),
      visible: () => {
        const r = p.processorInfo().ready;
        return r.claude || r.github || p.settings.jobs.length > 0;
      },
      render: (s) =>
        s.addToggle((t) =>
          t.setValue(p.settings.syncWhileImporting).onChange((v) => void p.save({ syncWhileImporting: v })),
        ),
    };
  }

  /** Text area with one entry per line and a warning for lines that are skipped. */
  private linesRow(
    name: string,
    desc: string,
    placeholder: string,
    key: "fieldNames" | "extraProperties" | "stores",
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
}
