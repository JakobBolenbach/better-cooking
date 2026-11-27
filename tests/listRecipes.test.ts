import { describe, expect, it } from "vitest";
import {
  amountsFor,
  amountsPerRecipe,
  contributionsOf,
  dropOffList,
  moveListRecipes,
  pruneListRecipes,
  recordAdds,
  recipeSig,
  withoutRecipe,
  type ListRecipes,
  type RecipeLike,
} from "../src/listRecipes";

import { applyShoppingEdit, shoppingView } from "../src/shoppingEdit";
import { addToList, itemsFromRecipe, readItemLine } from "../src/shopping";

const rec = (path: string, title: string, ...lines: string[]): RecipeLike => ({
  path,
  title,
  ingredients: [{ ingredients: lines }],
});
const brot = rec("Brot.md", "Brötchen", "200 g Mehl", "10 g Salz", "2 Zwiebeln");
const zopf = rec("Zopf.md", "Hefezopf", "300 g Mehl, gesiebt", "1 Ei");
const RECIPES = [brot, zopf];

/** The list as the plugin writes it when the recipes are added in this order. */
function listWith(adds: { r: RecipeLike; factor?: number; skip?: string[] }[]) {
  let text = "";
  let records: ListRecipes = {};
  for (const { r, factor = 1, skip = [] } of adds) {
    text = addToList(text, itemsFromRecipe(r.title, r.ingredients, factor, skip), "Einkaufsliste", [], "de");
    records = recordAdds(records, "Einkaufsliste.md", [{ recipe: r, factor, skipped: skip }], 1);
  }
  return { text, records: records["Einkaufsliste.md"] };
}
const lineOf = (text: string, name: string) => readItemLine(text.split("\n").find((l) => l.includes(name))!)!;

describe("amount per recipe", () => {
  it("splits a shared line by recipe", () => {
    const { text, records } = listWith([{ r: brot }, { r: zopf }]);
    expect(text).toContain("- [ ] 500 g Mehl · Brötchen, Hefezopf");
    const { shares, exact } = amountsPerRecipe(lineOf(text, "Mehl"), records, RECIPES);
    expect(shares).toEqual([
      { recipe: "Brötchen", known: true, amount: 200 },
      { recipe: "Hefezopf", known: true, amount: 300 },
    ]);
    expect(exact).toBe(true);
  });

  it("uses the servings factor", () => {
    const { text, records } = listWith([
      { r: brot, factor: 2 },
      { r: zopf, factor: 0.5 },
    ]);
    const { shares, exact } = amountsPerRecipe(lineOf(text, "Mehl"), records, RECIPES);
    expect(shares.map((s) => s.amount)).toEqual([400, 150]);
    expect(exact).toBe(true);
  });

  it("leaves out skipped ingredients", () => {
    const two = rec("Zwei.md", "Kuchen", "100 g Mehl", "2 Eier");
    const { text, records } = listWith([{ r: brot, skip: ["0-0"] }, { r: two }]);
    // Brötchen skipped its flour: Mehl is only for Kuchen, one recipe on the line.
    expect(text).toContain("- [ ] 100 g Mehl · Kuchen");
    const s = amountsPerRecipe(lineOf(text, "Mehl"), records, [brot, two]);
    expect(s.shares).toEqual([{ recipe: "Kuchen", known: true, amount: 100 }]);
  });

  it("adding a recipe twice adds its amounts twice, with different skips too", () => {
    const { text, records } = listWith([{ r: zopf }, { r: zopf, factor: 2, skip: ["0-1"] }, { r: brot }]);
    expect(text).toContain("- [ ] 1,1 kg Mehl");
    const s = amountsPerRecipe(lineOf(text, "Mehl"), records, RECIPES);
    expect(s.shares.map((x) => x.amount)).toEqual([0.9, 0.2]);
    expect(s.exact).toBe(true);
    expect(records[zopf.path].parts).toHaveLength(2);
  });

  it("sums the factors of the same add", () => {
    const { records } = listWith([{ r: brot }, { r: brot, factor: 2 }]);
    expect(records[brot.path].parts).toEqual([{ factor: 3, skipped: [], sig: recipeSig(brot.ingredients) }]);
  });

  it("shows no amount without a record, nor for a title of two notes, nor after the ingredients changed", () => {
    const { text, records } = listWith([{ r: brot }, { r: zopf }]);
    const line = lineOf(text, "Mehl");
    const { [zopf.path]: _gone, ...onlyBrot } = records;
    const a = amountsPerRecipe(line, onlyBrot, RECIPES);
    expect(a.shares).toEqual([
      { recipe: "Brötchen", known: true, amount: 200 },
      { recipe: "Hefezopf", known: false },
    ]);
    expect(a.exact).toBe(false);
    const twin = [...RECIPES, rec("Anderer.md", "Brötchen", "1 g Hefe")];
    expect(amountsPerRecipe(line, records, twin).shares[0]).toEqual({ recipe: "Brötchen", known: false });
    const edited = [rec("Brot.md", "Brötchen", "250 g Mehl"), zopf];
    expect(amountsPerRecipe(line, records, edited).shares[0].known).toBe(false);
    expect(amountsPerRecipe(line, undefined, RECIPES).exact).toBe(false);
  });

  it("a line changed by hand still shows amounts but is not exact", () => {
    const { records } = listWith([{ r: brot }, { r: zopf }]);
    const edited = readItemLine("- [ ] 800 g Mehl · Brötchen, Hefezopf")!;
    const a = amountsPerRecipe(edited, records, RECIPES);
    expect(a.shares.map((s) => s.amount)).toEqual([200, 300]);
    expect(a.exact).toBe(false);
  });

  it("a line in another unit (kg) gets the amounts in that unit", () => {
    const { records } = listWith([{ r: brot }, { r: zopf }]);
    const line = readItemLine("- [ ] 0,5 kg Mehl · Brötchen, Hefezopf")!;
    const a = amountsFor(line, contributionsOf(records, RECIPES));
    expect(a.shares.map((s) => s.amount)).toEqual([0.2, 0.3]);
    expect(a.exact).toBe(true);
  });

  it("lines without an amount have no amounts and are always exact", () => {
    const a = rec("A.md", "A", "Salz");
    const b = rec("B.md", "B", "Salz nach Geschmack");
    const { text, records } = listWith([{ r: a }, { r: b }]);
    const s = amountsPerRecipe(lineOf(text, "Salz"), records, [a, b]);
    expect(s.shares.map((x) => x.amount)).toEqual([undefined, undefined]);
    expect(s.exact).toBe(true);
  });
});

describe("removing a recipe from a shared line", () => {
  const edit = (text: string, recipe: string, records: ListRecipes[string]) =>
    applyShoppingEdit(text, { kind: "removeRecipe", recipe, known: contributionsOf(records, RECIPES) }, "L", [], "de");

  it("takes off exactly the recipe's amount", () => {
    const { text, records } = listWith([{ r: brot }, { r: zopf }]);
    const after = edit(text, "Brötchen", records);
    expect(after).toContain("- [ ] 300 g Mehl · Hefezopf");
    expect(after).not.toContain("Brötchen");
    expect(after).toContain("- [ ] 1 Ei · Hefezopf");
  });

  it("works with factors and keeps unit, indentation and notes", () => {
    const { text, records } = listWith([{ r: brot, factor: 2 }, { r: zopf }]);
    const noted = text.replace("- [ ] 700 g Mehl", "  - [ ] 700 g Mehl").replace("Hefezopf\n", "Hefezopf\n    Bio\n");
    const after = edit(noted, "Hefezopf", records);
    expect(after).toContain("  - [ ] 400 g Mehl · Brötchen\n    Bio");
  });

  it("falls back to the name only when the line was changed by hand", () => {
    const { text, records } = listWith([{ r: brot }, { r: zopf }]);
    const after = edit(text.replace("500 g", "800 g"), "Brötchen", records);
    expect(after).toContain("- [ ] 800 g Mehl · Hefezopf");
  });

  it("falls back to the name only when a record is missing", () => {
    const { text, records } = listWith([{ r: brot }, { r: zopf }]);
    const { [zopf.path]: _gone, ...onlyBrot } = records;
    expect(edit(text, "Brötchen", onlyBrot)).toContain("- [ ] 500 g Mehl · Hefezopf");
  });

  it("without any data it behaves as before", () => {
    const { text } = listWith([{ r: brot }, { r: zopf }]);
    const after = applyShoppingEdit(text, { kind: "removeRecipe", recipe: "Hefezopf" }, "L", [], "de");
    expect(after).toContain("- [ ] 500 g Mehl · Brötchen");
  });

  it("a checked line keeps its amount", () => {
    const { text, records } = listWith([{ r: brot }, { r: zopf }]);
    const after = edit(text.replace("- [ ] 500 g Mehl", "- [x] 500 g Mehl"), "Brötchen", records);
    expect(after).toContain("- [x] 500 g Mehl · Hefezopf");
  });

  it("a counted item falls back to the singular", () => {
    const a = rec("A.md", "A", "1 Zwiebel");
    const b = rec("B.md", "B", "2 Zwiebeln");
    const { text, records } = listWith([{ r: a }, { r: b }]);
    expect(text).toContain("- [ ] 3 Zwiebeln · A, B");
    const known = contributionsOf(records, [a, b]);
    const line = lineOf(text, "Zwiebeln");
    expect(withoutRecipe(line, "B", known)).toMatchObject({ amount: 1, name: "Zwiebel", recipes: ["A"] });
    expect(withoutRecipe(line, "A", known)).toMatchObject({ amount: 2 });
  });

  it("does not take a recipe off a line it is alone on", () => {
    const { text, records } = listWith([{ r: brot }]);
    expect(withoutRecipe(lineOf(text, "Mehl"), "Brötchen", contributionsOf(records, RECIPES))).toBeUndefined();
  });
});

describe("the page rows", () => {
  it("carry the amount per recipe on shared lines only", () => {
    const { text, records } = listWith([{ r: brot }, { r: zopf }]);
    const rows = shoppingView(text, contributionsOf(records, RECIPES)).groups[0].rows;
    const mehl = rows.find((r) => r.name === "Mehl")!;
    expect(mehl.sources).toEqual([
      { recipe: "Brötchen", amount: "200 g" },
      { recipe: "Hefezopf", amount: "300 g" },
    ]);
    expect(rows.find((r) => r.name === "Salz")!.sources[0].amount).toBeUndefined();
    expect(shoppingView(text).groups[0].rows[0].sources[0].amount).toBeUndefined();
  });
});

const freeze = <T>(x: T): T => {
  if (x && typeof x === "object") Object.values(x).forEach(freeze);
  return Object.freeze(x);
};

describe("the page shows amounts only when they add up", () => {
  it("a line changed by hand shows the names only", () => {
    const { text, records } = listWith([{ r: brot }, { r: zopf }]);
    const edited = text.replace("500 g Mehl", "800 g Mehl");
    const rows = shoppingView(edited, contributionsOf(records, RECIPES)).groups[0].rows;
    expect(rows.find((r) => r.name === "Mehl")!.sources).toEqual([
      { recipe: "Brötchen", amount: undefined },
      { recipe: "Hefezopf", amount: undefined },
    ]);
  });
  it("a recipe without a record shows no amount for any recipe of the line", () => {
    const { text, records } = listWith([{ r: brot }, { r: zopf }]);
    const { [zopf.path]: _gone, ...onlyBrot } = records;
    const rows = shoppingView(text, contributionsOf(onlyBrot, RECIPES)).groups[0].rows;
    expect(rows.find((r) => r.name === "Mehl")!.sources.map((x) => x.amount)).toEqual([undefined, undefined]);
  });
});

describe("tolerance of the sum", () => {
  const two = [rec("A.md", "A", "500 g Mehl"), rec("B.md", "B", "500 g Mehl")];
  const known = () => {
    const { records } = listWith([{ r: two[0] }, { r: two[1] }]);
    return contributionsOf(records, two);
  };
  const exact = (line: string) => amountsFor(readItemLine(`- [ ] ${line} · A, B`)!, known()).exact;
  it("half a rounding step per merged item is fine, more is not", () => {
    // 1 kg is written in steps of 10 g: two items, so up to 10 g.
    expect(exact("1 kg Mehl")).toBe(true);
    expect(exact("1010 g Mehl")).toBe(true);
    expect(exact("990 g Mehl")).toBe(true);
    expect(exact("1015 g Mehl")).toBe(false);
    expect(exact("985 g Mehl")).toBe(false);
  });
  it("20 g of one's own on a 1 kg line is not a match", () => {
    expect(exact("1020 g Mehl")).toBe(false);
    expect(exact("1,02 kg Mehl")).toBe(false);
  });
  it("small amounts have small tolerance", () => {
    const a = [rec("A.md", "A", "30 g Salz"), rec("B.md", "B", "30 g Salz")];
    const { records } = listWith([{ r: a[0] }, { r: a[1] }]);
    const k = contributionsOf(records, a);
    const at = (t: string) => amountsFor(readItemLine(`- [ ] ${t} Salz · A, B`)!, k).exact;
    expect(at("60 g")).toBe(true);
    expect(at("61 g")).toBe(true);
    expect(at("62 g")).toBe(false);
  });
});

describe("remembered adds", () => {
  it("recordAdds leaves its input alone (the settings in memory are shared with the saved base)", () => {
    const once = recordAdds({}, "L.md", [{ recipe: brot, factor: 1, skipped: ["0-1"] }], 1);
    const frozen = freeze(structuredClone(once));
    const twice = recordAdds(frozen, "L.md", [{ recipe: brot, factor: 1, skipped: ["0-1"] }], 2);
    expect(twice["L.md"][brot.path].parts[0].factor).toBe(2);
    expect(frozen["L.md"][brot.path].parts[0].factor).toBe(1);
    expect(frozen["L.md"][brot.path].at).toBe(1);
  });
  const all: ListRecipes = recordAdds({}, "L.md", [{ recipe: brot, factor: 1, skipped: [] }], 5);
  it("follow a renamed recipe or list and go with a deleted one", () => {
    expect(Object.keys(moveListRecipes(all, "Brot.md", "Neu.md")["L.md"])).toEqual(["Neu.md"]);
    expect(Object.keys(moveListRecipes(all, "L.md", "M.md"))).toEqual(["M.md"]);
    expect(moveListRecipes(all, "Brot.md")).toEqual({});
    expect(moveListRecipes(all, "L.md")).toEqual({});
    expect(moveListRecipes(all, "Other.md", "X.md")).toEqual(all);
  });
  it("are pruned when a note is gone", () => {
    expect(pruneListRecipes(all, () => true)).toEqual(all);
    expect(pruneListRecipes(all, (p) => p !== "Brot.md")).toEqual({});
    expect(pruneListRecipes(all, (p) => p !== "L.md")).toEqual({});
  });
  it("are dropped when the recipe is no longer on the list", () => {
    expect(Object.keys(dropOffList(all["L.md"], RECIPES, ["Hefezopf"]))).toEqual([]);
    expect(Object.keys(dropOffList(all["L.md"], RECIPES, ["Brötchen"]))).toEqual(["Brot.md"]);
    // A recipe that is not loaded keeps its record.
    expect(Object.keys(dropOffList(all["L.md"], [], []))).toEqual(["Brot.md"]);
  });
});
