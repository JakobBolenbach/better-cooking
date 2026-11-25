// Die Ansicht von Better Cooking in Obsidian: liest den Rezeptordner, rendert die Preact-Oberfläche und
// schreibt Status, Bewertung und Versuche in bestehende Rezeptnotizen (docs/architecture.md).
import { ItemView, Notice, TFile, debounce, type WorkspaceLeaf } from "obsidian";
import { h, render } from "preact";
import type RezeptePlugin from "./main";
import { imOrdner, istRezeptDatei } from "./ordner";
import { heuteIso, leseRezept, versuchEinfuegen } from "./parse";
import type { DesignModus, Rezept, RezeptAnsicht, Status, Theme } from "./types";
import { App } from "./ui/App";
import type { VersuchEingabe } from "./ui/versuch";

export const VIEW_TYPE = "rezepte-view";
export const ICON = "rezepte-kochmuetze";
// Kochmütze aus Lucide (ISC), im 100er-Raster für addIcon.
export const ICON_SVG = `<g transform="scale(4.1666667)" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
<path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z"/>
<path d="M6 17h12"/></g>`;

export class RezepteView extends ItemView {
  private rezepte: RezeptAnsicht[] = [];
  private cache = new Map<string, { mtime: number; r: RezeptAnsicht }>();
  private start: { importieren?: boolean } | undefined;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: RezeptePlugin,
  ) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Rezepte";
  }
  getIcon() {
    return ICON;
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("rz-root");
    this.contentEl.setAttribute("lang", "de");
    const neu = debounce(() => void this.neuLaden(), 250, true);
    const betrifft = (pfad: string) => imOrdner(pfad, this.plugin.einstellungen.ordner);
    this.registerEvent(this.app.vault.on("modify", (f) => betrifft(f.path) && neu()));
    this.registerEvent(this.app.vault.on("create", (f) => betrifft(f.path) && neu()));
    this.registerEvent(this.app.vault.on("delete", (f) => betrifft(f.path) && neu()));
    this.registerEvent(this.app.vault.on("rename", (f, alt) => (betrifft(f.path) || betrifft(alt)) && neu()));
    this.registerEvent(this.app.metadataCache.on("resolved", () => neu()));
    this.registerEvent(this.app.workspace.on("css-change", () => this.zeichnen()));
    this.untenMessen();
    this.registerEvent(this.app.workspace.on("resize", () => this.untenMessen()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.untenMessen()));
    this.registerInterval(window.setInterval(() => this.untenMessen(), 2000));
    // Zeitüberschreitung von Aufträgen auch dann melden, wenn sich im Rezeptordner nichts ändert.
    this.registerInterval(window.setInterval(() => void this.plugin.auftraegeAbgleichen(this.rezepte), 60_000));
    await this.neuLaden();
  }

  /** Obsidian mobil legt eine schwebende Leiste über den unteren Rand der Ansicht (iPhone, 24.11.2026).
   *  Gemessen wird, wie weit sie die Ansicht überdeckt; die CSS-Variable --rz-unten hält Knöpfe und Listen darüber frei. */
  private untenMessen() {
    const leiste = activeDocument.querySelector<HTMLElement>(".mobile-navbar");
    const ansicht = this.contentEl.getBoundingClientRect();
    let unten = 0;
    if (leiste && leiste.offsetParent !== null) {
      const l = leiste.getBoundingClientRect();
      if (l.height > 0 && l.top < ansicht.bottom && l.bottom > ansicht.top)
        unten = Math.max(0, ansicht.bottom - l.top) + 8;
    }
    const wert = unten > 0 ? `${Math.round(unten)}px` : "";
    if (this.contentEl.style.getPropertyValue("--rz-unten") !== wert) {
      if (wert) this.contentEl.style.setProperty("--rz-unten", wert);
      else this.contentEl.style.removeProperty("--rz-unten");
    }
  }

  async onClose() {
    render(null, this.contentEl);
    void this.plugin.wachHalten(false);
  }

  importOeffnen() {
    this.start = { importieren: true };
    render(null, this.contentEl);
    this.zeichnen();
    this.start = undefined;
  }

  async neuLaden() {
    const dateien = this.app.vault
      .getMarkdownFiles()
      .filter((f) => istRezeptDatei(f.path, this.plugin.einstellungen.ordner));
    const neu: RezeptAnsicht[] = [];
    for (const f of dateien) {
      const c = this.cache.get(f.path);
      if (c && c.mtime === f.stat.mtime) {
        neu.push(c.r);
        continue;
      }
      try {
        const r = leseRezept(f.path, await this.app.vault.cachedRead(f), f.stat.mtime);
        const ansicht = await this.aufloesen(r, f);
        this.cache.set(f.path, { mtime: f.stat.mtime, r: ansicht });
        neu.push(ansicht);
      } catch (e) {
        console.error("Rezepte: konnte nicht lesen", f.path, e);
      }
    }
    for (const k of [...this.cache.keys()]) if (!dateien.some((f) => f.path === k)) this.cache.delete(k);
    this.rezepte = neu;
    await this.plugin.auftraegeAbgleichen(neu);
    this.zeichnen();
  }

  /** Bilder und Ablaufgrafik zu Ressourcenpfaden bzw. SVG-Text auflösen. */
  private async aufloesen(r: Rezept, f: TFile): Promise<RezeptAnsicht> {
    const datei = (ziel?: string) => (ziel ? this.app.metadataCache.getFirstLinkpathDest(ziel, f.path) : null);
    const src = (ziel?: string) => {
      const d = datei(ziel);
      return d ? this.app.vault.getResourcePath(d) : undefined;
    };
    let ablaufSvg: string | undefined;
    const svg = datei(r.ablauf);
    if (svg && svg.stat.size < 400_000) {
      try {
        ablaufSvg = await this.app.vault.cachedRead(svg);
      } catch {
        /* ohne Grafik */
      }
    }
    return {
      ...r,
      bildSrc: src(r.bild),
      bilderSrc: r.bilder.map((b) => src(b)).filter((x): x is string => !!x),
      ablaufSvg,
    };
  }

  private theme(): Theme {
    const m = this.plugin.einstellungen.modus;
    if (m === "hell") return "hell";
    if (m === "dunkel") return "dunkel";
    return activeDocument.body.classList.contains("theme-dark") ? "dunkel" : "hell";
  }

  zeichnen() {
    const theme = this.theme();
    this.contentEl.setAttribute("data-rz-theme", theme);
    const p = this.plugin;
    render(
      h(App, {
        rezepte: this.rezepte,
        theme,
        modus: p.einstellungen.modus,
        auftraege: p.einstellungen.auftraege,
        verarbeiter: p.verarbeiter(),
        liste: p.einstellungen.liste,
        ordner: p.einstellungen.ordner,
        start: this.start,
        onListe: (liste: string) => void p.speichern({ liste }),
        onModus: (modus: DesignModus) => void p.speichern({ modus }),
        onOeffnen: (pfad: string) => void this.notizOeffnen(pfad),
        onStatus: (pfad: string, s: Status) =>
          void this.fm(pfad, (fm) => {
            fm.status = s;
          }),
        onBewertung: (pfad: string, n: number | null) =>
          void this.fm(pfad, (fm) => {
            fm.bewertung = n;
          }),
        onGemacht: (pfad: string) =>
          void this.fm(
            pfad,
            (fm) => {
              fm.zuletzt_gemacht = heuteIso();
            },
            "Heute gemacht eingetragen.",
          ),
        onVersuch: (pfad: string, v: VersuchEingabe) => this.versuch(pfad, v),
        onImport: (eingabe: string) => p.importieren(eingabe),
        onAuftragWeg: (id: string) =>
          void p.speichern({ auftraege: p.einstellungen.auftraege.filter((a) => a.id !== id) }),
        onNochmal: (id: string) => p.nochmal(id),
        onHinweis: (text: string) => new Notice(text, 10_000),
        onWachHalten: (an: boolean) => p.wachHalten(an),
      }),
      this.contentEl,
    );
  }

  private datei(pfad: string): TFile | null {
    const d = this.app.vault.getAbstractFileByPath(pfad);
    return d instanceof TFile ? d : null;
  }

  /** Frontmatter ändern (Obsidian-API, damit Reihenfolge und Formatierung erhalten bleiben) und `aktualisiert` setzen. */
  private async fm(pfad: string, f: (fm: Record<string, unknown>) => void, hinweis?: string) {
    const d = this.datei(pfad);
    if (!d) return;
    try {
      await this.app.fileManager.processFrontMatter(d, (fm: Record<string, unknown>) => {
        f(fm);
        fm.aktualisiert = heuteIso();
      });
      if (hinweis) new Notice(hinweis);
    } catch (e) {
      new Notice(`Konnte ${d.basename} nicht ändern: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async versuch(pfad: string, v: VersuchEingabe): Promise<boolean> {
    const d = this.datei(pfad);
    if (!d) return false;
    try {
      await this.app.vault.process(d, (text) =>
        versuchEinfuegen(text, {
          datum: v.datum.trim(),
          geaendert: v.geaendert,
          ergebnis: v.ergebnis,
          bewertung: v.bewertung,
        }),
      );
      const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v.datum.trim());
      const iso = m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : heuteIso();
      await this.fm(pfad, (fm) => {
        if (v.gemacht) fm.zuletzt_gemacht = iso;
        if (v.alsBewertung && v.bewertung) fm.bewertung = v.bewertung;
      });
      new Notice("Versuch notiert.");
      return true;
    } catch (e) {
      new Notice(`Versuch nicht gespeichert: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  private async notizOeffnen(pfad: string) {
    const d = this.datei(pfad);
    if (d) await this.app.workspace.getLeaf("tab").openFile(d);
  }
}
