// Obsidian plugin "Better Cooking": its own view of the recipe folder (setting) with overview, search, recipe page,
// cooking mode and import by link. Docs: docs/architecture.md
import { Notice, Plugin, addIcon, getLanguage } from "obsidian";
import { ICON, ICON_SVG, BetterCookingView, VIEW_TYPE } from "./view";
import { SelfReload } from "./development";
import { DEFAULTS, type Settings } from "./settings";
import { BetterCookingSettingTab } from "./settingsTab";
import { migrateSettings } from "./migrate";
import { SettingsSync } from "./settingsSync";
import { SettingsViews } from "./settingsViews";
import { resolveLanguage, resolveNoteLang, setLanguage, language, tr, type Lang } from "./i18n";
import { makeNoteFormat, ownFieldNames, type NoteFormat } from "./noteFormat";
import { ListNotes } from "./listNotes";
import { Refetcher } from "./refetchService";
import { RecipeDeleter } from "./deleteService";
import { RecipeEditor } from "./recipeEditService";
import { moveCover, pruneCovers } from "./refetch";
import type { Page } from "./ui/pages";
import { importLocally, savedMessage } from "./localImport";
import { readPageLocally, readExtraProperties } from "./extraProperties";
import { detectSource, type Detection, type Kind } from "./source";
import { replaceJob } from "./importFailure";
import { reconcileJobs } from "./jobReconcile";
import type { Recipe } from "./types";
import {
  CLAUDE_TOKEN_ID,
  GITHUB_TOKEN_ID,
  repoValid,
  routineValid,
  chooseProcessor,
  processorStatus,
  type Ready,
  noRecipeDataMessage,
  processorName,
  retryImprove,
  type ActiveProcessor,
} from "./processor";
import { AI_KEY_ID, aiReady, type AiSettings } from "./ai";
import { importWithAi, translateWithAi } from "./aiImport";
import { socialRoute } from "./socialFlow";
import { startJob } from "./jobStart";
import { importSocialPost } from "./socialStart";
import { importPastedText } from "./pastedText";
import { registerCommands } from "./commands";
import { ImportSync, deviceId } from "./importSyncService";
import { ImproveService } from "./improveService";
import { TimerService } from "./timerService";

/** The answer of a job request: `job` is the ID of the new job. */
type SentJob = { ok: boolean; message?: string; job?: string };

export default class BetterCookingPlugin extends Plugin {
  /** Shopping list and meal plan notes. */
  lists = new ListNotes(this);
  /** "Fetch again" on the recipe page (issue #63). */
  refetcher = new Refetcher(this);
  deleter = new RecipeDeleter(this);
  editor = new RecipeEditor(this);
  /** Asks the Git plugin to sync while an import waits (issue #82). */
  importSync = new ImportSync(this);
  /** Improvement proposals of processors, merged into their notes (ADR 0007). */
  improve = new ImproveService(this);
  /** Cooking timers: alerts, saved list, screen lock (issue #58). */
  timers = new TimerService(this);
  settings: Settings = { ...DEFAULTS };
  private retrying = new Set<string>();
  /** Merges an externally changed data.json and refreshes the views (#90). */
  settingsViews = new SettingsViews(this);
  settingsSync = new SettingsSync(this.settingsViews.io());

  async onload() {
    const saved: unknown = await this.loadData();
    // New installations write notes like the interface language; existing ones keep their stored value (migrateSettings).
    this.settings = { ...DEFAULTS, ...migrateSettings(saved) };
    this.applyLanguage();
    // A new installation writes notes in the language it is used in: the concrete language is set in memory (nothing is
    // written at load) and stored with the first real save, so the notes stay the same on every device; "like the
    // interface" is an explicit choice (and may differ per device).
    if (saved == null) this.settings.noteFormat = language();
    this.settingsSync.setBase(this.settings);
    addIcon(ICON, ICON_SVG);
    this.registerView(VIEW_TYPE, (leaf) => new BetterCookingView(leaf, this));
    this.addRibbonIcon(ICON, tr("openRecipes"), () => void this.open()).addClass("eigenes-plugin");
    registerCommands(this);
    this.importSync.start();
    this.improve.start();
    this.timers.start();
    this.addSettingTab((this.settingsViews.tab = new BetterCookingSettingTab(this.app, this)));
    // Remembered cover addresses follow their notes (rename, delete) and are cleaned of vanished notes at start.
    const covers = (next: Record<string, string>) =>
      JSON.stringify(next) !== JSON.stringify(this.settings.coverUrls) && void this.save({ coverUrls: next });
    this.registerEvent(
      this.app.vault.on("rename", (f, old) => covers(moveCover(this.settings.coverUrls, old, f.path))),
    );
    this.registerEvent(this.app.vault.on("delete", (f) => covers(moveCover(this.settings.coverUrls, f.path))));
    this.lists.followRecords();
    // A stored path of a list note follows its note when it is renamed; a deleted note leaves the path (it is created there again).
    this.registerEvent(this.app.vault.on("rename", (f, old) => this.lists.follow(old, f.path)));
    this.app.workspace.onLayoutReady(async () => {
      covers(pruneCovers(this.settings.coverUrls, (p) => !!this.app.vault.getAbstractFileByPath(p)));
      void this.lists.cleanRecords();
      if (this.settings.openOnStartup) await this.open();
    });
    if (__DEV__) new SelfReload(this, VIEW_TYPE, () => this.open()).register();
  }

  onunload() {
    void this.keepAwake(false);
    this.timers.stop();
  }

  async open(start?: { importRecipe?: boolean; page?: Page; recipe?: string }) {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    const leaf = existing ?? this.app.workspace.getLeaf("tab");
    if (!existing) await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
    if (!(leaf.view instanceof BetterCookingView)) return;
    if (start?.importRecipe) leaf.view.openImport();
    if (start?.page) leaf.view.goTo(start.page);
    // A timer or notification of a deleted recipe: say so instead of showing nothing.
    if (start?.recipe && !this.app.vault.getAbstractFileByPath(start.recipe)) new Notice(tr("deleteGone"));
    else if (start?.recipe) leaf.view.goTo("overview", start.recipe);
  }

  async save(fresh: Partial<Settings>) {
    this.settings = { ...this.settings, ...fresh };
    if ("language" in fresh) this.applyLanguage();
    await this.settingsSync.write();
    this.settingsViews.refresh(Object.keys(fresh));
  }

  /** data.json changed on disk by another device (#90). */
  onExternalSettingsChange() {
    return this.settingsSync.onExternal();
  }

  /** Different recipe folder: save and reload all open views. */
  async changeFolder(folder: string) {
    await this.save({ folder });
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE))
      if (leaf.view instanceof BetterCookingView) await leaf.view.reload();
  }

  secret(id: string): string | null {
    const st = this.app.secretStorage;
    try {
      return st.getSecret(id)?.trim() || null;
    } catch {
      return null;
    }
  }

  /** The interface language from the setting "Language" and Obsidian's language; used by all texts shown (issue #77). */
  applyLanguage() {
    setLanguage(resolveLanguage(this.settings.language, getLanguage()));
  }

  /** Language of what the plugin writes into notes (setting "Language of new notes"). */
  noteLang(): Lang {
    return resolveNoteLang(this.settings.noteFormat, language());
  }

  /** Field names and language for notes the plugin writes (settings "Language of new notes" and "Own field names"). */
  noteFormat(): NoteFormat {
    return makeNoteFormat(this.noteLang(), this.settings.fieldNames).format;
  }

  /** Which processor a new recipe would get (null: none) and why not, computed once from the setup. */
  processorInfo() {
    const ready = this.processorsReady();
    const chosen = this.settings.processor;
    return {
      active: chooseProcessor(chosen, ready.claude, ready.github, ready.ai),
      ready,
      status: processorStatus(chosen, ready),
      /** The way for a social media link (src/socialFlow.ts). */
      route: (kind: Kind) => socialRoute(kind, chosen, ready),
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

  extraProperties(format: NoteFormat) {
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

  async importRecipe(input: string, recipes: { source?: string }[] = []): Promise<{ ok: boolean; message?: string }> {
    const e = detectSource(input);
    if (e.kind === "leer") return { ok: false, message: tr("pasteLinkOrRecipe") };
    const info = this.processorInfo();
    let { active: processor } = info;
    const { ready, status } = info;
    const format = this.noteFormat();
    const social = await importSocialPost(this, e, info, format, recipes);
    if (social && "done" in social) return social.done;
    let localFailure: string | undefined;
    if (social) {
      processor = social.processor;
      localFailure = social.failure;
    }
    let html: string | undefined;
    // Read recipe websites directly (schema.org, no AI), unless the setting prefers the processor;
    // without recipe data the page goes to the processor.
    if (e.kind === "webseite" && e.url && readPageLocally(this.settings.readWebsitesLocally, !!processor)) {
      const l = await importLocally(this.app, this.settings.folder, e.url, this.extraProperties(format), format);
      if (l.status === "gespeichert") {
        await this.rememberCover(l.path, l.coverUrl);
        return { ok: true, message: savedMessage(l) };
      }
      if (!processor)
        return {
          ok: false,
          message: l.status === "fehler" ? l.message : noRecipeDataMessage(this.settings.processor, ready),
        };
      if (l.status === "keinSchema") html = l.html;
    }
    const pasted = await importPastedText(
      { app: this.app, folder: this.settings.folder, extraProperties: this.extraProperties(format), format },
      e,
      input,
      processor,
    );
    if (pasted) return pasted;
    if (processor === "ai") {
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
      if (r.status === "fehler") return { ok: false, message: r.message };
      await this.rememberCover(r.path, r.coverUrl);
      return { ok: true, message: savedMessage(r) };
    }
    if (!processor) return { ok: false, message: status.long };
    return this.sendJob(e, input, processor, localFailure);
  }

  /** Sends a job to Claude or GitHub and remembers it until its note arrives. */
  private async sendJob(
    e: Detection,
    input: string,
    processor: "claude" | "github",
    localFailure?: string,
    improve?: { id?: string; feedback?: string },
  ): Promise<SentJob> {
    const token = this.secret(processor === "claude" ? CLAUDE_TOKEN_ID : GITHUB_TOKEN_ID);
    const r = await startJob(
      {
        processor,
        routine: this.settings.routine,
        repo: this.settings.repo,
        token: token ?? "",
        device: deviceId(this.app),
      },
      e,
      input,
      improve,
    );
    if (!r.ok) return r;
    await this.save({ jobs: [...this.settings.jobs, r.job] });
    // A job after a failed local reading: the reason comes along (src/socialFlow.ts, fallbackAfter).
    const message = localFailure ? `${r.message} ${tr("fallbackNote", { why: localFailure })}` : r.message;
    return { ok: true, message, job: r.job.id };
  }

  /** Remember the cover address of a new note, so "Fetch again" loads a new image only when it changed (#63). */
  async rememberCover(path: string, url?: string) {
    if (url) await this.save({ coverUrls: { ...this.settings.coverUrls, [path]: url } });
  }

  /** Start a job again with the same input; the old one disappears only once the new one was accepted. */
  async retry(id: string): Promise<{ ok: boolean; message?: string }> {
    const old = this.settings.jobs.find((a) => a.id === id);
    if (!old) return { ok: false, message: tr("jobGone") };
    // One new run per job at a time: a second tap while the first request is on its way does nothing.
    if (this.retrying.has(id)) return { ok: true };
    this.retrying.add(id);
    try {
      // A job goes to the same processor again; the way of the plugin is not tried a second time.
      const r = await this.retryJob(old.input, old.processor, retryImprove(old));
      if (r.ok && r.job) {
        await this.save({ jobs: replaceJob(this.settings.jobs, old, r.job) });
        // A new run has a new ID: the note's `auftrag` follows (only if it still has the old one), late proposals of the old run are dropped.
        if (old.improve) await this.improve.rebind(old.id, r.job);
      }
      return r;
    } finally {
      this.retrying.delete(id);
    }
  }

  private async retryJob(
    input: string,
    processor: "claude" | "github",
    improve?: { feedback?: string },
  ): Promise<SentJob> {
    if (!this.processorInfo().ready[processor])
      return { ok: false, message: tr("chosenNotReady", { chosen: processorName(processor) }) };
    return this.sendJob(detectSource(input), input, processor, undefined, improve);
  }

  reconcileJobs(recipes: Recipe[]) {
    return reconcileJobs(this, recipes);
  }

  /** Keep the screen on in cooking mode (Screen Wake Lock, also held while a timer runs); false if the device cannot do it. */
  keepAwake(an: boolean): Promise<boolean> {
    return this.timers.wake.hold("cooking", an);
  }
}
