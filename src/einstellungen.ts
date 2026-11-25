// Einstellungen von Better Cooking: Datenmodell, Standardwerte und die Seite in Obsidians Einstellungen.
import {
  AbstractInputSuggest,
  App as ObsidianApp,
  Notice,
  normalizePath,
  PluginSettingTab,
  Setting,
  TFolder,
} from "obsidian";
import type RezeptePlugin from "./main";
import { ORDNER_STANDARD, ordnerBereinigen } from "./ordner";
import { zusatzLesen } from "./zusatz";
import type { Auftrag, DesignModus } from "./types";
import {
  CLAUDE_TOKEN_ID,
  GITHUB_TOKEN_ID,
  REPO_STANDARD,
  ROUTINE_STANDARD,
  routineGueltig,
  type Weg,
} from "./verarbeiter";

export interface Einstellungen {
  /** Ordner mit den Rezeptnotizen, wie Obsidian ihn speichert ("" = oberste Ebene). */
  ordner: string;
  modus: DesignModus;
  beimStartOeffnen: boolean;
  liste?: string;
  weg: Weg;
  /** Rezeptseiten im Plugin lesen (schema.org); aus: lieber an den Verarbeiter, wenn einer eingerichtet ist. */
  lokalZuerst: boolean;
  /** Zeilen "name: wert" für das Frontmatter neuer Notizen (zusatzLesen). */
  zusatz: string;
  /** ID der geplanten Aufgabe "Rezept-Import" (kein Geheimnis; das Token liegt im Schlüsselbund). */
  routine: string;
  repo: string;
  /** Offene Aufträge (überleben einen Neustart, damit "Wird geholt" nicht verschwindet). */
  auftraege: Auftrag[];
}

export const STANDARD: Einstellungen = {
  ordner: ORDNER_STANDARD,
  modus: "system",
  beimStartOeffnen: false,
  weg: "auto",
  lokalZuerst: true,
  zusatz: "",
  routine: ROUTINE_STANDARD,
  repo: REPO_STANDARD,
  auftraege: [],
};

export class RezepteEinstellungen extends PluginSettingTab {
  constructor(
    app: ObsidianApp,
    private plugin: RezeptePlugin,
  ) {
    super(app, plugin);
  }

  display() {
    const { containerEl: el } = this;
    const p = this.plugin;
    el.empty();
    this.ordnerFeld(el);
    new Setting(el)
      .setName("Darstellung")
      .setDesc("Küche hell, Küche dunkel oder automatisch nach dem Obsidian-Theme.")
      .addDropdown((d) =>
        d
          .addOptions({ system: "Automatisch", hell: "Hell", dunkel: "Dunkel" })
          .setValue(p.einstellungen.modus)
          .onChange((v) => void p.speichern({ modus: v as DesignModus })),
      );
    new Setting(el)
      .setName("Beim Start öffnen")
      .addToggle((t) =>
        t.setValue(p.einstellungen.beimStartOeffnen).onChange((v) => void p.speichern({ beimStartOeffnen: v })),
      );

    new Setting(el).setName("Rezepte holen").setHeading();
    el.createEl("p", {
      cls: "setting-item-description",
      text: "Neue Rezepte aus einem Link oder Text verarbeitet entweder Claude (geplante Aufgabe „Rezept-Import“) oder die GitHub-Action „Rezept importieren“ mit eigenem KI-Zugang. Tokens liegen nur im Schlüsselbund dieses Geräts, nie im Vault oder im Git; auf jedem Gerät einmal eintragen. Ablauf und Vertrag: docs/import-contract.md im Repo des Plugins.",
    });
    this.importFelder(el);
    new Setting(el)
      .setName("Verarbeiter")
      .setDesc(
        `Automatisch: Claude, wenn eingerichtet, sonst GitHub. Gerade aktiv: ${({ claude: "Claude", github: "GitHub-Action" } as Record<string, string>)[p.verarbeiter() ?? ""] ?? "keiner"}.`,
      )
      .addDropdown((d) =>
        d
          .addOptions({ auto: "Automatisch", claude: "Claude", github: "GitHub-Action" })
          .setValue(p.einstellungen.weg)
          .onChange(async (v) => {
            await p.speichern({ weg: v as Weg });
            this.display();
          }),
      );
    this.geheimnisFeld(
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
          .setValue(p.einstellungen.routine === ROUTINE_STANDARD ? "" : p.einstellungen.routine)
          .onChange(async (v) => {
            const id = v.trim();
            if (id && !routineGueltig(id)) return;
            await p.speichern({ routine: id || ROUTINE_STANDARD });
          }),
      );
    this.geheimnisFeld(
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
          .setValue(p.einstellungen.repo === REPO_STANDARD ? "" : p.einstellungen.repo)
          .onChange((v) => void p.speichern({ repo: v.trim() || REPO_STANDARD })),
      );
    if (p.einstellungen.auftraege.length) {
      new Setting(el)
        .setName("Offene Aufträge")
        .setDesc(`${p.einstellungen.auftraege.length} Auftrag/Aufträge gemerkt.`)
        .addButton((b) =>
          b.setButtonText("Alle entfernen").onClick(async () => {
            await p.speichern({ auftraege: [] });
            this.display();
          }),
        );
    }
  }

  /** Wie Rezeptseiten geholt werden und was neue Notizen zusätzlich im Frontmatter bekommen. */
  private importFelder(el: HTMLElement) {
    const p = this.plugin;
    new Setting(el)
      .setName("Rezeptseiten selbst lesen")
      .setDesc(
        "An: Rezeptseiten mit schema.org-Daten liest Better Cooking selbst, ohne KI und ohne Konto. Aus: Rezeptseiten gehen an deinen Verarbeiter, wenn einer eingerichtet ist (etwa weil er eigene Regeln für Rezepte befolgt).",
      )
      .addToggle((t) => t.setValue(p.einstellungen.lokalZuerst).onChange((v) => void p.speichern({ lokalZuerst: v })));
    const hinweis = createDiv();
    const zeigen = (text: string) => hinweis.setText(zusatzLesen(text).hinweise.join(" "));
    new Setting(el)
      .setName("Zusätzliche Eigenschaften")
      .setDesc(
        "Eine Zeile je Eigenschaft, z. B. „kontext: privat“. Kommt ins Frontmatter jeder Notiz, die Better Cooking selbst anlegt.",
      )
      .addTextArea((t) => {
        t.setPlaceholder("kontext: privat")
          .setValue(p.einstellungen.zusatz)
          .onChange((v) => {
            zeigen(v);
            void p.speichern({ zusatz: v });
          });
        t.inputEl.rows = 3;
      })
      .descEl.appendChild(hinweis);
    hinweis.addClass("mod-warning");
    zeigen(p.einstellungen.zusatz);
  }

  /** Rezeptordner mit Vorschlägen aus dem Vault; gespeichert wird beim Verlassen des Felds, nicht bei jedem Zeichen. */
  private ordnerFeld(el: HTMLElement) {
    const p = this.plugin;
    const vorhanden = (pfad: string) => pfad === "" || this.app.vault.getFolderByPath(pfad) !== null;
    const s = new Setting(el).setName("Rezeptordner");
    const beschreiben = (pfad: string) =>
      s.setDesc(
        vorhanden(pfad)
          ? "Ordner mit den Rezeptnotizen. Bilder liegen im Unterordner Bilder."
          : `Ordner „${pfad}“ gibt es noch nicht. Lege ihn an oder wähle einen anderen.`,
      );
    beschreiben(p.einstellungen.ordner);
    s.addSearch((suche) => {
      suche.setPlaceholder(ORDNER_STANDARD).setValue(p.einstellungen.ordner);
      const uebernehmen = async () => {
        const ordner = ordnerBereinigen(normalizePath(suche.getValue() || ORDNER_STANDARD));
        suche.setValue(ordner);
        beschreiben(ordner);
        if (ordner !== p.einstellungen.ordner) await p.ordnerAendern(ordner);
      };
      new OrdnerVorschlag(this.app, suche.inputEl, () => void uebernehmen());
      suche.inputEl.addEventListener("change", () => void uebernehmen());
    });
  }

  /** Eingabe für ein Geheimnis im Obsidian-Schlüsselbund: wird nie angezeigt, nur ersetzt oder entfernt. */
  private geheimnisFeld(el: HTMLElement, id: string, name: string, beschreibung: string, platzhalter: string) {
    const st = (this.app as unknown as { secretStorage?: { setSecret(id: string, s: string): void } }).secretStorage;
    const da = !!this.plugin.geheimnis(id);
    const s = new Setting(el)
      .setName(name)
      .setDesc(
        st
          ? `${beschreibung} ${da ? "Gespeichert." : "Noch keins gespeichert."}`
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
        void this.plugin.speichern({});
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
          void this.plugin.speichern({});
          this.display();
        }),
      );
    }
  }
}

/** Ordnervorschläge beim Tippen (Obsidian-Standard für Pfadfelder). */
class OrdnerVorschlag extends AbstractInputSuggest<TFolder> {
  constructor(
    app: ObsidianApp,
    private feld: HTMLInputElement,
    private gewaehlt: () => void,
  ) {
    super(app, feld);
  }

  getSuggestions(eingabe: string): TFolder[] {
    const q = eingabe.toLowerCase();
    return this.app.vault
      .getAllFolders()
      .filter((f) => f.path.toLowerCase().includes(q))
      .slice(0, 50);
  }

  renderSuggestion(ordner: TFolder, el: HTMLElement) {
    el.setText(ordner.path);
  }

  selectSuggestion(ordner: TFolder) {
    this.feld.value = ordner.path;
    this.feld.trigger("input");
    this.close();
    this.gewaehlt();
  }
}
