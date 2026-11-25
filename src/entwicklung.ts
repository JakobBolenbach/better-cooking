// Selbst-Neuladen nur für Entwicklungs-Builds (`pnpm dev`): Ändern sich main.js, styles.css oder manifest.json
// auf der Platte, lädt sich das Plugin neu und öffnet seine Ansicht wieder. Release-Builds enthalten diesen Code
// nicht (esbuild setzt __DEV__ auf false und entfernt ihn), weil Obsidian Plugins verbietet, sich selbst zu aktualisieren.
// Die Entscheidung, wann neu geladen wird, ist die reine Funktion in src/neuladen.ts.
import { Notice, type Plugin } from "obsidian";
import { naechsterSchritt } from "./neuladen";

const PLUGIN_DATEIEN = ["main.js", "styles.css", "manifest.json"];
const PRUEF_TAKT_MS = 3000;

export class SelbstNeuladen {
  private stempel = "";
  private kandidat = "";
  private laedtNeu = false;
  private readonly merker: string;

  constructor(
    private plugin: Plugin,
    private viewType: string,
    private oeffnen: () => Promise<void>,
  ) {
    this.merker = `${plugin.manifest.id}:wieder-oeffnen`;
  }

  /** In onload aufrufen: Befehl anlegen, nach einem Neuladen die Ansicht wieder öffnen, Dateien beobachten. */
  registrieren() {
    const p = this.plugin;
    p.addCommand({ id: "neu-laden", name: "Reload plugin (development)", callback: () => void this.neuStarten() });
    p.app.workspace.onLayoutReady(async () => {
      if (this.merkerLesen()) {
        await this.oeffnen();
        new Notice(`${p.manifest.name} ${await this.versionAufPlatte()} reloaded.`);
      }
      this.stempel = await this.dateiStempel();
      p.registerInterval(window.setInterval(() => void this.pruefen(), PRUEF_TAKT_MS));
    });
  }

  private async pruefen() {
    if (this.laedtNeu || !this.stempel) return;
    const r = naechsterSchritt(this.stempel, this.kandidat, await this.dateiStempel());
    this.kandidat = r.kandidat;
    if (r.neuLaden) await this.neuStarten();
  }

  private ordner(): string {
    const p = this.plugin;
    return p.manifest.dir ?? `${p.app.vault.configDir}/plugins/${p.manifest.id}`;
  }

  /** Obsidian behält das Manifest bis zum App-Neustart im Speicher; nach dem Neuladen zählt die Datei. */
  private async versionAufPlatte(): Promise<string> {
    const p = this.plugin;
    try {
      const text = await p.app.vault.adapter.read(`${this.ordner()}/manifest.json`);
      const v = (JSON.parse(text) as { version?: unknown }).version;
      return typeof v === "string" ? v : p.manifest.version;
    } catch {
      return p.manifest.version;
    }
  }

  private async dateiStempel(): Promise<string> {
    const a = this.plugin.app.vault.adapter;
    const teile = await Promise.all(
      PLUGIN_DATEIEN.map(async (f) => {
        try {
          const st = await a.stat(`${this.ordner()}/${f}`);
          return st ? `${st.mtime}:${st.size}` : "-";
        } catch {
          return "?";
        }
      }),
    );
    return teile.join("|");
  }

  private async neuStarten() {
    if (this.laedtNeu) return;
    this.laedtNeu = true;
    const p = this.plugin;
    try {
      if (p.app.workspace.getLeavesOfType(this.viewType).length) window.localStorage.setItem(this.merker, "1");
    } catch {
      /* ohne Merker: Ansicht bleibt nach dem Neuladen zu */
    }
    const plugins = (
      p.app as unknown as {
        plugins: { disablePlugin(id: string): Promise<void>; enablePlugin(id: string): Promise<boolean> };
      }
    ).plugins;
    await plugins.disablePlugin(p.manifest.id);
    await plugins.enablePlugin(p.manifest.id);
  }

  private merkerLesen(): boolean {
    try {
      const da = window.localStorage.getItem(this.merker) === "1";
      window.localStorage.removeItem(this.merker);
      return da;
    } catch {
      return false;
    }
  }
}
