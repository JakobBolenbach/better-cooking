// The plugin's own notes besides recipes: the shopping list (issue #7) and the weekly meal plan (issue #11).
// Both are plain Markdown notes at the top of the vault unless the settings name another path; the plugin
// creates them when needed and otherwise only changes the lines src/shopping.ts and src/mealPlan.ts describe.
import { Notice, normalizePath, type TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import { NOTE_WORDS, listNoteName } from "./noteFormat";
import { addToList, itemsFromRecipe, readStores, removeChecked, type Item } from "./shopping";
import { addToPlan, entryLine, planIcs, plannedFrom, readPlan } from "./mealPlan";
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

  private path(own: string, kind: "shoppingList" | "mealPlan"): string {
    const name = listNoteName(own, this.plugin.settings.noteFormat, kind);
    return normalizePath(name.toLowerCase().endsWith(".md") ? name : `${name}.md`);
  }

  /** Shopping list note (setting, otherwise "Einkaufsliste.md" / "Shopping list.md" at the top). */
  shoppingListPath(): string {
    return this.path(this.plugin.settings.shoppingList, "shoppingList");
  }

  /** Meal plan note (setting, otherwise "Wochenplan.md" / "Meal plan.md" at the top). */
  mealPlanPath(): string {
    return this.path(this.plugin.settings.mealPlan, "mealPlan");
  }

  /** Not recipes, even inside the recipe folder. */
  isListNote(path: string): boolean {
    return path === this.shoppingListPath() || path === this.mealPlanPath();
  }

  /** Changes a note with `change`, creating it (and its folder) from an empty text if missing. */
  private async change(path: string, change: (text: string) => string) {
    const file = this.app.vault.getFileByPath(path);
    if (file) {
      await this.app.vault.process(file, change);
      return;
    }
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    if (parent && !this.app.vault.getFolderByPath(parent)) await this.app.vault.createFolder(parent);
    await this.app.vault.create(path, change(""));
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
      new Notice(tr("shoppingAdded", { n: items.length, file: path }));
    } catch (e) {
      new Notice(tr("shoppingFailed", { error: errorText(e) }));
    }
  }

  /** Removes checked items from the shopping list, e.g. after shopping. */
  async clearShoppingList() {
    const file = this.app.vault.getFileByPath(this.shoppingListPath());
    if (!file) return;
    await this.app.vault.process(file, removeChecked);
    new Notice(tr("shoppingCleared"));
  }

  openShoppingList() {
    return this.open(this.shoppingListPath(), () => this.addToShoppingList([]));
  }

  /** Plans a recipe note on a day, with the servings shown if the recipe has a number of servings. */
  async addToMealPlan(recipePath: string, title: string, date: string, servings?: { count: number; unit: string }) {
    const path = this.mealPlanPath();
    const target = recipePath.replace(/^.*\//, "").replace(/\.md$/i, "");
    const line = entryLine(target, servings?.count, servings?.unit || undefined);
    try {
      await this.change(path, (text) => addToPlan(text, date, line, this.words().mealPlan));
      new Notice(tr("planAdded", { title, file: path }));
    } catch (e) {
      new Notice(tr("planFailed", { error: errorText(e) }));
    }
  }

  openMealPlan() {
    return this.open(this.mealPlanPath(), () => this.change(this.mealPlanPath(), () => `# ${this.words().mealPlan}\n`));
  }

  /** Puts the ingredients of the recipes planned for today and the next six days on the shopping list. */
  async planToShoppingList() {
    const file = this.app.vault.getFileByPath(this.mealPlanPath());
    const entries = file ? plannedFrom(readPlan(await this.app.vault.cachedRead(file)), todayIso()) : [];
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
      new Notice(tr("planEmpty"));
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
