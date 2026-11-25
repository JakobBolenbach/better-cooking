// Selbst-Neuladen nur für Entwicklungs-Builds (`pnpm dev`): Ändern sich main.js, styles.css oder manifest.json
// auf der Platte, lädt sich das Plugin neu und öffnet seine Ansicht wieder. Release-Builds enthalten diesen Code
// nicht (esbuild setzt __DEV__ auf false und entfernt ihn), weil Obsidian Plugins verbietet, sich selbst zu aktualisieren.
// Die Entscheidung, wann neu geladen wird, ist die reine Funktion in src/neuladen.ts.
import { Notice, type Plugin } from "obsidian";
import { nextStep } from "./reload";

const PLUGIN_FILES = ["main.js", "styles.css", "manifest.json"];
const CHECK_INTERVAL_MS = 3000;

export class SelfReload {
  private stamp = "";
  private candidate = "";
  private reloading = false;
  private readonly marker: string;

  constructor(
    private plugin: Plugin,
    private viewType: string,
    private open: () => Promise<void>,
  ) {
    this.marker = `${plugin.manifest.id}:wieder-oeffnen`;
  }

  /** In onload aufrufen: Befehl anlegen, nach einem Neuladen die Ansicht wieder öffnen, Dateien beobachten. */
  register() {
    const p = this.plugin;
    p.addCommand({ id: "neu-laden", name: "Reload plugin (development)", callback: () => void this.restart() });
    p.app.workspace.onLayoutReady(async () => {
      if (this.readMarker()) {
        await this.open();
        new Notice(`${p.manifest.name} ${await this.versionOnDisk()} reloaded.`);
      }
      this.stamp = await this.fileStamp();
      p.registerInterval(window.setInterval(() => void this.check(), CHECK_INTERVAL_MS));
    });
  }

  private async check() {
    if (this.reloading || !this.stamp) return;
    const r = nextStep(this.stamp, this.candidate, await this.fileStamp());
    this.candidate = r.candidate;
    if (r.reload) await this.restart();
  }

  private folder(): string {
    const p = this.plugin;
    return p.manifest.dir ?? `${p.app.vault.configDir}/plugins/${p.manifest.id}`;
  }

  /** Obsidian behält das Manifest bis zum App-Neustart im Speicher; nach dem Neuladen zählt die Datei. */
  private async versionOnDisk(): Promise<string> {
    const p = this.plugin;
    try {
      const text = await p.app.vault.adapter.read(`${this.folder()}/manifest.json`);
      const v = (JSON.parse(text) as { version?: unknown }).version;
      return typeof v === "string" ? v : p.manifest.version;
    } catch {
      return p.manifest.version;
    }
  }

  private async fileStamp(): Promise<string> {
    const a = this.plugin.app.vault.adapter;
    const parts = await Promise.all(
      PLUGIN_FILES.map(async (f) => {
        try {
          const st = await a.stat(`${this.folder()}/${f}`);
          return st ? `${st.mtime}:${st.size}` : "-";
        } catch {
          return "?";
        }
      }),
    );
    return parts.join("|");
  }

  private async restart() {
    if (this.reloading) return;
    this.reloading = true;
    const p = this.plugin;
    try {
      if (p.app.workspace.getLeavesOfType(this.viewType).length) window.localStorage.setItem(this.marker, "1");
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

  private readMarker(): boolean {
    try {
      const da = window.localStorage.getItem(this.marker) === "1";
      window.localStorage.removeItem(this.marker);
      return da;
    } catch {
      return false;
    }
  }
}
