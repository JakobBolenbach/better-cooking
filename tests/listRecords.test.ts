import { describe, expect, it } from "vitest";
import { ListRecords, addWithRecords, contributionsMemo, editWithRecords } from "../src/listRecords";
import { contributionsOf, type ListRecipes, type RecipeLike } from "../src/listRecipes";
import { shoppingView, type ShoppingEdit } from "../src/shoppingEdit";

const brot: RecipeLike = {
  path: "Brot.md",
  title: "Brötchen",
  ingredients: [{ ingredients: ["200 g Mehl", "2 Zwiebeln"] }],
};
const zopf: RecipeLike = { path: "Zopf.md", title: "Hefezopf", ingredients: [{ ingredients: ["300 g Mehl", "1 Ei"] }] };
const RECIPES = [brot, zopf];
const day = 24 * 3600 * 1000;
const LIST = "Liste.md";

/** The list note and the records as the plugin keeps them, worked out by the functions the plugin runs in `vault.process`. */
function world(exists: string[] = [LIST, "Brot.md", "Zopf.md"]) {
  const w = {
    all: {} as ListRecipes,
    saves: 0,
    now: 1000,
    text: "",
    records: undefined as unknown as ListRecords,
    add(...adds: [RecipeLike, number?][]) {
      const r = addWithRecords(
        w.text,
        adds.map(([recipe, factor = 1]) => ({ recipe, factor, skipped: [] })),
        { heading: "Einkaufsliste", stores: [], lang: "de", all: w.all, list: LIST, now: w.now, recipes: RECIPES },
      );
      w.text = r.text;
      return w.records.commit(r.records);
    },
    edit(edit: ShoppingEdit) {
      const r = editWithRecords(w.text, edit, { heading: "L", stores: [], lang: "de", all: w.all, list: LIST });
      const changed = r.text !== w.text;
      w.text = r.text;
      return changed ? w.records.commit(r.records) : Promise.resolve();
    },
    /** What the page shows for the line of Mehl. */
    mehl: () =>
      shoppingView(w.text, contributionsOf(w.all[LIST], RECIPES)).groups[0].rows.find((r) => r.name === "Mehl")!,
  };
  w.records = new ListRecords({
    get: () => w.all,
    save: (x) => {
      w.all = x;
      w.saves++;
      return Promise.resolve();
    },
    exists: (p) => exists.includes(p),
    now: () => w.now,
  });
  return w;
}
const factor = (w: ReturnType<typeof world>, p = "Brot.md") => w.all[LIST]?.[p]?.parts.map((x) => x.factor);
const amounts = (w: ReturnType<typeof world>) => w.mehl().sources.map((s) => s.amount);

describe("adding with records", () => {
  it("adds up what is added again while the recipe is on the list, and the amounts stay known", async () => {
    const w = world();
    await w.add([brot]);
    await w.add([zopf]);
    await w.add([brot]);
    expect(factor(w)).toEqual([2]);
    expect(w.all[LIST]["Brot.md"].unsure).toBeUndefined();
    expect(w.text).toContain("- [ ] 700 g Mehl · Brötchen, Hefezopf");
    expect(amounts(w)).toEqual(["400 g", "300 g"]);
  });
  it("starts again when the recipe was taken off the list in between", async () => {
    const w = world();
    await w.add([brot, 2]);
    await w.edit({ kind: "removeRecipe", recipe: "Brötchen" });
    expect(w.all).toEqual({});
    await w.add([brot, 1]);
    expect(factor(w)).toEqual([1]);
  });
  it("starts again when only done lines were left of the recipe", async () => {
    const w = world();
    await w.add([brot]);
    w.text = w.text.replace(/\[ \]/g, "[x]");
    await w.add([brot]);
    expect(factor(w)).toEqual([1]);
    expect(w.all[LIST]["Brot.md"].unsure).toBeUndefined();
  });
  it("a line removed by hand, then the recipe added again: unsure, no amounts, removing takes only the name", async () => {
    const w = world();
    await w.add([brot], [zopf]);
    w.text = w.text.replace(/^- \[ \] 500 g Mehl.*\n/m, "- [ ] 500 g Mehl · Brötchen, Hefezopf\n");
    w.text = w.text.replace(/^- \[ \] 1 Ei.*\n/m, "");
    await w.add([zopf]);
    expect(w.all[LIST]["Zopf.md"].unsure).toBe(true);
    expect(w.all[LIST]["Brot.md"].unsure).toBeUndefined();
    expect(amounts(w).every((a) => a === undefined)).toBe(true);
    const after = editWithRecords(
      w.text,
      { kind: "removeRecipe", recipe: "Brötchen", known: contributionsOf(w.all[LIST], RECIPES) },
      { heading: "L", stores: [], lang: "de", all: w.all, list: LIST },
    ).text;
    expect(after).toContain("Mehl · Hefezopf");
    expect(after).toMatch(/\d+ g Mehl · Hefezopf/);
  });
  it("an ingredient line deleted for a recipe that stays on the list through another line: unsure", async () => {
    const w = world();
    await w.add([brot]);
    w.text = w.text.replace(/^- \[ \] 200 g Mehl.*\n/m, "");
    await w.add([brot]);
    expect(w.all[LIST]["Brot.md"].unsure).toBe(true);
  });
  it("a line ticked by hand, then the recipe added again: unsure", async () => {
    const w = world();
    await w.add([brot]);
    w.text = w.text.replace("- [ ] 200 g Mehl", "- [x] 200 g Mehl");
    await w.add([brot]);
    expect(w.all[LIST]["Brot.md"].unsure).toBe(true);
    expect(w.text).toContain("- [ ] 200 g Mehl · Brötchen");
  });
  it("unsure stays until the recipe is off the list, then a new add starts clean", async () => {
    const w = world();
    await w.add([brot]);
    w.text = w.text.replace(/^- \[ \] 200 g Mehl.*\n/m, "");
    await w.add([brot]);
    await w.add([brot]);
    expect(w.all[LIST]["Brot.md"].unsure).toBe(true);
    await w.edit({ kind: "removeRecipe", recipe: "Brötchen" });
    await w.add([brot]);
    expect(w.all[LIST]["Brot.md"].unsure).toBeUndefined();
  });
  it("a line shared with a recipe that has no record is checked by what is known: not holding less is fine", async () => {
    const w = world();
    w.text = "# Einkaufsliste\n\n- [ ] 700 g Mehl · Hefezopf\n- [ ] 1 Ei · Hefezopf\n";
    await w.add([brot]);
    expect(w.all[LIST]["Brot.md"].unsure).toBeUndefined();
    w.text = "# Einkaufsliste\n\n- [ ] 100 g Mehl · Brötchen, Hefezopf\n- [ ] 2 Zwiebeln · Brötchen\n";
    await w.add([brot]);
    expect(w.all[LIST]["Brot.md"].unsure).toBe(true);
  });
});

describe("editing with records", () => {
  it("drops the records of recipes the new text has on no line, in the same step", async () => {
    const w = world();
    await w.add([brot], [zopf]);
    await w.edit({ kind: "removeRecipe", recipe: "Hefezopf" });
    expect(Object.keys(w.all[LIST])).toEqual(["Brot.md"]);
  });
  it("after removing the checked lines drops the recipe that had only those", async () => {
    const w = world();
    await w.add([brot]);
    w.text = w.text.replace(/\[ \]/g, "[x]");
    await w.edit({ kind: "clearDone" });
    expect(w.all).toEqual({});
  });
  it("an edit that changes nothing, on a list another device has not synced yet, keeps every record", async () => {
    const w = world();
    await w.add([brot], [zopf]);
    const saves = w.saves;
    // This device's text lacks Hefezopf (the other device added it); the edit hits no line.
    w.text = "# Einkaufsliste\n\n- [ ] 200 g Mehl · Brötchen\n";
    await w.edit({ kind: "check", raw: "- [ ] not there", nth: 0, checked: true });
    expect(Object.keys(w.all[LIST]).sort()).toEqual(["Brot.md", "Zopf.md"]);
    expect(w.saves).toBe(saves);
  });
  it("reading the list never saves: the records are only used for the display", async () => {
    const w = world();
    await w.add([brot], [zopf]);
    const saves = w.saves;
    w.text = "# Einkaufsliste\n\n- [ ] 200 g Mehl · Brötchen\n";
    w.mehl();
    expect(w.saves).toBe(saves);
    expect(Object.keys(w.all[LIST]).sort()).toEqual(["Brot.md", "Zopf.md"]);
  });
});

describe("ListRecords", () => {
  it("move follows renames and deletes and saves only a change", async () => {
    const w = world();
    await w.add([brot]);
    await w.records.move("Brot.md", "Neu.md");
    expect(Object.keys(w.all[LIST])).toEqual(["Neu.md"]);
    const saves = w.saves;
    await w.records.move("Nothing.md", "X.md");
    expect(w.saves).toBe(saves);
    await w.records.move("Neu.md");
    expect(w.all).toEqual({});
  });
  it("prune drops only records of notes that are gone; expire drops lists out of use after 30 days, never the one in use", async () => {
    const w = world([LIST, "Alt.md", "Brot.md"]);
    await w.add([brot]);
    w.all = { ...w.all, "Alt.md": w.all[LIST], "Weg.md": w.all[LIST] };
    w.now = 1000 + 40 * day;
    await w.records.prune();
    expect(Object.keys(w.all)).toEqual([LIST, "Alt.md"]);
    await w.records.expire(LIST);
    expect(Object.keys(w.all)).toEqual([LIST]);
  });
  it("with several lists, nothing is saved when only the order of the keys differs", async () => {
    const w = world([LIST, "B.md", "Brot.md"]);
    await w.add([brot]);
    w.all = { "B.md": w.all[LIST], [LIST]: w.all[LIST] };
    const saves = w.saves;
    await w.records.prune();
    await w.records.move("Nothing.md", "X.md");
    await w.records.commit({ [LIST]: w.all[LIST], "B.md": w.all["B.md"] });
    expect(w.saves).toBe(saves);
  });
});

describe("contributionsMemo", () => {
  it("computes again only for other records or recipes", async () => {
    const w = world();
    await w.add([brot]);
    const memo = contributionsMemo();
    const a = memo(w.all[LIST], RECIPES);
    expect(memo(w.all[LIST], RECIPES)).toBe(a);
    expect(memo(w.all[LIST], [...RECIPES])).not.toBe(a);
    expect(a.get("Brötchen")?.items.length).toBeGreaterThan(0);
  });
});
