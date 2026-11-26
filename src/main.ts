// Obsidian plugin "Better Cooking": its own view of the recipe folder (setting) with overview, search, recipe page,
// cooking mode and import by link. Docs: docs/architecture.md
import { Notice, Plugin, addIcon, getLanguage, requestUrl } from "obsidian";
import { ICON, ICON_SVG, BetterCookingView, VIEW_TYPE } from "./view";
import { SelfReload } from "./development";
import { DEFAULTS, type Settings } from "./settings";
import { BetterCookingSettingTab } from "./settingsTab";
import { migrateSettings } from "./migrate";
import { language, setLanguage, tr } from "./i18n";
import { makeNoteFormat, ownFieldNames, type NoteFormat } from "./noteFormat";
import { ListNotes } from "./listNotes";
import type { Page } from "./ui/pages";
import { importLocally, saveRecipe } from "./localImport";
import { readPageLocally, readExtraProperties } from "./extraProperties";
import { detectSource, keyOf } from "./source";
import { findingsText } from "./importCheck";
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
  processorStatus,
  type Ready,
  noRecipeDataMessage,
  evaluateResponse,
  aiCanRead,
  type ActiveProcessor,
} from "./processor";
import { AI_KEY_ID, aiReady, type AiSettings } from "./ai";
import { importWithAi, translateWithAi } from "./aiImport";
import { recipeFromText } from "./textRecipe";

const savedMessage = (l: { state: "fertig" | "teilweise"; title: string }) =>
  l.state === "fertig" ? tr("savedRecipe", { title: l.title }) : tr("savedPartial", { title: l.title });

export default class BetterCookingPlugin extends Plugin {
  /** Shopping list and meal plan notes. */
  lists = new ListNotes(this);
  settings: Settings = { ...DEFAULTS };
  private wakeLockRef: { release(): Promise<void> } | null = null;

  async onload() {
    setLanguage(getLanguage());
    const saved: unknown = await this.loadData();
    // New installations write notes in Obsidian's language; existing ones stay German (migrateSettings).
    this.settings = { ...DEFAULTS, noteFormat: language(), ...migrateSettings(saved) };
    addIcon(ICON, ICON_SVG);
    this.registerView(VIEW_TYPE, (leaf) => new BetterCookingView(leaf, this));
    this.addRibbonIcon(ICON, tr("openRecipes"), () => void this.open()).addClass("eigenes-plugin");
    this.addCommand({ id: "oeffnen", name: tr("openRecipes"), callback: () => void this.open() });
    this.addCommand({
      id: "holen",
      name: tr("fetchRecipeCommand"),
      callback: () => void this.open({ importRecipe: true }),
    });
    this.addCommand({
      id: "shopping-list",
      name: tr("openShoppingList"),
      callback: () => void this.open({ page: "shopping" }),
    });
    this.addCommand({
      id: "shopping-list-note",
      name: tr("openShoppingNote"),
      callback: () => void this.lists.openShoppingList(),
    });
    this.addCommand({
      id: "shopping-list-clear",
      name: tr("clearShoppingList"),
      callback: () => void this.lists.clearShoppingList(),
    });
    this.addCommand({
      id: "meal-plan",
      name: tr("openMealPlan"),
      callback: () => void this.lists.openMealPlan(),
    });
    this.addCommand({
      id: "meal-plan-shopping",
      name: tr("planToShopping"),
      callback: () => void this.lists.planToShoppingList(),
    });
    this.addCommand({
      id: "meal-plan-ics",
      name: tr("planExport"),
      callback: () => void this.lists.exportMealPlan(),
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

  async open(start?: { importRecipe?: boolean; page?: Page }) {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    const leaf = existing ?? this.app.workspace.getLeaf("tab");
    if (!existing) await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    if (!(leaf.view instanceof BetterCookingView)) return;
    if (start?.importRecipe) leaf.view.openImport();
    if (start?.page) leaf.view.goTo(start.page);
  }

  async save(fresh: Partial<Settings>) {
    this.settings = { ...this.settings, ...fresh };
    await this.saveData(this.settings);
    // Another note for the shopping list or meal plan: the pages read the new one.
    const shopping = "shoppingList" in fresh || "mealPlan" in fresh || "noteFormat" in fresh;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (!(leaf.view instanceof BetterCookingView)) continue;
      if (shopping) void leaf.view.refreshLists();
      else leaf.view.render();
    }
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

  /** Field names and language for notes the plugin writes (settings "Note format" and "Own field names"). */
  noteFormat(): NoteFormat {
    return makeNoteFormat(this.settings.noteFormat, this.settings.fieldNames).format;
  }

  /** Which processor a new recipe would get (null: none) and why not, computed once from the setup. */
  processorInfo() {
    const ready = this.processorsReady();
    const chosen = this.settings.processor;
    return {
      active: chooseProcessor(chosen, ready.claude, ready.github, ready.ai),
      ready,
      status: processorStatus(chosen, ready),
    };
  }

  processor(): ActiveProcessor | null {
    return this.processorInfo().active;
  }

  /** Which processors are set up (token or key and address present), whatever is chosen. */
  private processorsReady(): Ready {
    const e = this.settings;
    return {
      claude: !!this.secret(CLAUDE_TOKEN_ID) && routineValid(e.routine),
      github: !!this.secret(GITHUB_TOKEN_ID) && repoValid(e.repo),
      ai: aiReady(this.ai(), !!this.secret(AI_KEY_ID)),
    };
  }

  ai(): AiSettings {
    return { provider: this.settings.aiProvider, endpoint: this.settings.aiEndpoint, model: this.settings.aiModel };
  }

  private extraProperties(format: NoteFormat) {
    return readExtraProperties(this.settings.extraProperties, ownFieldNames(format)).properties;
  }

  /** Start a new recipe: read a recipe website itself, ask the own AI, or send a job to Claude or GitHub. */
  /** The own AI can be used, whatever the processor setting says (translations, #10). */
  aiAvailable(): boolean {
    return aiReady(this.ai(), !!this.secret(AI_KEY_ID));
  }

  /** Translates a recipe note with the own AI into a new note; returns its path. */
  async translateRecipe(original: Recipe, language: string): Promise<{ ok: boolean; message?: string; path?: string }> {
    const format = this.noteFormat();
    const r = await translateWithAi(
      this.app,
      this.settings.folder,
      this.ai(),
      this.secret(AI_KEY_ID),
      original,
      language,
      this.extraProperties(format),
      format,
    );
    if (r.status === "fehler") return { ok: false, message: r.message };
    new Notice(tr("translated", { title: r.title }));
    return { ok: true, path: r.path };
  }

  async importRecipe(input: string): Promise<{ ok: boolean; message?: string }> {
    const e = detectSource(input);
    if (e.kind === "leer") return { ok: false, message: tr("pasteLinkOrRecipe") };
    const { active: processor, ready, status } = this.processorInfo();
    const format = this.noteFormat();
    let html: string | undefined;
    // Read recipe websites directly (schema.org, no AI), unless the setting prefers the processor;
    // without recipe data the page goes to the processor.
    if (e.kind === "webseite" && e.url && readPageLocally(this.settings.readWebsitesLocally, !!processor)) {
      const l = await importLocally(this.app, this.settings.folder, e.url, this.extraProperties(format), format);
      if (l.status === "gespeichert") return { ok: true, message: savedMessage(l) };
      if (!processor)
        return {
          ok: false,
          message: l.status === "fehler" ? l.message : noRecipeDataMessage(this.settings.processor, ready),
        };
      if (l.status === "keinSchema") html = l.html;
    }
    // Pasted text without a processor: structure it with offline rules (#15).
    if (e.kind === "text" && !processor) {
      const r = recipeFromText(input);
      if (!r) return { ok: false, message: tr("textNoRecipe") };
      const saved = await saveRecipe(this.app, this.settings.folder, r, {
        extraProperties: this.extraProperties(format),
        format,
      });
      return { ok: true, message: tr("savedFromText", { title: saved.title }) };
    }
    if (processor === "ai") {
      if (!aiCanRead(e.kind)) return { ok: false, message: tr("aiSocial") };
      const source = e.kind === "text" ? { text: input } : { url: e.url, html };
      const r = await importWithAi(
        this.app,
        this.settings.folder,
        this.ai(),
        this.secret(AI_KEY_ID),
        source,
        this.extraProperties(format),
        format,
      );
      return r.status === "fehler" ? { ok: false, message: r.message } : { ok: true, message: savedMessage(r) };
    }
    if (!processor) return { ok: false, message: status.long };
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
        message: processor === "claude" ? tr("claudeFetching") : tr("githubFetching"),
      };
    } catch (err) {
      return {
        ok: false,
        message: tr("noConnection", { error: err instanceof Error ? err.message.slice(0, 80) : tr("unknown") }),
      };
    }
  }

  /** Start a job again with the same input; the old one disappears only once the new one was accepted. */
  async retry(id: string): Promise<{ ok: boolean; message?: string }> {
    const old = this.settings.jobs.find((a) => a.id === id);
    if (!old) return { ok: false, message: tr("jobGone") };
    const r = await this.importRecipe(old.input);
    if (r.ok) await this.save({ jobs: this.settings.jobs.filter((a) => a.id !== id) });
    return r;
  }

  async reconcileJobs(recipes: Recipe[]) {
    if (!this.settings.jobs.length) return;
    const r = checkJobs(this.settings.jobs, recipes, keyOf, Date.now());
    for (const f of r.done)
      new Notice(
        f.recipe.findings
          ? tr("recipeSuspicious", { title: f.recipe.title, what: findingsText(f.recipe.findings) })
          : tr("recipeArrived", { title: f.recipe.title }),
        f.recipe.findings ? 0 : 5000,
      );
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
