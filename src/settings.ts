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
      .setName("Darstellung")
      .setDesc("Küche hell, Küche dunkel oder automatisch nach dem Obsidian-Theme.")
      .addDropdown((d) =>
        d
          .addOptions({ system: "Automatisch", hell: "Hell", dunkel: "Dunkel" })
          .setValue(p.settings.mode)
          .onChange((v) => void p.save({ mode: v as ColorMode })),
      );
    new Setting(el)
      .setName("Beim Start öffnen")
      .addToggle((t) => t.setValue(p.settings.openOnStartup).onChange((v) => void p.save({ openOnStartup: v })));

    new Setting(el).setName("Rezepte holen").setHeading();
    el.createEl("p", {
      cls: "setting-item-description",
      text: "Neue Rezepte aus einem Link oder Text verarbeitet entweder Claude (geplante Aufgabe „Rezept-Import“) oder die GitHub-Action „Rezept importieren“ mit eigenem KI-Zugang. Tokens liegen nur im Schlüsselbund dieses Geräts, nie im Vault oder im Git; auf jedem Gerät einmal eintragen. Ablauf und Vertrag: docs/import-contract.md im Repo des Plugins.",
    });
    this.importFields(el);
    new Setting(el)
      .setName("Verarbeiter")
      .setDesc(
        `Automatisch: Claude, wenn eingerichtet, sonst GitHub. Gerade aktiv: ${({ claude: "Claude", github: "GitHub-Action" } as Record<string, string>)[p.processor() ?? ""] ?? "keiner"}.`,
      )
      .addDropdown((d) =>
        d
          .addOptions({ auto: "Automatisch", claude: "Claude", github: "GitHub-Action" })
          .setValue(p.settings.processor)
          .onChange(async (v) => {
            await p.save({ processor: v as Processor });
            this.display();
          }),
      );
    this.secretField(
      el,
      CLAUDE_TOKEN_ID,
      "Claude-Token",
      "API-Token der geplanten Aufgabe „Rezept-Import“ (claude.ai/code/routines → Rezept-Import → Bearbeiten → Trigger → API). Darf nur diese Aufgabe starten.",
      "sk-ant-oat01-…",
    );
    new Setting(el)
      .setName("Routine-ID")
      .setDesc("ID deiner geplanten Aufgabe (trig_…), kein Geheimnis.")
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
    this.secretField(
      el,
      GITHUB_TOKEN_ID,
      "GitHub-Token",
      "Fine-grained Token nur für das Vault-Repo, Recht „Actions: Read and write“. Startet den Workflow „Rezept importieren“.",
      "github_pat_…",
    );
    new Setting(el)
      .setName("Repo")
      .setDesc("Besitzer/Name des Vault-Repos.")
      .addText((t) =>
        t
          .setPlaceholder("besitzer/vault")
          .setValue(p.settings.repo === DEFAULT_REPO ? "" : p.settings.repo)
          .onChange((v) => void p.save({ repo: v.trim() || DEFAULT_REPO })),
      );
    if (p.settings.jobs.length) {
      new Setting(el)
        .setName("Offene Aufträge")
        .setDesc(`${p.settings.jobs.length} Auftrag/Aufträge gemerkt.`)
        .addButton((b) =>
          b.setButtonText("Alle entfernen").onClick(async () => {
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
      .setName("Rezeptseiten selbst lesen")
      .setDesc(
        "An: Rezeptseiten mit schema.org-Daten liest Better Cooking selbst, ohne KI und ohne Konto. Aus: Rezeptseiten gehen an deinen Verarbeiter, wenn einer eingerichtet ist (etwa weil er eigene Regeln für Rezepte befolgt).",
      )
      .addToggle((t) =>
        t.setValue(p.settings.readWebsitesLocally).onChange((v) => void p.save({ readWebsitesLocally: v })),
      );
    const hint = createDiv();
    const show = (text: string) => hint.setText(readExtraProperties(text).hints.join(" "));
    new Setting(el)
      .setName("Zusätzliche Eigenschaften")
      .setDesc(
        "Eine Zeile je Eigenschaft, z. B. „kontext: privat“. Kommt ins Frontmatter jeder Notiz, die Better Cooking selbst anlegt.",
      )
      .addTextArea((t) => {
        t.setPlaceholder("kontext: privat")
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
    const s = new Setting(el).setName("Rezeptordner");
    const describe = (path: string) =>
      s.setDesc(
        existing(path)
          ? "Ordner mit den Rezeptnotizen. Bilder liegen im Unterordner Bilder."
          : `Ordner „${path}“ gibt es noch nicht. Lege ihn an oder wähle einen anderen.`,
      );
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
  private secretField(el: HTMLElement, id: string, name: string, description: string, platzhalter: string) {
    const st = (this.app as unknown as { secretStorage?: { setSecret(id: string, s: string): void } }).secretStorage;
    const da = !!this.plugin.secret(id);
    const s = new Setting(el)
      .setName(name)
      .setDesc(
        st
          ? `${description} ${da ? "Gespeichert." : "Noch keins gespeichert."}`
          : "Braucht Obsidian ab 1.11.4 (Schlüsselbund).",
      );
    if (!st) return;
    s.addText((t) => {
      t.inputEl.type = "password";
      t.inputEl.autocomplete = "off";
      t.setPlaceholder(da ? "•••••••• (neu eintragen zum Ersetzen)" : platzhalter);
      t.inputEl.addEventListener("change", () => {
        const v = t.getValue().trim();
        if (!v) return;
        try {
          st.setSecret(id, v);
          new Notice(`${name} gespeichert.`);
        } catch {
          new Notice(`${name} konnte nicht gespeichert werden.`);
        }
        t.setValue("");
        void this.plugin.save({});
        this.display();
      });
    });
    if (da) {
      s.addButton((b) =>
        b.setButtonText("Entfernen").onClick(() => {
          try {
            st.setSecret(id, "");
          } catch {
            /* bleibt */
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
