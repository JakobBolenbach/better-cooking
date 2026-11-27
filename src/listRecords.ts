// The remembered adds of recipes to lists (`listRecipes` in data.json, src/listRecipes.ts) and what keeps them true:
// add, follow renamed notes, clean up. Without Obsidian: the settings and the notes are passed in
// (tests/listRecords.test.ts). Every change is compared with what is stored first and saved only if it differs.
import {
  contributionsOf,
  dropOffList,
  expireListRecipes,
  moveListRecipes,
  pruneListRecipes,
  recordAdds,
  type Contributions,
  type ListRecipes,
  type RecipeAdd,
  type RecipeLike,
  type RecipeRecord,
} from "./listRecipes";
import { listTitles } from "./shoppingEdit";

export interface RecordsIo {
  get(): ListRecipes;
  save(next: ListRecipes): Promise<void>;
  /** Does the note exist (recipe note or list note)? */
  exists(path: string): boolean;
  now(): number;
}

export class ListRecords {
  constructor(private io: RecordsIo) {}

  /** Saves `next` if it differs from what is stored. */
  private async commit(next: ListRecipes) {
    if (JSON.stringify(next) !== JSON.stringify(this.io.get())) await this.io.save(next);
  }

  /** Remembers recipes added to `list`; `onList`: the titles on its open lines before they were added. */
  add(list: string, adds: RecipeAdd[], onList: ReadonlySet<string>) {
    return adds.length ? this.commit(recordAdds(this.io.get(), list, adds, this.io.now(), onList)) : Promise.resolve();
  }

  /** The records follow a renamed note (recipe or list) and go with a deleted one (`now` undefined). */
  move(old: string, now?: string) {
    return this.commit(moveListRecipes(this.io.get(), old, now));
  }

  /** `text` is the list as it is now: records of recipes that are on none of its lines go. */
  tidy(list: string, text: string) {
    return this.commit(dropOffList(this.io.get(), list, listTitles(text)));
  }

  /** At start: records of notes that are gone, and of lists that are not in use (`active`) and were added to long ago. */
  prune(active: string) {
    return this.commit(
      expireListRecipes(
        pruneListRecipes(this.io.get(), (p) => this.io.exists(p)),
        active,
        this.io.now(),
      ),
    );
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
