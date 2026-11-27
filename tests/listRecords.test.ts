import { describe, expect, it } from "vitest";
import { ListRecords, contributionsMemo } from "../src/listRecords";
import type { ListRecipes, RecipeLike } from "../src/listRecipes";
import { applyShoppingEdit, listTitles, openTitles } from "../src/shoppingEdit";
import { addToList, itemsOfAdds } from "./helpers/lists";

const brot: RecipeLike = {
  path: "Brot.md",
  title: "Brötchen",
  ingredients: [{ ingredients: ["200 g Mehl", "2 Zwiebeln"] }],
};
const zopf: RecipeLike = { path: "Zopf.md", title: "Hefezopf", ingredients: [{ ingredients: ["300 g Mehl"] }] };

/** The records and the list note as the plugin keeps them, with the notes that exist. */
function world(exists: string[] = ["Liste.md", "Brot.md", "Zopf.md"]) {
  const w = {
    all: {} as ListRecipes,
    saves: 0,
    now: 1000,
    text: "",
    exists,
    records: undefined as unknown as ListRecords,
    async add(...adds: [RecipeLike, number?][]) {
      const list = adds.map(([recipe, factor = 1]) => ({ recipe, factor, skipped: [] }));
      const onList = openTitles(w.text);
      w.text = addToList(w.text, itemsOfAdds(list));
      await w.records.add("Liste.md", list, onList);
    },
  };
  w.records = new ListRecords({
    get: () => w.all,
    save: (x) => {
      w.all = x;
      w.saves++;
      return Promise.resolve();
    },
    exists: (p) => w.exists.includes(p),
    now: () => w.now,
  });
  return w;
}
const factor = (w: ReturnType<typeof world>, p = "Brot.md") => w.all["Liste.md"]?.[p]?.parts.map((x) => x.factor);

describe("ListRecords", () => {
  it("adds up what is added again while the recipe is on the list", async () => {
    const w = world();
    await w.add([brot]);
    await w.add([brot]);
    expect(factor(w)).toEqual([2]);
  });
  it("starts again when the recipe was taken off the list in between (by hand or the page)", async () => {
    const w = world();
    await w.add([brot, 2]);
    w.text = "# Einkaufsliste\n\n";
    await w.add([brot, 1]);
    expect(factor(w)).toEqual([1]);
  });
  it("starts again when only done lines were left of the recipe", async () => {
    const w = world();
    await w.add([brot]);
    w.text = w.text.replace(/\[ \]/g, "[x]");
    await w.add([brot]);
    expect(factor(w)).toEqual([1]);
  });
  it("tidy drops records whose title is on no line, for recipes that are not loaded too, and saves only a change", async () => {
    const w = world();
    await w.add([brot], [zopf]);
    expect(w.saves).toBe(1);
    await w.records.tidy("Liste.md", w.text);
    expect(w.saves).toBe(1);
    const after = applyShoppingEdit(w.text, { kind: "removeRecipe", recipe: "Hefezopf" }, "L", [], "de");
    await w.records.tidy("Liste.md", after);
    expect(Object.keys(w.all["Liste.md"])).toEqual(["Brot.md"]);
    expect(w.saves).toBe(2);
  });
  it("tidy after removing the checked lines drops the recipe that had only those", async () => {
    const w = world();
    await w.add([brot]);
    const done = w.text.replace(/\[ \]/g, "[x]");
    const cleared = applyShoppingEdit(done, { kind: "clearDone" }, "L", [], "de");
    expect(listTitles(cleared).size).toBe(0);
    await w.records.tidy("Liste.md", cleared);
    expect(w.all).toEqual({});
  });
  it("move follows renames and deletes and saves only a change", async () => {
    const w = world();
    await w.add([brot]);
    await w.records.move("Brot.md", "Neu.md");
    expect(Object.keys(w.all["Liste.md"])).toEqual(["Neu.md"]);
    const saves = w.saves;
    await w.records.move("Nothing.md", "X.md");
    expect(w.saves).toBe(saves);
    await w.records.move("Neu.md");
    expect(w.all).toEqual({});
  });
  it("prune drops notes that are gone and lists not in use after 30 days, but never the list in use", async () => {
    const w = world(["Liste.md", "Alt.md", "Brot.md"]);
    await w.add([brot]);
    w.all = { ...w.all, "Alt.md": w.all["Liste.md"], "Weg.md": w.all["Liste.md"] };
    const day = 24 * 3600 * 1000;
    w.now = 1000 + 10 * day;
    await w.records.prune("Liste.md");
    expect(Object.keys(w.all)).toEqual(["Liste.md", "Alt.md"]);
    w.now = 1000 + 40 * day;
    await w.records.prune("Liste.md");
    expect(Object.keys(w.all)).toEqual(["Liste.md"]);
  });
});

describe("contributionsMemo", () => {
  it("computes again only for other records or recipes", async () => {
    const w = world();
    await w.add([brot]);
    const memo = contributionsMemo();
    const recipes = [brot];
    const a = memo(w.all["Liste.md"], recipes);
    expect(memo(w.all["Liste.md"], recipes)).toBe(a);
    expect(memo(w.all["Liste.md"], [brot])).not.toBe(a);
    expect(a.get("Brötchen")?.items.length).toBeGreaterThan(0);
  });
});
