// The Better Cooking view in Obsidian: reads the recipe folder, renders the Preact UI and
// writes status, rating and attempts into existing recipe notes (docs/architecture.md).
import { ItemView, Notice, TFile, debounce, type WorkspaceLeaf, Platform } from "obsidian";
import { h, render } from "preact";
import type BetterCookingPlugin from "./main";
import { inFolder, isRecipeFile } from "./folder";
import { todayIso, parseRecipe, insertAttempt } from "./parse";
import type { ColorMode, Recipe, RecipeView, Status, Theme } from "./types";
import { App } from "./ui/App";
import type { AttemptInput } from "./ui/attempt";
import { language, tr } from "./i18n";
import { itemsFromRecipe } from "./shopping";
import { keyFor, statusValueFor, type FieldId } from "./noteFormat";

export const VIEW_TYPE = "rezepte-view";
export const ICON = "rezepte-kochmuetze";
// Chef's hat from Lucide (ISC), on a 100 grid for addIcon.
export const ICON_SVG = `<g transform="scale(4.1666667)" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
<path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z"/>
<path d="M6 17h12"/></g>`;

export class BetterCookingView extends ItemView {
  private recipes: RecipeView[] = [];
  private cache = new Map<string, { mtime: number; r: RecipeView }>();
  private start: { importRecipe?: boolean } | undefined;

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
    this.applyTheme();
    const fresh = debounce(() => void this.reload(), 250, true);
    const affects = (path: string) => inFolder(path, this.plugin.settings.folder);
    this.registerEvent(this.app.vault.on("modify", (f) => affects(f.path) && fresh()));
    this.registerEvent(this.app.vault.on("create", (f) => affects(f.path) && fresh()));
    this.registerEvent(this.app.vault.on("delete", (f) => affects(f.path) && fresh()));
    this.registerEvent(this.app.vault.on("rename", (f, old) => (affects(f.path) || affects(old)) && fresh()));
    this.registerEvent(this.app.metadataCache.on("resolved", () => fresh()));
    this.registerEvent(this.app.workspace.on("css-change", () => this.render()));
    this.measureBottom();
    this.registerEvent(this.app.workspace.on("resize", () => this.measureBottom()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.measureBottom()));
    this.registerInterval(window.setInterval(() => this.measureBottom(), 2000));
    // Report job timeouts even when nothing changes in the recipe folder.
    this.registerInterval(window.setInterval(() => void this.plugin.reconcileJobs(this.recipes), 60_000));
    await this.reload();
  }

  /** Obsidian mobile lays a floating bar over the bottom edge of the view (iPhone, 24.11.2026).
   *  It measures how far the bar covers the view; the CSS variable --rz-unten keeps buttons and lists clear of it. */
  private measureBottom() {
    const bar = activeDocument.querySelector<HTMLElement>(".mobile-navbar");
    const view = this.contentEl.getBoundingClientRect();
    let bottom = 0;
    if (bar && bar.offsetParent !== null) {
      const l = bar.getBoundingClientRect();
      if (l.height > 0 && l.top < view.bottom && l.bottom > view.top) bottom = Math.max(0, view.bottom - l.top) + 8;
    }
    const value = bottom > 0 ? `${Math.round(bottom)}px` : "";
    if (this.contentEl.style.getPropertyValue("--rz-unten") !== value) {
      if (value) this.contentEl.style.setProperty("--rz-unten", value);
      else this.contentEl.style.removeProperty("--rz-unten");
    }
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
    this.recipes = fresh;
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
    render(
      h(App, {
        recipes: this.recipes,
        theme,
        mode: p.settings.mode,
        palette: p.settings.palette,
        canPrint: Platform.isDesktopApp,
        jobs: p.settings.jobs,
        processor: p.processor(),
        list: p.settings.list,
        folder: p.settings.folder,
        start: this.start,
        onList: (list: string) => void p.save({ list }),
        onMode: (mode: ColorMode) => void p.save({ mode }),
        onOpenNote: (path: string) => void this.openNote(path),
        onStatus: (path: string, s: Status) =>
          void this.fm(path, (fm, set) => {
            set("status", statusValueFor(fm[keyFor(fm, p.noteFormat().fields, "status")], p.noteFormat(), s));
          }),
        onRating: (path: string, n: number | null) => void this.fm(path, (_fm, set) => set("rating", n)),
        onMade: (path: string) => void this.fm(path, (_fm, set) => set("lastMade", todayIso()), tr("madeTodaySaved")),
        onAttempt: (path: string, v: AttemptInput) => this.attempt(path, v),
        onShop: (path: string, factor: number, skip: string[]) => {
          const r = this.recipes.find((x) => x.path === path);
          if (r) void p.lists.addToShoppingList(itemsFromRecipe(r.title, r.ingredients, factor, skip));
        },
        canTranslate: p.aiAvailable(),
        onTranslate: async (path: string, language: string) => {
          const r = this.recipes.find((x) => x.path === path);
          return r ? p.translateRecipe(r, language) : { ok: false };
        },
        onPlan: (path: string, date: string, factor: number) => {
          const r = this.recipes.find((x) => x.path === path);
          if (!r) return;
          const servings = r.servings && { ...r.servings, count: Math.round(r.servings.count * factor * 100) / 100 };
          void p.lists.addToMealPlan(path, r.title, date, servings);
        },
        onImport: (input: string) => p.importRecipe(input),
        onJobGone: (id: string) => void p.save({ jobs: p.settings.jobs.filter((a) => a.id !== id) }),
        onRetry: (id: string) => p.retry(id),
        onHint: (text: string) => new Notice(text, 10_000),
        onKeepAwake: (an: boolean) => p.keepAwake(an),
      }),
      this.contentEl,
    );
  }

  private file(path: string): TFile | null {
    const d = this.app.vault.getAbstractFileByPath(path);
    return d instanceof TFile ? d : null;
  }

  /**
   * Change the frontmatter (Obsidian API, so order and formatting stay) and set the updated date.
   * `set` writes a field under the name the note already uses, otherwise under the configured one.
   */
  private async fm(
    path: string,
    f: (fm: Record<string, unknown>, set: (id: FieldId, v: unknown) => void) => void,
    hint?: string,
  ) {
    const d = this.file(path);
    if (!d) return;
    const fields = this.plugin.noteFormat().fields;
    try {
      await this.app.fileManager.processFrontMatter(d, (fm: Record<string, unknown>) => {
        const set = (id: FieldId, v: unknown) => {
          fm[keyFor(fm, fields, id)] = v;
        };
        f(fm, set);
        set("updated", todayIso());
      });
      if (hint) new Notice(hint);
    } catch (e) {
      new Notice(tr("changeFailed", { file: d.basename, error: e instanceof Error ? e.message : String(e) }));
    }
  }

  private async attempt(path: string, v: AttemptInput): Promise<boolean> {
    const d = this.file(path);
    if (!d) return false;
    try {
      await this.app.vault.process(d, (text) =>
        insertAttempt(
          text,
          {
            date: v.date.trim(),
            modified: v.modified,
            result: v.result,
            rating: v.rating,
          },
          this.plugin.noteFormat().lang,
        ),
      );
      const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v.date.trim());
      const iso = m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : todayIso();
      await this.fm(path, (_fm, set) => {
        if (v.made) set("lastMade", iso);
        if (v.asRating && v.rating) set("rating", v.rating);
      });
      new Notice(tr("attemptSaved"));
      return true;
    } catch (e) {
      new Notice(tr("attemptFailed", { error: e instanceof Error ? e.message : String(e) }));
      return false;
    }
  }

  private async openNote(path: string) {
    const d = this.file(path);
    if (d) await this.app.workspace.getLeaf("tab").openFile(d);
  }
}
