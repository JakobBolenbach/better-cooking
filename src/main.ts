// Obsidian plugin "Better Cooking": its own view of the recipe folder (setting) with overview, search, recipe page,
// cooking mode and import by link. Docs: docs/architecture.md
import { Notice, Plugin, addIcon, requestUrl } from "obsidian";
import { ICON, ICON_SVG, BetterCookingView, VIEW_TYPE } from "./view";
import { SelfReload } from "./development";
import { BetterCookingSettingTab, DEFAULTS, type Settings } from "./settings";
import { migrateSettings } from "./migrate";
import { importLocally } from "./localImport";
import { readPageLocally, readExtraProperties } from "./extraProperties";
import { detectSource, keyOf } from "./source";
import type { Job, Recipe } from "./types";
import {
  jobText,
  CLAUDE_TOKEN_ID,
  fireRequest,
  githubRequest,
  GITHUB_TOKEN_ID,
  newJobId,
  checkJobs,
  repoValid,
  routineValid,
  chooseProcessor,
  evaluateResponse,
} from "./processor";

export default class BetterCookingPlugin extends Plugin {
  settings: Settings = { ...DEFAULTS };
  private wakeLockRef: { release(): Promise<void> } | null = null;

  async onload() {
    this.settings = { ...DEFAULTS, ...migrateSettings(await this.loadData()) };
    addIcon(ICON, ICON_SVG);
    this.registerView(VIEW_TYPE, (leaf) => new BetterCookingView(leaf, this));
    this.addRibbonIcon(ICON, "Rezepte öffnen", () => void this.open()).addClass("eigenes-plugin");
    this.addCommand({ id: "oeffnen", name: "Rezepte öffnen", callback: () => void this.open() });
    this.addCommand({
      id: "holen",
      name: "Rezept aus Link oder Text holen",
      callback: () => void this.open({ importRecipe: true }),
    });
    this.addSettingTab(new BetterCookingSettingTab(this.app, this));
    this.app.workspace.onLayoutReady(async () => {
      if (this.settings.openOnStartup) await this.open();
    });
    if (__DEV__) new SelfReload(this, VIEW_TYPE, () => this.open()).register();
  }

  onunload() {
    void this.keepAwake(false);
  }

  async open(start?: { importRecipe?: boolean }) {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    const leaf = existing ?? this.app.workspace.getLeaf("tab");
    if (!existing) await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    if (start?.importRecipe && leaf.view instanceof BetterCookingView) leaf.view.openImport();
  }

  async save(fresh: Partial<Settings>) {
    this.settings = { ...this.settings, ...fresh };
    await this.saveData(this.settings);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE))
      if (leaf.view instanceof BetterCookingView) leaf.view.render();
  }

  /** Different recipe folder: save and reload all open views. */
  async changeFolder(folder: string) {
    await this.save({ folder });
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE))
      if (leaf.view instanceof BetterCookingView) await leaf.view.reload();
  }

  secret(id: string): string | null {
    const st = (this.app as unknown as { secretStorage?: { getSecret(id: string): string | null } }).secretStorage;
    try {
      return st?.getSecret(id)?.trim() || null;
    } catch {
      return null;
    }
  }

  /** Which processor a new job would get (null: none set up). */
  processor(): "claude" | "github" | null {
    const e = this.settings;
    const claude = !!this.secret(CLAUDE_TOKEN_ID) && routineValid(e.routine);
    const github = !!this.secret(GITHUB_TOKEN_ID) && repoValid(e.repo);
    return chooseProcessor(e.processor, claude, github);
  }

  /** Start a new recipe: detect the source, send the job to Claude or GitHub, remember it as open. */
  async importRecipe(input: string): Promise<{ ok: boolean; message?: string }> {
    const e = detectSource(input);
    if (e.kind === "leer") return { ok: false, message: "Bitte einen Link oder ein Rezept einfügen." };
    const processor = this.processor();
    // Read recipe websites directly (schema.org, no AI), unless the setting prefers the processor;
    // without recipe data the page goes to the processor.
    if (e.kind === "webseite" && e.url && readPageLocally(this.settings.readWebsitesLocally, !!processor)) {
      const extraProperties = readExtraProperties(this.settings.extraProperties).properties;
      const l = await importLocally(this.app, this.settings.folder, e.url, extraProperties);
      if (l.status === "gespeichert")
        return {
          ok: true,
          message:
            l.state === "fertig"
              ? `Gespeichert: ${l.title}.`
              : `Gespeichert: ${l.title}. Die Seite war unvollständig, bitte Zutaten und Schritte prüfen.`,
        };
      if (!processor)
        return {
          ok: false,
          message:
            l.status === "fehler"
              ? l.message
              : "Keine Rezeptdaten gefunden: Die Seite hat kein schema.org-Rezept oder sperrt automatische Abrufe. Dafür braucht es einen Verarbeiter (Einstellungen).",
        };
    }
    if (!processor) return { ok: false, message: "Kein Verarbeiter eingerichtet (Einstellungen → Better Cooking)." };
    const id = newJobId();
    const a = { id, input: e.url ?? input };
    try {
      const request =
        processor === "claude"
          ? fireRequest(this.settings.routine, this.secret(CLAUDE_TOKEN_ID)!, jobText(a, e))
          : githubRequest(this.settings.repo, this.secret(GITHUB_TOKEN_ID)!, a, e);
      const res = await requestUrl(request);
      let json: unknown = null;
      try {
        json = res.json;
      } catch {
        /* 204 ohne Inhalt */
      }
      const w = evaluateResponse(processor, res.status, json);
      if (!w.ok) return { ok: false, message: w.message };
      const job: Job = {
        id,
        input: a.input,
        kind: e.kind,
        key: e.key,
        since: Date.now(),
        processor,
        session: w.session,
      };
      await this.save({ jobs: [...this.settings.jobs, job] });
      return {
        ok: true,
        message:
          processor === "claude"
            ? "Claude holt das Rezept. Es erscheint in ein paar Minuten in der Übersicht."
            : "Die GitHub-Action holt das Rezept. Es erscheint nach dem nächsten Git-Sync in der Übersicht.",
      };
    } catch (err) {
      return {
        ok: false,
        message: `Keine Verbindung (${err instanceof Error ? err.message.slice(0, 80) : "unbekannt"})`,
      };
    }
  }

  /** Start a job again with the same input; the old one disappears only once the new one was accepted. */
  async retry(id: string): Promise<{ ok: boolean; message?: string }> {
    const old = this.settings.jobs.find((a) => a.id === id);
    if (!old) return { ok: false, message: "Auftrag nicht mehr da." };
    const r = await this.importRecipe(old.input);
    if (r.ok) await this.save({ jobs: this.settings.jobs.filter((a) => a.id !== id) });
    return r;
  }

  async reconcileJobs(recipes: Recipe[]) {
    if (!this.settings.jobs.length) return;
    const r = checkJobs(this.settings.jobs, recipes, keyOf, Date.now());
    for (const f of r.done) new Notice(`Rezept angekommen: ${f.recipe.title}`);
    const before = JSON.stringify(this.settings.jobs);
    if (JSON.stringify(r.pending) !== before) await this.save({ jobs: r.pending });
  }

  /** Keep the screen on in cooking mode (Screen Wake Lock); false if the device cannot do it. */
  async keepAwake(an: boolean): Promise<boolean> {
    try {
      if (!an) {
        await this.wakeLockRef?.release();
        this.wakeLockRef = null;
        return false;
      }
      const wl = (
        navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }
      ).wakeLock;
      if (!wl) return false;
      this.wakeLockRef = await wl.request("screen");
      return true;
    } catch {
      return false;
    }
  }
}
