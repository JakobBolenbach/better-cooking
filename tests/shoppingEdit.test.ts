import { describe, expect, it } from "vitest";
import { applyShoppingEdit, openCount, readShoppingRows, shoppingView } from "../src/shoppingEdit";
import { readStores } from "../src/shopping";

const NOTE = `# Einkaufsliste

- [ ] 500 g Mehl · Brot, Kuchen
- [x] 2 Zwiebeln · Suppe
- [ ] Salz

## Rewe

- [ ] 1 l Milch · Kuchen
  Bio, Vollmilch
- [x] 3 Eier · Kuchen

Freitext bleibt.
`;

const edit = (text: string, e: Parameters<typeof applyShoppingEdit>[1]) => applyShoppingEdit(text, e, "Einkaufsliste");

describe("reading the list for the page", () => {
  it("makes a row of every checkbox line with its section, amount and recipes", () => {
    const rows = readShoppingRows(NOTE);
    expect(rows.map((r) => [r.amount, r.name, r.checked, r.section])).toEqual([
      ["500 g", "Mehl", false, undefined],
      ["2", "Zwiebeln", true, undefined],
      ["", "Salz", false, undefined],
      ["1 l", "Milch", false, "Rewe"],
      ["3", "Eier", true, "Rewe"],
    ]);
    expect(rows[0].sources).toEqual([{ recipe: "Brot" }, { recipe: "Kuchen" }]);
    expect(rows[0].raw).toBe("- [ ] 500 g Mehl · Brot, Kuchen");
  });

  it("groups open items by store, puts checked ones apart and lists the recipes once", () => {
    const v = shoppingView(NOTE);
    expect(v.groups.map((g) => [g.name, g.rows.map((r) => r.name)])).toEqual([
      [undefined, ["Mehl", "Salz"]],
      ["Rewe", ["Milch"]],
    ]);
    expect(v.done.map((r) => r.name)).toEqual(["Zwiebeln", "Eier"]);
    expect(v.recipes).toEqual(["Brot", "Kuchen"]);
    expect(v.open).toBe(3);
    expect(openCount(NOTE)).toBe(3);
  });

  it("leaves out a store without open items and copes with an empty note", () => {
    expect(shoppingView("# L\n\n## Rewe\n- [x] Milch\n").groups).toEqual([]);
    expect(shoppingView("")).toEqual({ groups: [], done: [], recipes: [], open: 0 });
    expect(openCount("")).toBe(0);
  });
});

describe("checking and removing", () => {
  it("checks and unchecks the line with exactly that text, nothing else", () => {
    const checked = edit(NOTE, { kind: "check", raw: "- [ ] Salz", checked: true });
    expect(checked).toBe(NOTE.replace("- [ ] Salz", "- [x] Salz"));
    expect(edit(checked, { kind: "check", raw: "- [x] Salz", checked: false })).toBe(NOTE);
  });

  it("does nothing when the line is gone (note changed meanwhile)", () => {
    expect(edit(NOTE, { kind: "check", raw: "- [ ] Pfeffer", checked: true })).toBe(NOTE);
    expect(edit(NOTE, { kind: "remove", raw: "- [ ] Pfeffer" })).toBe(NOTE);
  });

  it("removes a line with the note lines that hang below it, not its neighbours", () => {
    const out = edit(NOTE, { kind: "remove", raw: "- [ ] 1 l Milch · Kuchen" });
    expect(out).toContain("## Rewe\n\n- [x] 3 Eier");
    expect(out).not.toContain("Vollmilch");
    expect(out).toContain("Freitext bleibt.");
  });

  it("removes checked items", () => {
    const out = edit(NOTE, { kind: "clearDone" });
    expect(out).not.toContain("Zwiebeln");
    expect(out).not.toContain("Eier");
    expect(out).toContain("- [ ] Salz");
  });
});

describe("own items", () => {
  it("adds a typed line with its amount below the last item, without recipes", () => {
    const out = edit("# Einkaufsliste\n\n- [ ] Salz\n", { kind: "add", text: "  2 Zwiebeln " });
    expect(out).toBe("# Einkaufsliste\n\n- [ ] Salz\n- [ ] 2 Zwiebeln\n");
  });

  it("adds up with an open item of the same name and creates the note if there is none", () => {
    expect(edit("# L\n\n- [ ] 500 g Mehl · Brot\n", { kind: "add", text: "250 g Mehl" })).toContain(
      "- [ ] 750 g Mehl · Brot",
    );
    expect(edit("", { kind: "add", text: "Milch" })).toBe("# Einkaufsliste\n\n- [ ] Milch\n");
  });

  it("puts it into the store that fits and ignores empty input", () => {
    const stores = readStores("Rewe: Milch");
    expect(applyShoppingEdit("# L\n", { kind: "add", text: "1 l Milch" }, "L", stores)).toContain("## Rewe");
    expect(edit(NOTE, { kind: "add", text: "   " })).toBe(NOTE);
  });
});

describe("removing a recipe", () => {
  it("drops items only for that recipe and the name from shared ones", () => {
    const out = edit(NOTE, { kind: "removeRecipe", recipe: "Kuchen" });
    expect(out).toContain("- [ ] 500 g Mehl · Brot\n");
    expect(out).not.toContain("Milch");
    expect(out).not.toContain("Vollmilch");
    expect(out).not.toContain("Eier");
    expect(out).toContain("- [x] 2 Zwiebeln · Suppe");
    expect(out).toContain("- [ ] Salz");
  });

  it("changes nothing for an unknown recipe", () => {
    expect(edit(NOTE, { kind: "removeRecipe", recipe: "Nope" })).toBe(NOTE);
  });
});
