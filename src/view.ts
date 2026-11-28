// The Better Cooking view in Obsidian: reads the recipe folder, renders the Preact UI and
// writes status, rating and attempts into existing recipe notes (docs/architecture.md).
import { ItemView, Notice, Scope, TFile, debounce, type WorkspaceLeaf, Platform } from "obsidian";
import { h, render } from "preact";
import type BetterCookingPlugin from "./main";
import { folderMissing, inFolder, isRecipeFile } from "./folder";
import { parseRecipe } from "./parse";
import { refetchApi } from "./refetchApi";
import { feedbackApi } from "./feedbackService";
import { removeFailedJob, removeFailureNote } from "./failureService";
import { isFailureNote, orphanFailures, withKnownNotes } from "./importFailure";
import { visibleJobs } from "./processor";
import { withoutFirstVersions } from "./improve";
import { deviceId } from "./importSyncService";
import { keyOf } from "./source";
import type { ColorMode, Recipe, RecipeView, Status, Theme } from "./types";
import { App } from "./ui/App";
import { localStore } from "./localStore";
import type { GoTo, Page } from "./ui/pages";
import type { ShoppingEdit } from "./shoppingEdit";
import type { PlanEdit } from "./planEdit";
import { NoteSync } from "./noteSync";
import { escapeHandling, keyForView } from "./ui/keyboard";
import type { EscapeHandler } from "./ui/useKeyboard";
import type { AttemptInput } from "./ui/attempt";
import { language, tr } from "./i18n";
import { contributionsMemo } from "./listRecords";
import { applyInsets, resetSafe } from "./insets";
import { NoteActions } from "./noteActions";
import { noticeWithAction } from "./notice";
import { BUBBLE_KEY } from "./timerBubble";
import { RESUME_KEY, createResume } from "./cookingResume";
import { keyFor, statusValueFor } from "./noteFormat";

export const VIEW_TYPE = "rezepte-view";
export const ICON = "rezepte-kochmuetze";
// Chef's hat from Lucide (ISC, see THIRD_PARTY_NOTICES.md), on a 100 grid for addIcon.
export const ICON_SVG = `<g transform="scale(4.1666667)" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
<path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z"/>
<path d="M6 17h12"/></g>`;

export class BetterCookingView extends ItemView {
  private recipes: RecipeView[] = [];
  /** Every note of the recipe folder, failure notes included (what `reconcileJobs` looks at). */
  private all: RecipeView[] = [];
  /** Failure notes: no recipes (src/importFailure.ts). */
  private failures: RecipeView[] = [];
  private cache = new Map<string, { mtime: number; r: RecipeView }>();
  private start: { importRecipe?: boolean } | undefined;
  private frame = 0;
  /** Text of the shopping list note, for the shopping list page. */
  private shopping = "";
  /** What the recipes bring to the list (src/listRecipes.ts), worked out again only when the records or recipes change. */
  private known = contributionsMemo();
  private notes = new NoteActions(this.plugin);
  /** Text of the meal plan note, for the meal plan page. */
  private plan = "";
  private goto: GoTo | undefined;
  private renamed: { id: number; from: string; to: string } | undefined;
  /** Which read or write of the list note may still set the state (src/noteSync.ts). */
  private shoppingSync = new NoteSync();
  private planSync = new NoteSync();
  /** Esc of the App (set by the App while it is mounted). */
  private handleEscape: EscapeHandler | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: BetterCookingPlugin,
  ) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return tr("appName");
  }
  getIcon() {
    return ICON;
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("rz-root");
    this.contentEl.setAttribute("lang", language());
    // Obsidian's keymap would switch the tab on Esc before a window listener sees it. This scope is active
    // while the view's tab is, so Esc is handled here: inside the view without modifiers it always returns
    // false (handled), so Esc never changes the tab. Everything else goes on to Obsidian.
    this.scope = new Scope(this.app.scope);
    this.scope.register(null, "Escape", (e) => {
      const target = e.target as HTMLElement | null;
      const inView = keyForView(target, this.contentEl);
      const own = escapeHandling({ inView, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey });
      if (own === "pass") return;
      this.handleEscape?.(target);
      return false;
    });
    this.applyTheme();
    const fresh = debounce(() => void this.reload(), 250, true);
    const affects = (path: string) => inFolder(path, this.plugin.settings.folder);
    this.registerEvent(this.app.vault.on("modify", (f) => affects(f.path) && fresh()));
    this.registerEvent(this.app.vault.on("create", (f) => affects(f.path) && fresh()));
    this.registerEvent(this.app.vault.on("delete", (f) => affects(f.path) && fresh()));
    this.registerEvent(this.app.vault.on("rename", (f, old) => (affects(f.path) || affects(old)) && fresh()));
    this.registerEvent(
      this.app.vault.on("rename", (f, old) => {
        this.renamed = { id: (this.renamed?.id ?? 0) + 1, from: old, to: f.path };
        this.render();
      }),
    );
    this.registerEvent(this.app.metadataCache.on("resolved", () => fresh()));
    this.registerEvent(this.app.workspace.on("css-change", () => this.render()));
    // The shopping list note lives outside the recipe folder; the page follows it (also when sync changes it).
    const shoppingFresh = debounce(() => void this.refreshLists(), 150, true);
    const isList = (path: string) => this.plugin.lists.isListNote(path);
    this.registerEvent(this.app.vault.on("modify", (f) => isList(f.path) && shoppingFresh()));
    this.registerEvent(this.app.vault.on("create", (f) => isList(f.path) && shoppingFresh()));
    this.registerEvent(this.app.vault.on("delete", (f) => isList(f.path) && shoppingFresh()));
    this.registerEvent(this.app.vault.on("rename", (f, old) => (isList(f.path) || isList(old)) && shoppingFresh()));
    applyInsets(this.contentEl);
    const win = this.contentEl.ownerDocument.defaultView ?? window;
    const onResize = () => {
      resetSafe(this.contentEl);
      this.measureBottom();
    };
    this.registerEvent(this.app.workspace.on("resize", onResize));
    this.registerEvent(this.app.workspace.on("layout-change", onResize));
    win.addEventListener("orientationchange", onResize);
    // Safety net for bars that appear without an event; nothing to measure while the view is hidden.
    this.registerInterval(
      window.setInterval(() => {
        if (this.contentEl.isShown()) this.measureBottom();
      }, 2000),
    );
    // The on-screen keyboard changes the visual viewport, not the layout.
    const vv = win.visualViewport;
    const onVisual = () => this.measureBottom();
    vv?.addEventListener("resize", onVisual);
    vv?.addEventListener("scroll", onVisual);
    this.register(() => {
      win.removeEventListener("orientationchange", onResize);
      vv?.removeEventListener("resize", onVisual);
      vv?.removeEventListener("scroll", onVisual);
      if (this.frame) win.cancelAnimationFrame(this.frame);
    });
    // Report job timeouts even when nothing changes in the recipe folder.
    this.registerInterval(window.setInterval(() => void this.plugin.reconcileJobs(this.all), 60_000));
    await this.reload();
  }

  /** Bars of Obsidian lie over the bottom edge of the view: the floating bar of Obsidian mobile (iPhone, 24.11.2026)
   *  and the status bar on desktop (fixed, bottom right, covered the "Next" button of the cooking mode); on top of that
   *  the home indicator and the on-screen keyboard. src/insets.ts measures them and sets --rz-unten,
   *  --rz-tastatur and the side safe areas (--rz-links/-rechts), which keep buttons, lists and sheets clear of them. */
  private measureBottom() {
    if (this.frame) return; // events come in bunches (visual viewport while the keyboard slides in)
    const win = this.contentEl.ownerDocument.defaultView ?? window;
    this.frame = win.requestAnimationFrame(() => {
      this.frame = 0;
      applyInsets(this.contentEl);
    });
  }

  async onClose() {
    render(null, this.contentEl);
    void this.plugin.keepAwake(false);
  }

  openImport() {
    this.start = { importRecipe: true };
    render(null, this.contentEl);
    this.render();
    this.start = undefined;
  }

  /** Shows a page of the view (from a notice button or a command). */
  goTo(page: Page, recipe?: string) {
    this.goto = { page, id: (this.goto?.id ?? 0) + 1, recipe };
    this.render();
  }

  /** Reads the shopping list and meal plan notes again and shows them. */
  async refreshLists() {
    const shoppingCurrent = this.shoppingSync.startRead();
    const planCurrent = this.planSync.startRead();
    const [shopping, plan] = await Promise.all([
      this.plugin.lists.readShoppingText(),
      this.plugin.lists.readPlanText(),
    ]);
    if (shoppingCurrent()) this.shopping = shopping;
    if (planCurrent()) this.plan = plan;
    this.render();
  }

  /** True when the note changed. */
  private async editPlan(edit: PlanEdit): Promise<boolean> {
    const latest = this.planSync.startEdit();
    const done = await this.plugin.lists.editMealPlan(edit);
    const mine = latest();
    // A failed write or one that another write overtook: read the notes once more.
    if (!done || !mine) void this.refreshLists();
    if (!done) return false;
    if (mine) {
      this.plan = done.text;
      this.render();
    }
    return done.changed;
  }

  /** True when the note changed. */
  private async editShopping(edit: ShoppingEdit): Promise<boolean> {
    const latest = this.shoppingSync.startEdit();
    const done = await this.plugin.lists.editShoppingList(edit);
    const mine = latest();
    // A failed write or one that another write overtook: read the note once more, so the page shows what is there.
    if (!done || !mine) void this.refreshLists();
    if (!done) return false;
    if (mine) {
      this.shopping = done.text;
      this.render();
    }
    return done.changed;
  }

  async reload() {
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((f) => !this.plugin.lists.isListNote(f.path) && isRecipeFile(f.path, this.plugin.settings.folder));
    const fresh: RecipeView[] = [];
    for (const f of files) {
      const c = this.cache.get(f.path);
      if (c && c.mtime === f.stat.mtime) {
        fresh.push(c.r);
        continue;
      }
      try {
        const r = parseRecipe(
          f.path,
          await this.app.vault.cachedRead(f),
          f.stat.mtime,
          this.plugin.noteFormat().fields,
        );
        const view = await this.resolve(r, f);
        this.cache.set(f.path, { mtime: f.stat.mtime, r: view });
        fresh.push(view);
      } catch (e) {
        console.error("Better Cooking: could not read", f.path, e);
      }
    }
    for (const k of [...this.cache.keys()]) if (!files.some((f) => f.path === k)) this.cache.delete(k);
    // A failure note is no recipe: not in the grid, the search, the categories or the counts (src/importFailure.ts).
    this.all = fresh;
    this.recipes = fresh.filter((r) => !isFailureNote(r));
    this.failures = fresh.filter(isFailureNote);
    await this.refreshLists();
    await this.plugin.reconcileJobs(fresh);
    this.render();
  }

  /** Resolve images and timeline graphic to resource paths or SVG text. */
  private async resolve(r: Recipe, f: TFile): Promise<RecipeView> {
    const file = (target?: string) => (target ? this.app.metadataCache.getFirstLinkpathDest(target, f.path) : null);
    const src = (target?: string) => {
      const d = file(target);
      return d ? this.app.vault.getResourcePath(d) : undefined;
    };
    let timelineSvg: string | undefined;
    const svg = file(r.timeline);
    if (svg && svg.stat.size < 400_000) {
      try {
        timelineSvg = await this.app.vault.cachedRead(svg);
      } catch {
        /* ohne Grafik */
      }
    }
    return {
      ...r,
      imageSrc: src(r.image),
      imageSrcs: r.images.map((b) => src(b)).filter((x): x is string => !!x),
      timelineSvg,
    };
  }

  private theme(): Theme {
    const m = this.plugin.settings.palette === "obsidian" ? "system" : this.plugin.settings.mode;
    if (m === "hell") return "hell";
    if (m === "dunkel") return "dunkel";
    return activeDocument.body.classList.contains("theme-dark") ? "dunkel" : "hell";
  }

  /** Sets theme and palette attributes; also before the first load so nothing flashes in the wrong colors. */
  private applyTheme(): Theme {
    const theme = this.theme();
    this.contentEl.setAttribute("data-rz-theme", theme);
    this.contentEl.setAttribute("data-rz-palette", this.plugin.settings.palette);
    return theme;
  }

  render() {
    const theme = this.applyTheme();
    const p = this.plugin;
    const info = p.processorInfo();
    render(
      h(App, {
        recipes: p.improve.mark(this.recipes),
        theme,
        mode: p.settings.mode,
        palette: p.settings.palette,
        canPrint: Platform.isDesktopApp,
        jobs: withKnownNotes(
          withoutFirstVersions(
            visibleJobs(p.settings.jobs, this.all, keyOf, deviceId(this.app), Date.now(), p.improve.proposals()),
            this.all,
            Date.now(),
          ),
          this.failures,
        ),
        failures: orphanFailures(this.failures, p.settings.jobs, this.recipes),
        processor: info.active,
        status: info.status,
        route: info.route,
        list: p.settings.list,
        folder: p.settings.folder,
        folderMissing: folderMissing(p.settings.folder, !!this.app.vault.getFolderByPath(p.settings.folder)),
        start: this.start,
        goto: this.goto,
        renamed: this.renamed,
        shopping: this.shopping,
        listRecipes: () => this.known(p.settings.listRecipes[p.lists.shoppingListPath()], this.recipes),
        onShoppingEdit: (edit: ShoppingEdit) => this.editShopping(edit),
        onOpenShoppingNote: () => void p.lists.openShoppingList(),
        conflict: { shopping: p.lists.choice("shoppingList").conflict, plan: p.lists.choice("mealPlan").conflict },
        onChooseList: (kind: "shopping" | "plan", path: string) =>
          void p.save(kind === "shopping" ? { shoppingList: path } : { mealPlan: path }),
        onOpenPlanNote: () => void p.lists.openMealPlan(),
        plan: this.plan,
        onPlanEdit: (edit: PlanEdit) => this.editPlan(edit),
        onPlanShopping: (start: string) => void p.lists.planToShoppingList(start),
        onPlanExport: () => void p.lists.exportMealPlan(),
        onList: (list: string) => void p.save({ list }),
        onMode: (mode: ColorMode) => void p.save({ mode }),
        onOpenNote: (path: string) => void this.notes.openNote(path),
        onStatus: (path: string, s: Status) =>
          void this.notes.fm(path, (fm, set) => {
            set("status", statusValueFor(fm[keyFor(fm, p.noteFormat().fields, "status")], p.noteFormat(), s));
          }),
        onRating: (path: string, n: number | null) => void this.notes.fm(path, (_fm, set) => set("rating", n)),
        onMade: (path: string) => void this.notes.madeToday(path),
        onUndoMade: (path: string) => void this.notes.undoMadeToday(path),
        onAttempt: (path: string, v: AttemptInput) => this.notes.attempt(path, v),
        onShop: (path: string, factor: number, skip: string[]) => {
          const r = this.recipes.find((x) => x.path === path);
          if (r) void p.lists.addToShoppingList([{ recipe: r, factor, skipped: skip }], this.recipes);
        },
        canTranslate: p.aiAvailable(),
        onTranslate: async (path: string, language: string) => {
          const r = this.recipes.find((x) => x.path === path);
          return r ? p.translateRecipe(r, language) : { ok: false };
        },
        onPlan: (path: string, date: string, factor: number, onPage?: boolean) => {
          const r = this.recipes.find((x) => x.path === path);
          if (!r) return;
          const servings = r.servings && { ...r.servings, count: Math.round(r.servings.count * factor * 100) / 100 };
          void p.lists.addToMealPlan(path, r.title, date, servings, onPage);
        },
        refetch: refetchApi(p.refetcher, (m) => new Notice(m)),
        feedback: feedbackApi(p, p.refetcher, (m) => new Notice(m)),
        improve: p.improve.host((m) => new Notice(m)),
        deleteRecipe: p.deleter.api(),
        edit: p.editor.api(),
        onImport: (input: string) => p.importRecipe(input, this.recipes),
        jobActions: {
          onJobGone: (id: string) => void p.save({ jobs: p.settings.jobs.filter((a) => a.id !== id) }),
          onRemoveFailed: (id: string) => removeFailedJob(p, id),
          onRemoveFailure: (path: string, job: string) => removeFailureNote(p, path, job),
          onRetry: (id: string) => p.retry(id),
          onSyncNow: p.importSync.command() ? (phase) => p.importSync.now(phase) : undefined,
        },
        onHint: (text: string, action?: { label: string; run: () => void }) =>
          void noticeWithAction(text, action, 10_000),
        onKeepAwake: (an: boolean) => p.keepAwake(an),
        timers: p.timers.store,
        timerBubble: localStore(p.app, BUBBLE_KEY),
        resume: createResume({ now: () => Date.now(), ...localStore(p.app, RESUME_KEY) }),
        tapHintSeen: p.settings.cookingTapHintSeen,
        touch: Platform.isMobileApp || undefined,
        onTapHintSeen: () => void p.save({ cookingTapHintSeen: true }),
        registerEscape: (handle: EscapeHandler | null) => {
          this.handleEscape = handle;
        },
      }),
      this.contentEl,
    );
  }
}
