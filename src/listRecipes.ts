// Amount per recipe on the shopping list (issue #68): the list note holds one line per ingredient with the names of
// the recipes it is for. How much of a line belongs to which recipe is worked out again from what was remembered when
// the recipe was added (servings factor, left out ingredients, in the plugin data) and the recipe's ingredients, with
// the same identity and units as when lines are merged (src/shopping.ts). Nothing is guessed: a recipe without a
// remembered add, a recipe whose ingredients changed since, or a title that fits two notes shows no amount.
// Pure functions without Obsidian, tested in tests/listRecipes.test.ts.

import { amountText, baseUnit, itemsFromRecipe, merge, type Item } from "./shopping";
import type { Lang } from "./i18n";
import { safeKey } from "./safeKey";
import { isCountable } from "./units";
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
  /** The recipe's title as written on the list, so the record can be checked against the list without the recipe. */
  title: string;
  /** When it was last added (ms): records of lists that are not in use expire. */
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

/** The items of recipes added with their factors and left out ingredients. */
export const itemsOfAdds = (adds: RecipeAdd[]): Item[] =>
  adds.flatMap((a) => itemsFromRecipe(a.recipe.title, a.recipe.ingredients, a.factor, a.skipped));

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
export function recordAdds(
  all: ListRecipes,
  list: string,
  adds: RecipeAdd[],
  at: number,
  /** Titles on the open lines of the list before the add: a recipe that is not among them starts again. */
  onList: ReadonlySet<string>,
): ListRecipes {
  let records = { ...all[list] };
  const started = new Set<string>();
  for (const { recipe, factor, skipped } of adds) {
    if (!safeKey(recipe.path) || !safeKey(list)) continue;
    // Not on the list any more (taken off by hand, shopping done): what was remembered belongs to an older add.
    const fresh = !onList.has(recipe.title) && !started.has(recipe.path);
    started.add(recipe.path);
    const sig = recipeSig(recipe.ingredients);
    // Another version of the ingredients: the older parts can no longer be computed, they are dropped.
    // Copies: the input is the settings in memory, which are shared with the base of the merge (src/settingsSync.ts).
    const keep = (fresh ? [] : (records[recipe.path]?.parts ?? []))
      .filter((p) => p.sig === sig)
      .map((p) => ({ ...p, skipped: [...p.skipped] }));
    const same = keep.find((p) => sameSkipped(p.skipped, skipped));
    if (same) same.factor = Math.round((same.factor + factor) * 1e6) / 1e6;
    else keep.push({ factor, skipped: [...skipped], sig });
    records = { ...records, [recipe.path]: { parts: keep, title: recipe.title, at } };
  }
  return safeKey(list) ? { ...all, [list]: records } : all;
}

/** The records of lists from pairs (list, records of recipes); lists with the same path join, empty ones and unsafe keys are left out. */
export function buildListRecipes(entries: Iterable<[string, [string, RecipeRecord][]]>): ListRecipes {
  const lists = new Map<string, [string, RecipeRecord][]>();
  for (const [list, rs] of entries) if (safeKey(list)) lists.set(list, [...(lists.get(list) ?? []), ...rs]);
  return Object.fromEntries(
    [...lists]
      .map(([list, rs]): [string, [string, RecipeRecord][]] => [list, rs.filter(([path]) => safeKey(path))])
      .filter(([, rs]) => rs.length)
      .map(([list, rs]) => [list, Object.fromEntries(rs)]),
  );
}

/** The records follow a note that is renamed (`to`) or go with it when it is deleted: a recipe note, or the list itself. */
export function moveListRecipes(all: ListRecipes, from: string, to?: string): ListRecipes {
  return buildListRecipes(
    Object.entries(all).flatMap(([list, records]): [string, [string, RecipeRecord][]][] => {
      const target = list.toLowerCase() === from.toLowerCase() ? to : list;
      const moved = Object.entries(records).flatMap(([path, rec]): [string, RecipeRecord][] =>
        path !== from ? [[path, rec]] : to ? [[to, rec]] : [],
      );
      return target ? [[target, moved]] : [];
    }),
  );
}

/** Records of notes that no longer exist are dropped (`exists` for recipe notes and list notes alike). */
export function pruneListRecipes(all: ListRecipes, exists: (path: string) => boolean): ListRecipes {
  return buildListRecipes(
    Object.entries(all).flatMap(([list, records]): [string, [string, RecipeRecord][]][] =>
      exists(list) ? [[list, Object.entries(records).filter(([path]) => exists(path))]] : [],
    ),
  );
}

/** Records of recipes whose title is on no line of the list any more (`titles`: all lines, open or done), loaded recipe or not. */
export function dropOffList(all: ListRecipes, list: string, titles: ReadonlySet<string>): ListRecipes {
  const records = all[list];
  if (!records) return all;
  return buildListRecipes([
    ...Object.entries(all)
      .filter(([l]) => l !== list)
      .map(([l, rs]): [string, [string, RecipeRecord][]] => [l, Object.entries(rs)]),
    [list, Object.entries(records).filter(([, r]) => titles.has(r.title))],
  ]);
}

const MONTH = 30 * 24 * 3600 * 1000;

/** Records of lists that are not the one in use (`active`, any letter case) and were last added to more than 30 days ago are dropped. */
export function expireListRecipes(all: ListRecipes, active: string, now: number): ListRecipes {
  return buildListRecipes(
    Object.entries(all).map(([list, rs]): [string, [string, RecipeRecord][]] => [
      list,
      Object.entries(rs).filter(([, r]) => list.toLowerCase() === active.toLowerCase() || now - r.at <= MONTH),
    ]),
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

/** The items that join `line` (same ingredient, units that add up), merged like on the list, and how many there are. */
function joined(line: Item, items: Item[]): { item: Item; n: number } | undefined {
  const open = { ...line, checked: false };
  let item: Item | undefined;
  let n = 0;
  for (const it of items) {
    if (!merge(open, it)) continue;
    item = item ? (merge(item, it) ?? item) : it;
    n++;
  }
  return item && { item, n };
}

/** The step the list rounds an amount to when it writes it (`amountText`), in the base unit. */
function roundingStep(v: number, unit?: string): number {
  const [b] = baseUnit(unit);
  if (b === "g" || b === "ml") return v >= 1000 ? 10 : v >= 100 ? 5 : v >= 10 ? 1 : v >= 1 ? 0.5 : 0.1;
  // Spoons and pieces: halves for counted things, fractions of at most a third apart otherwise.
  return isCountable(unit) && v >= 1 ? 0.5 : 0.25;
}

/**
 * Is the sum (in base units, from `n` merged items) what the line says? The line was rounded each time an item was
 * merged, by at most half a step, so it may differ by half a step per item and no more.
 */
function addsUp(line: Item, sum: number, n: number): boolean {
  const shown = line.amount! * baseUnit(line.unit)[1];
  return Math.abs(sum - shown) <= (n * roundingStep(Math.max(sum, shown), line.unit)) / 2 + 1e-9;
}

/** Amounts per recipe of a line (a row of the page or a line of the note); undefined amounts for lines without one. */
export function amountsFor(line: Item, known: Contributions): Shares {
  const withAmount = line.amount !== undefined;
  const f = baseUnit(line.unit)[1];
  let items = 0;
  const shares: Share[] = line.recipes.map((recipe) => {
    const c = known.get(recipe);
    if (!c) return { recipe, known: false };
    if (!withAmount) return { recipe, known: true };
    const j = joined(line, c.items);
    if (j?.item.amount === undefined) return { recipe, known: false };
    items += j.n;
    return { recipe, known: true, amount: (j.item.amount * baseUnit(j.item.unit)[1]) / f };
  });
  const all = line.recipes.length > 0 && shares.every((s) => s.known);
  const sum = shares.reduce((n, s) => n + (s.amount ?? 0) * f, 0);
  return { shares, exact: all && (!withAmount || addsUp(line, sum, items)) };
}

/** `amountsFor` with the records of a list and the recipes of the vault. */
export function amountsPerRecipe(
  line: Item,
  records: Record<string, RecipeRecord> | undefined,
  recipes: readonly RecipeLike[],
): Shares {
  return amountsFor(line, contributionsOf(records, recipes));
}

/** Readable amounts per recipe for the page ("Brötchen" → "200 g"); only when they add up to the line, otherwise none. */
export function shareTexts(line: Item, known: Contributions, lang: Lang): Map<string, string> {
  const out = new Map<string, string>();
  const { shares, exact } = amountsFor(line, known);
  if (exact)
    for (const s of shares) if (s.amount !== undefined) out.set(s.recipe, amountText(s.amount, line.unit, lang));
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
    const first = joined(
      line,
      rest.flatMap((s) => known.get(s.recipe)!.items),
    );
    if (first) name = first.item.name;
  }
  return { ...line, name, amount, recipes: line.recipes.filter((r) => r !== recipe) };
}
