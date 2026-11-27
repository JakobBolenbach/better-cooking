// The remembered adds of recipes to lists (`listRecipes` in data.json, src/listRecipes.ts) and what keeps them true.
// The changes of the list note and of the records are worked out together in pure functions (`addWithRecords`,
// `editWithRecords`), so what the plugin does inside `vault.process` is what the tests run. Records are cleaned up only
// from text the plugin has just written itself, never from text it merely read: a list that another device has not
// synced yet must not cost the records of the recipes on it. `ListRecords` saves them (without Obsidian: the settings
// and the notes are passed in, tests/listRecords.test.ts).
import {
  amountsFor,
  contributionsOf,
  dropOffList,
  expireListRecipes,
  itemsOfAdds,
  markUnsure,
  moveListRecipes,
  pruneListRecipes,
  recordAdds,
  type Contributions,
  type ListRecipes,
  type RecipeAdd,
  type RecipeLike,
  type RecipeRecord,
} from "./listRecipes";
import { merge, addToList, readItemLine, type Item, type Store } from "./shopping";
import { applyShoppingEdit, listTitles, openTitles, type ShoppingEdit } from "./shoppingEdit";
import { same } from "./settingsMerge";
import type { Lang } from "./i18n";

const lines = (text: string) => text.split(/\r?\n/);

/**
 * Do the open lines of the list still carry what the record of a recipe says it brought? Every ingredient of the
 * recipe is on an open line that names it, and each such line adds up (exactly when all its recipes are known, otherwise
 * at least not holding less than the known recipes bring). A line that was removed, ticked or changed by hand fails.
 */
function fits(text: string, title: string, known: Contributions): boolean {
  const c = known.get(title);
  if (!c) return false;
  const mine = lines(text)
    .map(readItemLine)
    .filter((i): i is Item => !!i && !i.checked && i.recipes.includes(title));
  if (!c.items.every((it) => mine.some((l) => merge(l, it)))) return false;
  return mine.every((l) => {
    const a = amountsFor(l, known);
    return a.shares.find((s) => s.recipe === title)?.known && (a.exact || (!a.complete && a.within));
  });
}

/**
 * Adds recipes to the list text and works out the records: a recipe that is not on an open line starts again, one that
 * is on the list but does not match any more (see `fits`) is marked unsure before the add, so it shows no amounts.
 * `recipes`: the recipes known, to check the lines the recipe shares with others.
 */
export function addWithRecords(
  text: string,
  adds: RecipeAdd[],
  o: {
    heading: string;
    stores: Store[];
    lang: Lang;
    all: ListRecipes;
    list: string;
    now: number;
    recipes?: readonly RecipeLike[];
  },
): { text: string; records: ListRecipes } {
  const onList = openTitles(text);
  // The recipes known plus those being added, each once (a title that fits two notes has no amounts).
  const recipes = new Map([...(o.recipes ?? []), ...adds.map((a) => a.recipe)].map((r) => [r.path, r] as const));
  const known = contributionsOf(o.all[o.list], [...recipes.values()]);
  const stale = adds
    .filter((a) => onList.has(a.recipe.title) && !fits(text, a.recipe.title, known))
    .map((a) => a.recipe.path);
  const marked = markUnsure(o.all, o.list, stale);
  return {
    text: addToList(text, itemsOfAdds(adds), o.heading, o.stores, o.lang),
    records: recordAdds(marked, o.list, adds, o.now, onList),
  };
}

/**
 * One edit of the page: the new text, and the records without those of recipes that the new text no longer has on any
 * line. The records change only if the text did.
 */
export function editWithRecords(
  text: string,
  edit: ShoppingEdit,
  o: { heading: string; stores: Store[]; lang: Lang; all: ListRecipes; list: string },
): { text: string; records: ListRecipes } {
  const after = applyShoppingEdit(text, edit, o.heading, o.stores, o.lang);
  return { text: after, records: after === text ? o.all : dropOffList(o.all, o.list, listTitles(after)) };
}

export interface RecordsIo {
  get(): ListRecipes;
  save(next: ListRecipes): Promise<void>;
  /** Does the note exist (recipe note or list note)? */
  exists(path: string): boolean;
  now(): number;
}

export class ListRecords {
  constructor(private io: RecordsIo) {}

  /** Saves `next` if it differs from what is stored (whatever the order of the keys). */
  async commit(next: ListRecipes) {
    if (!same(next, this.io.get())) await this.io.save(next);
  }

  /** The records follow a renamed note (recipe or list) and go with a deleted one (`now` undefined). */
  move(old: string, now?: string) {
    return this.commit(moveListRecipes(this.io.get(), old, now));
  }

  /** At start, once the notes are known: records of notes that are gone. */
  prune() {
    return this.commit(pruneListRecipes(this.io.get(), (p) => this.io.exists(p)));
  }

  /** Records of lists that are not in use (`active`) and were added to long ago. */
  expire(active: string) {
    return this.commit(expireListRecipes(this.io.get(), active, this.io.now()));
  }
}

/** `contributionsOf` that is computed again only when the records or the recipes are other objects than last time. */
export function contributionsMemo() {
  let last: { records?: Record<string, RecipeRecord>; recipes: readonly RecipeLike[]; out: Contributions } | undefined;
  return (records: Record<string, RecipeRecord> | undefined, recipes: readonly RecipeLike[]): Contributions => {
    if (!last || last.records !== records || last.recipes !== recipes)
      last = { records, recipes, out: contributionsOf(records, recipes) };
    return last.out;
  };
}
