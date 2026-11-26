// The plugin's own notes besides recipes: the shopping list (issue #7) and the weekly meal plan (issue #11).
// Both are plain Markdown notes at the top of the vault unless the settings name another path; the plugin
// creates them when needed and otherwise only changes the lines src/shopping.ts and src/mealPlan.ts describe.
import { Notice, normalizePath, type TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import { NOTE_WORDS } from "./noteFormat";
import { defaultListPath, resolveListNote, type ListKind } from "./listNoteResolve";
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

  private path(kind: ListKind): string {
    // Without a stored path: an existing note under a default name keeps its file (both exist: the current language's;
    // `settleListNotes` looks at their content at start and stores the choice).
    const own = this.plugin.settings[kind];
    const r = resolveListNote(own, kind, this.plugin.settings.noteFormat, (p) =>
      this.app.vault.getFileByPath(normalizePath(p)) ? "" : undefined,
    );
    return normalizePath(r.path);
  }

  /** Shopping list note: the setting, otherwise the existing default note, otherwise the default of the note language. */
  shoppingListPath(): string {
    return this.path("shoppingList");
  }

  /** Meal plan note: the setting, otherwise the existing default note, otherwise the default of the note language. */
  mealPlanPath(): string {
    return this.path("mealPlan");
  }

  /**
   * At start (and for existing installations): stores which file a list note uses, so a later change of language never
   * switches it (#76). Both default notes with entries: the current language's is used and one hint names both files.
   */
  async settleListNotes(): Promise<void> {
    const fresh: Partial<Record<ListKind, string>> = {};
    for (const kind of ["shoppingList", "mealPlan"] as const) {
      if (this.plugin.settings[kind].trim()) continue;
      const texts = new Map<string, string>();
      for (const lang of ["de", "en"] as const) {
        const p = normalizePath(defaultListPath(lang, kind));
        const f = this.app.vault.getFileByPath(p);
        if (f) texts.set(p, await this.app.vault.cachedRead(f));
      }
      const r = resolveListNote("", kind, this.plugin.settings.noteFormat, (p) => texts.get(normalizePath(p)));
      if (r.keep) fresh[kind] = normalizePath(r.path);
      if (r.conflict) new Notice(tr("listNotesBoth", { used: r.conflict[0], other: r.conflict[1] }), 15000);
    }
    if (Object.keys(fresh).length) await this.plugin.save(fresh);
  }

  /** Not recipes, even inside the recipe folder. */
  isListNote(path: string): boolean {
    return path === this.shoppingListPath() || path === this.mealPlanPath();
  }

  /** Changes a note with `change`, creating it (and its folder) from an empty text if missing; returns the new text. */
  private async change(path: string, change: (text: string) => string): Promise<string> {
    const file = this.app.vault.getFileByPath(path);
    if (file) return this.app.vault.process(file, change);
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    if (parent && !this.app.vault.getFolderByPath(parent)) await this.app.vault.createFolder(parent);
    const text = change("");
    await this.app.vault.create(path, text);
    // The first write fixes the file: later changes of language keep it.
    for (const kind of ["shoppingList", "mealPlan"] as const)
      if (!this.plugin.settings[kind].trim() && this[`${kind}Path`]() === path)
        await this.plugin.save({ [kind]: path });
    return text;
  }

  private async open(path: string, create: () => Promise<void>) {
    if (!this.app.vault.getFileByPath(path)) await create();
    const file = this.app.vault.getFileByPath(path);
    if (file) await this.app.workspace.getLeaf("tab").openFile(file);
  }

  /** Adds items to the shopping list; reports how many in a notice. */
  async addToShoppingList(items: Item[]) {
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
    const file = this.app.vault.getFileByPath(this.shoppingListPath());
    return file ? this.app.vault.cachedRead(file) : "";
  }

  /** One change of the shopping list page; the new text of the note and whether it changed (undefined if it failed). */
  async editShoppingList(edit: ShoppingEdit): Promise<{ text: string; changed: boolean } | undefined> {
    const path = this.shoppingListPath();
    // Only adding creates the note; every other change needs the note to exist.
    if (edit.kind !== "add" && !this.app.vault.getFileByPath(path)) return { text: "", changed: false };
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

  openShoppingList() {
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
    const file = this.app.vault.getFileByPath(this.mealPlanPath());
    return file ? this.app.vault.cachedRead(file) : "";
  }

  /** One change of the meal plan page; the new text of the note and whether it changed (undefined if it failed). */
  async editMealPlan(edit: PlanEdit): Promise<{ text: string; changed: boolean } | undefined> {
    const path = this.mealPlanPath();
    if (!this.app.vault.getFileByPath(path)) return { text: "", changed: false };
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

  openMealPlan() {
    return this.open(this.mealPlanPath(), async () => {
      await this.change(this.mealPlanPath(), () => `# ${this.words().mealPlan}\n`);
    });
  }

  /** Puts the ingredients of the recipes planned for `start` and the next six days on the shopping list. */
  async planToShoppingList(start = todayIso()) {
    const file = this.app.vault.getFileByPath(this.mealPlanPath());
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
    const file = this.app.vault.getFileByPath(this.mealPlanPath());
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
      const existing = this.app.vault.getFileByPath(path);
      if (existing) await this.app.vault.modify(existing, ics);
      else await this.app.vault.create(path, ics);
      new Notice(tr("planExported", { file: path }));
    } catch (e) {
      new Notice(tr("planFailed", { error: errorText(e) }));
    }
  }
}
