// Obsidian-Plugin "Better Cooking": eigene Ansicht über den Rezeptordner (Einstellung) mit Übersicht, Suche, Rezeptseite,
// Kochmodus und Import per Link. Doku: docs/architecture.md
import { Notice, Plugin, addIcon, requestUrl } from "obsidian";
import { ICON, ICON_SVG, RezepteView, VIEW_TYPE } from "./ansicht";
import { SelbstNeuladen } from "./entwicklung";
import { RezepteEinstellungen, STANDARD, type Einstellungen } from "./einstellungen";
import { lokalImportieren } from "./lokalimport";
import { seiteSelbstLesen, zusatzLesen } from "./zusatz";
import { erkenneQuelle, schluesselVon } from "./quelle";
import type { Auftrag, Rezept } from "./types";
import {
  auftragsText,
  CLAUDE_TOKEN_ID,
  fireAnfrage,
  githubAnfrage,
  GITHUB_TOKEN_ID,
  neueAuftragsId,
  pruefeAuftraege,
  repoGueltig,
  routineGueltig,
  waehleWeg,
  werteAus,
} from "./verarbeiter";

export default class RezeptePlugin extends Plugin {
  einstellungen: Einstellungen = { ...STANDARD };
  private wachSperre: { release(): Promise<void> } | null = null;

  async onload() {
    this.einstellungen = { ...STANDARD, ...(((await this.loadData()) as Partial<Einstellungen> | null) ?? {}) };
    addIcon(ICON, ICON_SVG);
    this.registerView(VIEW_TYPE, (leaf) => new RezepteView(leaf, this));
    this.addRibbonIcon(ICON, "Rezepte öffnen", () => void this.oeffnen()).addClass("eigenes-plugin");
    this.addCommand({ id: "oeffnen", name: "Rezepte öffnen", callback: () => void this.oeffnen() });
    this.addCommand({
      id: "holen",
      name: "Rezept aus Link oder Text holen",
      callback: () => void this.oeffnen({ importieren: true }),
    });
    this.addSettingTab(new RezepteEinstellungen(this.app, this));
    this.app.workspace.onLayoutReady(async () => {
      if (this.einstellungen.beimStartOeffnen) await this.oeffnen();
    });
    if (__DEV__) new SelbstNeuladen(this, VIEW_TYPE, () => this.oeffnen()).registrieren();
  }

  onunload() {
    void this.wachHalten(false);
  }

  async oeffnen(start?: { importieren?: boolean }) {
    const vorhanden = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    const leaf = vorhanden ?? this.app.workspace.getLeaf("tab");
    if (!vorhanden) await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    if (start?.importieren && leaf.view instanceof RezepteView) leaf.view.importOeffnen();
  }

  async speichern(neu: Partial<Einstellungen>) {
    this.einstellungen = { ...this.einstellungen, ...neu };
    await this.saveData(this.einstellungen);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE))
      if (leaf.view instanceof RezepteView) leaf.view.zeichnen();
  }

  /** Anderer Rezeptordner: speichern und alle offenen Ansichten neu einlesen. */
  async ordnerAendern(ordner: string) {
    await this.speichern({ ordner });
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE))
      if (leaf.view instanceof RezepteView) await leaf.view.neuLaden();
  }

  geheimnis(id: string): string | null {
    const st = (this.app as unknown as { secretStorage?: { getSecret(id: string): string | null } }).secretStorage;
    try {
      return st?.getSecret(id)?.trim() || null;
    } catch {
      return null;
    }
  }

  /** Welcher Verarbeiter einen neuen Auftrag bekäme (null: keiner eingerichtet). */
  verarbeiter(): "claude" | "github" | null {
    const e = this.einstellungen;
    const claude = !!this.geheimnis(CLAUDE_TOKEN_ID) && routineGueltig(e.routine);
    const github = !!this.geheimnis(GITHUB_TOKEN_ID) && repoGueltig(e.repo);
    return waehleWeg(e.weg, claude, github);
  }

  /** Neues Rezept anstoßen: Quelle erkennen, Auftrag an Claude oder GitHub schicken, als offen merken. */
  async importieren(eingabe: string): Promise<{ ok: boolean; meldung?: string }> {
    const e = erkenneQuelle(eingabe);
    if (e.art === "leer") return { ok: false, meldung: "Bitte einen Link oder ein Rezept einfügen." };
    const weg = this.verarbeiter();
    // Rezeptseiten direkt lesen (schema.org, ohne KI), außer die Einstellung gibt sie lieber dem Verarbeiter;
    // ohne Rezeptdaten geht es an den Verarbeiter.
    if (e.art === "webseite" && e.url && seiteSelbstLesen(this.einstellungen.lokalZuerst, !!weg)) {
      const zusatz = zusatzLesen(this.einstellungen.zusatz).eigenschaften;
      const l = await lokalImportieren(this.app, this.einstellungen.ordner, e.url, zusatz);
      if (l.status === "gespeichert")
        return {
          ok: true,
          meldung:
            l.stand === "fertig"
              ? `Gespeichert: ${l.titel}.`
              : `Gespeichert: ${l.titel}. Die Seite war unvollständig, bitte Zutaten und Schritte prüfen.`,
        };
      if (!weg)
        return {
          ok: false,
          meldung:
            l.status === "fehler"
              ? l.meldung
              : "Keine Rezeptdaten gefunden: Die Seite hat kein schema.org-Rezept oder sperrt automatische Abrufe. Dafür braucht es einen Verarbeiter (Einstellungen).",
        };
    }
    if (!weg) return { ok: false, meldung: "Kein Verarbeiter eingerichtet (Einstellungen → Better Cooking)." };
    const id = neueAuftragsId();
    const a = { id, eingabe: e.url ?? eingabe };
    try {
      const anfrage =
        weg === "claude"
          ? fireAnfrage(this.einstellungen.routine, this.geheimnis(CLAUDE_TOKEN_ID)!, auftragsText(a, e))
          : githubAnfrage(this.einstellungen.repo, this.geheimnis(GITHUB_TOKEN_ID)!, a, e);
      const res = await requestUrl(anfrage);
      let json: unknown = null;
      try {
        json = res.json;
      } catch {
        /* 204 ohne Inhalt */
      }
      const w = werteAus(weg, res.status, json);
      if (!w.ok) return { ok: false, meldung: w.meldung };
      const auftrag: Auftrag = {
        id,
        eingabe: a.eingabe,
        art: e.art,
        schluessel: e.schluessel,
        seit: Date.now(),
        weg,
        sitzung: w.sitzung,
      };
      await this.speichern({ auftraege: [...this.einstellungen.auftraege, auftrag] });
      return {
        ok: true,
        meldung:
          weg === "claude"
            ? "Claude holt das Rezept. Es erscheint in ein paar Minuten in der Übersicht."
            : "Die GitHub-Action holt das Rezept. Es erscheint nach dem nächsten Git-Sync in der Übersicht.",
      };
    } catch (err) {
      return {
        ok: false,
        meldung: `Keine Verbindung (${err instanceof Error ? err.message.slice(0, 80) : "unbekannt"})`,
      };
    }
  }

  /** Auftrag mit derselben Eingabe neu anstoßen; der alte verschwindet nur, wenn der neue angenommen wurde. */
  async nochmal(id: string): Promise<{ ok: boolean; meldung?: string }> {
    const alt = this.einstellungen.auftraege.find((a) => a.id === id);
    if (!alt) return { ok: false, meldung: "Auftrag nicht mehr da." };
    const r = await this.importieren(alt.eingabe);
    if (r.ok) await this.speichern({ auftraege: this.einstellungen.auftraege.filter((a) => a.id !== id) });
    return r;
  }

  async auftraegeAbgleichen(rezepte: Rezept[]) {
    if (!this.einstellungen.auftraege.length) return;
    const r = pruefeAuftraege(this.einstellungen.auftraege, rezepte, schluesselVon, Date.now());
    for (const f of r.fertig) new Notice(`Rezept angekommen: ${f.rezept.titel}`);
    const vorher = JSON.stringify(this.einstellungen.auftraege);
    if (JSON.stringify(r.offen) !== vorher) await this.speichern({ auftraege: r.offen });
  }

  /** Bildschirm im Kochmodus anlassen (Screen Wake Lock); false, wenn das Gerät es nicht kann. */
  async wachHalten(an: boolean): Promise<boolean> {
    try {
      if (!an) {
        await this.wachSperre?.release();
        this.wachSperre = null;
        return false;
      }
      const wl = (
        navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }
      ).wakeLock;
      if (!wl) return false;
      this.wachSperre = await wl.request("screen");
      return true;
    } catch {
      return false;
    }
  }
}
