// The plugin's own notes besides recipes: the shopping list (issue #7) and the weekly meal plan (issue #11).
// Both are plain Markdown notes at the top of the vault unless the settings name another path; the plugin
// creates them when needed and otherwise only changes the lines src/shopping.ts and src/mealPlan.ts describe.
import { Notice, TFile, normalizePath } from "obsidian";
import type BetterCookingPlugin from "./main";
import { NOTE_WORDS } from "./noteFormat";
import type { Settings } from "./settings";
import {
  countListEntries,
  defaultMatches,
  pinConflict,
  resolveListNote,
  withExtension,
  type ListFile,
  type ListKind,
  type ListNoteChoice,
} from "./listNoteResolve";
import { addToList, itemsFromRecipe, readStores, type Item } from "./shopping";
import { applyShoppingEdit, type ShoppingEdit } from "./shoppingEdit";
import { addDays, addToPlan, entryLine, planIcs, plannedFrom, readPlan, shortDate } from "./mealPlan";
import { applyPlanEdit, type PlanEdit } from "./planEdit";
import { parseRecipe, todayIso } from "./parse";
import { tr } from "./i18n";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class ListNotes {
  constructor(private plugin: BetterCookingPlugin) {}

  private get app() {
    return this.plugin.app;
  }

  private words() {
    return NOTE_WORDS[this.plugin.settings.noteFormat];
  }

  /** Entries counted for a candidate, with the change time they were counted at (a changed note is counted again). */
  private counted = new Map<string, { mtime: number; entries: number }>();
  /** The provisional choice while two notes have entries (kept for the session, `pinConflict`). */
  private pinned: Partial<Record<ListKind, string>> = {};
  /** The file each list note used last, to follow a rename of an automatically chosen file. */
  private lastUsed: Partial<Record<ListKind, string>> = {};

  /** The notes with a default name of either language at the top of the vault; entries only as far as counted. */
  private foundDefaults(kind: ListKind): ListFile[] {
    const files = this.app.vault
      .getRoot()
      .children.filter((f): f is TFile => f instanceof TFile && f.extension.toLowerCase() === "md");
    return defaultMatches(
      files.map((f) => f.path),
      kind,
    ).map((path) => {
      const mtime = this.app.vault.getFileByPath(path)!.stat.mtime;
      const c = this.counted.get(path);
      return { path, mtime, ...(c?.mtime === mtime ? { entries: c.entries } : {}) };
    });
  }

  /**
   * Counts the entries of the (at most two) notes that compete for a list, by reading them; only when there is a
   * competition and the user set no path. Cheap otherwise, and a note is counted again only after it changed.
   */
  async settle(): Promise<void> {
    for (const kind of ["shoppingList", "mealPlan"] as const) {
      if (this.plugin.settings[kind].trim()) continue;
      for (const f of this.foundDefaults(kind).length > 1 ? this.foundDefaults(kind) : []) {
        if (f.entries !== undefined) continue;
        const file = this.app.vault.getFileByPath(f.path);
        if (!file) continue;
        try {
          const entries = countListEntries(kind, await this.app.vault.cachedRead(file));
          this.counted.set(f.path, { mtime: file.stat.mtime, entries });
        } catch {
          // Not readable now: stays uncounted (not 0), the one of the note language is used.
        }
      }
    }
  }

  /** Which file a list note uses now and whether two notes compete for it (see `resolveListNote`, `pinConflict`). */
  choice(kind: ListKind): ListNoteChoice {
    const own = this.plugin.settings[kind].trim();
    const found = own ? [] : this.foundDefaults(kind);
    const { choice, pin } = pinConflict(
      resolveListNote(own, kind, this.plugin.settings.noteFormat, found),
      this.pinned[kind],
    );
    this.pinned[kind] = pin;
    const path = normalizePath(choice.path);
    if (!own) this.lastUsed[kind] = path;
    return { ...choice, path };
  }

  /** Shopping list note: the setting, otherwise the existing default note, otherwise the default of the note language. */
  shoppingListPath(): string {
    return this.choice("shoppingList").path;
  }

  /** Meal plan note: the setting, otherwise the existing default note, otherwise the default of the note language. */
  mealPlanPath(): string {
    return this.choice("mealPlan").path;
  }

  /** The file at a path; at the top of the vault whatever the case of the name (a note "wochenplan.md" is the one the setting names). */
  private fileAt(path: string): TFile | null {
    const exact = this.app.vault.getFileByPath(path);
    if (exact || path.includes("/")) return exact;
    const lower = path.toLowerCase();
    return (
      this.app.vault.getRoot().children.find((f): f is TFile => f instanceof TFile && f.path.toLowerCase() === lower) ??
      null
    );
  }

  /** A note chosen automatically that the user renames: the new path is stored (the user's choice from now on). */
  follow(old: string, now: string) {
    const fresh: Partial<Settings> = {};
    for (const kind of ["shoppingList", "mealPlan"] as const) {
      const own = this.plugin.settings[kind].trim();
      if (own && normalizePath(withExtension(own)).toLowerCase() === old.toLowerCase()) fresh[kind] = now;
      else if (!own && this.lastUsed[kind]?.toLowerCase() === old.toLowerCase()) fresh[kind] = now;
    }
    if (Object.keys(fresh).length) void this.plugin.save(fresh);
  }

  /** Not recipes, even inside the recipe folder. */
  isListNote(path: string): boolean {
    const lower = path.toLowerCase();
    return (["shoppingList", "mealPlan"] as const).some((kind) => {
      const own = this.plugin.settings[kind].trim();
      if (own) return lower === normalizePath(withExtension(own)).toLowerCase();
      return defaultMatches([path], kind).length > 0 && !path.includes("/");
    });
  }

  /** Changes a note with `change`, creating it (and its folder) from an empty text if missing; returns the new text. */
  private async change(path: string, change: (text: string) => string): Promise<string> {
    const file = this.fileAt(path);
    if (file) return this.app.vault.process(file, change);
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    if (parent && !this.app.vault.getFolderByPath(parent)) await this.app.vault.createFolder(parent);
    const text = change("");
    await this.app.vault.create(path, text);
    return text;
  }

  private async open(path: string, create: () => Promise<void>) {
    if (!this.fileAt(path)) await create();
    const file = this.fileAt(path);
    if (file) await this.app.workspace.getLeaf("tab").openFile(file);
  }

  /** Adds items to the shopping list; reports how many in a notice. */
  async addToShoppingList(items: Item[]) {
    await this.settle();
    const path = this.shoppingListPath();
    try {
      const stores = readStores(this.plugin.settings.stores);
      await this.change(path, (text) => addToList(text, items, this.words().shoppingList, stores));
      this.shoppingNotice(items.length);
    } catch (e) {
      new Notice(tr("shoppingFailed", { error: errorText(e) }));
    }
  }

  /** "n ingredients on the shopping list" with a button to the page of the view, not to the note. */
  private shoppingNotice(n: number) {
    const notice = new Notice("", 8000);
    notice.messageEl.createSpan({ text: `${tr("shoppingAdded", { n })} ` });
    const go = notice.messageEl.createEl("button", { text: tr("shoppingGoTo") });
    go.addEventListener("click", () => {
      notice.hide();
      void this.plugin.open({ page: "shopping" });
    });
  }

  /** Text of the shopping list note for the page; empty without a note. */
  async readShoppingText(): Promise<string> {
    await this.settle();
    const file = this.fileAt(this.shoppingListPath());
    return file ? this.app.vault.cachedRead(file) : "";
  }

  /** One change of the shopping list page; the new text of the note and whether it changed (undefined if it failed). */
  async editShoppingList(edit: ShoppingEdit): Promise<{ text: string; changed: boolean } | undefined> {
    await this.settle();
    const path = this.shoppingListPath();
    // Only adding creates the note; every other change needs the note to exist.
    if (edit.kind !== "add" && !this.fileAt(path)) return { text: "", changed: false };
    try {
      const stores = readStores(this.plugin.settings.stores);
      let changed = false;
      const text = await this.change(path, (before) => {
        const after = applyShoppingEdit(before, edit, this.words().shoppingList, stores);
        changed = after !== before;
        return after;
      });
      return { text, changed };
    } catch (e) {
      new Notice(tr("shoppingFailed", { error: errorText(e) }));
      return undefined;
    }
  }

  /** Removes done items from the shopping list, e.g. after shopping (the same edit as on the page). */
  async clearShoppingList() {
    const done = await this.editShoppingList({ kind: "clearDone" });
    if (done?.changed) new Notice(tr("shoppingCleared"));
  }

  async openShoppingList() {
    await this.settle();
    // Only creates the note (with its title), without the "n ingredients" notice of adding.
    return this.open(this.shoppingListPath(), async () => {
      const stores = readStores(this.plugin.settings.stores);
      await this.change(this.shoppingListPath(), (text) => addToList(text, [], this.words().shoppingList, stores));
    });
  }

  /** Plans a recipe note on a day, with the servings shown if the recipe has a number of servings. */
  async addToMealPlan(
    recipePath: string,
    title: string,
    date: string,
    servings?: { count: number; unit: string },
    /** From the meal plan page, which shows the entry itself: the notice leaves out the file. */
    onPage = false,
  ) {
    await this.settle();
    const path = this.mealPlanPath();
    const target = recipePath.replace(/^.*\//, "").replace(/\.md$/i, "");
    const line = entryLine(target, servings?.count, servings?.unit || undefined);
    try {
      await this.change(path, (text) => addToPlan(text, date, line, this.words().mealPlan));
      new Notice(onPage ? tr("planAddedShort", { title }) : tr("planAdded", { title, file: path }));
    } catch (e) {
      new Notice(tr("planFailed", { error: errorText(e) }));
    }
  }

  /** Text of the meal plan note for the page; empty without a note. */
  async readPlanText(): Promise<string> {
    await this.settle();
    const file = this.fileAt(this.mealPlanPath());
    return file ? this.app.vault.cachedRead(file) : "";
  }

  /** One change of the meal plan page; the new text of the note and whether it changed (undefined if it failed). */
  async editMealPlan(edit: PlanEdit): Promise<{ text: string; changed: boolean } | undefined> {
    await this.settle();
    const path = this.mealPlanPath();
    if (!this.fileAt(path)) return { text: "", changed: false };
    try {
      let changed = false;
      const text = await this.change(path, (before) => {
        const after = applyPlanEdit(before, edit, this.words().mealPlan);
        changed = after !== before;
        return after;
      });
      return { text, changed };
    } catch (e) {
      new Notice(tr("planFailed", { error: errorText(e) }));
      return undefined;
    }
  }

  async openMealPlan() {
    await this.settle();
    return this.open(this.mealPlanPath(), async () => {
      await this.change(this.mealPlanPath(), () => `# ${this.words().mealPlan}\n`);
    });
  }

  /** Puts the ingredients of the recipes planned for `start` and the next six days on the shopping list. */
  async planToShoppingList(start = todayIso()) {
    await this.settle();
    const file = this.fileAt(this.mealPlanPath());
    const entries = file ? plannedFrom(readPlan(await this.app.vault.cachedRead(file)), start) : [];
    const items: Item[] = [];
    let recipes = 0;
    for (const e of entries) {
      const dest: TFile | null = this.app.metadataCache.getFirstLinkpathDest(e.target, this.mealPlanPath());
      if (!dest || dest.extension !== "md") continue;
      const r = parseRecipe(dest.path, await this.app.vault.cachedRead(dest), 0, this.plugin.noteFormat().fields);
      const factor = e.servings && r.servings?.count ? e.servings / r.servings.count : 1;
      items.push(...itemsFromRecipe(r.title, r.ingredients, factor));
      recipes++;
    }
    if (!recipes) {
      new Notice(tr("planEmptyRange", { from: shortDate(start), to: shortDate(addDays(start, 6)) }));
      return;
    }
    await this.addToShoppingList(items);
  }

  /** Writes the plan as a calendar file next to the plan note (for an optional calendar import). */
  async exportMealPlan() {
    await this.settle();
    const file = this.fileAt(this.mealPlanPath());
    if (!file) {
      new Notice(tr("planEmpty"));
      return;
    }
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d+Z$/, "Z");
    const ics = planIcs(readPlan(await this.app.vault.cachedRead(file)), stamp);
    const path = file.path.replace(/\.md$/i, ".ics");
    try {
      const existing = this.fileAt(path);
      if (existing) await this.app.vault.modify(existing, ics);
      else await this.app.vault.create(path, ics);
      new Notice(tr("planExported", { file: path }));
    } catch (e) {
      new Notice(tr("planFailed", { error: errorText(e) }));
    }
  }
}
