// Amount per recipe on the shopping list (issue #68): the list note holds one line per ingredient with the names of
// the recipes it is for. How much of a line belongs to which recipe is worked out again from what was remembered when
// the recipe was added (servings factor, left out ingredients, in the plugin data) and the recipe's ingredients, with
// the same identity and units as when lines are merged (src/shopping.ts). Nothing is guessed: a recipe without a
// remembered add, a recipe whose ingredients changed since, or a title that fits two notes shows no amount.
// Pure functions without Obsidian, tested in tests/listRecipes.test.ts.

import { amountText, baseUnit, itemsFromRecipe, merge, type Item } from "./shopping";
import type { Lang } from "./i18n";
import type { IngredientGroup } from "./types";

/** One add of a recipe to the list. */
export interface RecipePart {
  factor: number;
  /** Skipped ingredients as "group-line" (see itemsFromRecipe). */
  skipped: string[];
  /** Fingerprint of the ingredients at the time (`recipeSig`): other ingredients now, no amounts. */
  sig: string;
}

/** What is remembered about a recipe on a list: every add (adding twice adds the amounts twice, as on the list). */
export interface RecipeRecord {
  parts: RecipePart[];
  at: number;
}

/** List note path → recipe note path → record. */
export type ListRecipes = Record<string, Record<string, RecipeRecord>>;

/** The recipe as far as this file needs it. */
export interface RecipeLike {
  path: string;
  title: string;
  ingredients: IngredientGroup[];
}

/** One add of a recipe, as the recipe page or the meal plan makes it. */
export interface RecipeAdd {
  recipe: RecipeLike;
  factor: number;
  skipped: string[];
}

/** Short fingerprint of the ingredient lines (FNV-1a), to notice a recipe that was edited after it was added. */
export function recipeSig(groups: IngredientGroup[]): string {
  let h = 0x811c9dc5;
  for (const ch of groups.map((g) => g.ingredients.join("\n")).join("\n\n")) {
    h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const sameSkipped = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** The records of a list with these adds added; the same factor and left out ingredients in one part, factors summed. */
export function recordAdds(all: ListRecipes, list: string, adds: RecipeAdd[], at: number): ListRecipes {
  const records = { ...all[list] };
  for (const { recipe, factor, skipped } of adds) {
    const sig = recipeSig(recipe.ingredients);
    // Another version of the ingredients: the older parts can no longer be computed, they are dropped.
    // Copies: the input is the settings in memory, which are shared with the base of the merge (src/settingsSync.ts).
    const keep = (records[recipe.path]?.parts ?? [])
      .filter((p) => p.sig === sig)
      .map((p) => ({ ...p, skipped: [...p.skipped] }));
    const same = keep.find((p) => sameSkipped(p.skipped, skipped));
    if (same) same.factor = Math.round((same.factor + factor) * 1e6) / 1e6;
    else keep.push({ factor, skipped: [...skipped], sig });
    records[recipe.path] = { parts: keep, at };
  }
  return { ...all, [list]: records };
}

/** The records follow a note that is renamed (`to`) or go with it when it is deleted: a recipe note, or the list itself. */
export function moveListRecipes(all: ListRecipes, from: string, to?: string): ListRecipes {
  const out: ListRecipes = {};
  for (const [list, records] of Object.entries(all)) {
    const { [from]: moved, ...rest } = records;
    const target = list.toLowerCase() === from.toLowerCase() ? to : list;
    const next = moved && to ? { ...rest, [to]: moved } : rest;
    if (target && Object.keys(next).length) out[target] = { ...(out[target] ?? {}), ...next };
  }
  return out;
}

/** Records of notes that no longer exist are dropped (`exists` for recipe notes and list notes alike). */
export function pruneListRecipes(all: ListRecipes, exists: (path: string) => boolean): ListRecipes {
  const out: ListRecipes = {};
  for (const [list, records] of Object.entries(all)) {
    if (!exists(list)) continue;
    const kept = Object.fromEntries(Object.entries(records).filter(([path]) => exists(path)));
    if (Object.keys(kept).length) out[list] = kept;
  }
  return out;
}

/** Records of recipes that are no longer on the list: `titles` are the recipes of the list's lines. */
export function dropOffList(
  records: Record<string, RecipeRecord>,
  recipes: readonly RecipeLike[],
  titles: readonly string[],
): Record<string, RecipeRecord> {
  return Object.fromEntries(
    Object.entries(records).filter(([path]) => {
      const r = recipes.find((x) => x.path === path);
      return !r || titles.includes(r.title);
    }),
  );
}

/** What a recipe brings to a list: its path and the items of all its adds (unmerged), by title as written on the list. */
export type Contributions = Map<string, { path: string; items: Item[] }>;

/** Items of the recipes that can be computed: exactly one note has the title, a record exists, the ingredients are still those. */
export function contributionsOf(
  records: Record<string, RecipeRecord> | undefined,
  recipes: readonly RecipeLike[],
): Contributions {
  const out: Contributions = new Map();
  if (!records) return out;
  const count = new Map<string, number>();
  for (const r of recipes) count.set(r.title, (count.get(r.title) ?? 0) + 1);
  for (const r of recipes) {
    const rec = records[r.path];
    if (!rec || count.get(r.title) !== 1) continue;
    const sig = recipeSig(r.ingredients);
    if (!rec.parts.length || rec.parts.some((p) => p.sig !== sig)) continue;
    const items = rec.parts.flatMap((p) => itemsFromRecipe(r.title, r.ingredients, p.factor, p.skipped));
    out.set(r.title, { path: r.path, items });
  }
  return out;
}

/** How much of a line is for one recipe; `amount` is in the line's unit, undefined if the line has none or it is not known. */
export interface Share {
  recipe: string;
  /** Is it known how much of the line the recipe brings (false: no amount is shown)? */
  known: boolean;
  amount?: number;
}

/** The amounts per recipe of a line, and whether they add up to the line (only then a recipe can be taken off exactly). */
export interface Shares {
  shares: Share[];
  exact: boolean;
}

/** In base units: the amounts of a recipe's items that join the line (same ingredient, units that add up), merged like on the list. */
function brought(line: Item, items: Item[]): number | undefined {
  const open = { ...line, checked: false };
  let sum: Item | undefined;
  for (const it of items) {
    if (!merge(open, it)) continue;
    sum = sum ? (merge(sum, it) ?? sum) : it;
  }
  return sum?.amount === undefined ? undefined : sum.amount * baseUnit(sum.unit)[1];
}

/** Is the sum what the line says? The line was rounded when it was written, so equal when written the same way, or within 3 %. */
function addsUp(line: Item, base: number): boolean {
  const f = baseUnit(line.unit)[1];
  const shown = line.amount! * f;
  if (Math.abs(base - shown) <= 0.03 * Math.max(base, shown)) return true;
  return amountText(base / f, line.unit, "de") === amountText(line.amount!, line.unit, "de");
}

/** Amounts per recipe of a line (a row of the page or a line of the note); undefined amounts for lines without one. */
export function amountsFor(line: Item, known: Contributions): Shares {
  const withAmount = line.amount !== undefined;
  const f = baseUnit(line.unit)[1];
  const shares: Share[] = line.recipes.map((recipe) => {
    const c = known.get(recipe);
    if (!c) return { recipe, known: false };
    if (!withAmount) return { recipe, known: true };
    const b = brought(line, c.items);
    return b === undefined ? { recipe, known: false } : { recipe, known: true, amount: b / f };
  });
  const all = line.recipes.length > 0 && shares.every((s) => s.known);
  const sum = shares.reduce((n, s) => n + (s.amount ?? 0) * f, 0);
  return { shares, exact: all && (!withAmount || addsUp(line, sum)) };
}

/** `amountsFor` with the records of a list and the recipes of the vault. */
export function amountsPerRecipe(
  line: Item,
  records: Record<string, RecipeRecord> | undefined,
  recipes: readonly RecipeLike[],
): Shares {
  return amountsFor(line, contributionsOf(records, recipes));
}

/** Readable amounts per recipe for the page ("Brötchen" → "200 g"); recipes without a known amount are left out. */
export function shareTexts(line: Item, known: Contributions, lang: Lang): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of amountsFor(line, known).shares)
    if (s.amount !== undefined) out.set(s.recipe, amountText(s.amount, line.unit, lang));
  return out;
}

/**
 * The line without one recipe, its amount reduced by exactly what the recipe brings: undefined if that cannot be done
 * safely (the amounts do not add up to the line, a recipe is not known, the recipe is alone or nothing is left).
 * Name and unit stay as on the line; a counted item that falls to one or less takes the name the recipes give it.
 */
export function withoutRecipe(line: Item, recipe: string, known: Contributions): Item | undefined {
  const { shares, exact } = amountsFor(line, known);
  if (!exact || line.amount === undefined || line.recipes.length < 2 || !line.recipes.includes(recipe))
    return undefined;
  const rest = shares.filter((s) => s.recipe !== recipe);
  const amount = rest.reduce((n, s) => n + (s.amount ?? 0), 0);
  if (!(amount > 0) || rest.some((s) => s.amount === undefined)) return undefined;
  let name = line.name;
  if (!line.unit && amount <= 1) {
    // What the remaining recipes make of the name, merged like on the list.
    const items = rest.flatMap((s) =>
      known.get(s.recipe)!.items.filter((it) => merge({ ...line, checked: false }, it)),
    );
    const first = items.reduce<Item | undefined>((a, b) => (a ? (merge(a, b) ?? a) : b), undefined);
    if (first) name = first.name;
  }
  return { ...line, name, amount, recipes: line.recipes.filter((r) => r !== recipe) };
}
