import { describe, expect, it } from "vitest";
import { applyShoppingEdit, openCount, readShoppingRows, rowExists, rowKey, shoppingView } from "../src/shoppingEdit";
import { escapeTarget } from "../src/ui/keyboard";
import { readStores } from "../src/shopping";
import type { ShoppingEdit } from "../src/shoppingEdit";

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

const edit = (text: string, e: Parameters<typeof applyShoppingEdit>[1]) =>
  applyShoppingEdit(text, e, "Einkaufsliste", [], "de");

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
    const checked = edit(NOTE, { kind: "check", raw: "- [ ] Salz", nth: 0, checked: true });
    expect(checked).toBe(NOTE.replace("- [ ] Salz", "- [x] Salz"));
    expect(edit(checked, { kind: "check", raw: "- [x] Salz", nth: 0, checked: false })).toBe(NOTE);
  });

  it("does nothing when the line is gone (note changed meanwhile)", () => {
    expect(edit(NOTE, { kind: "check", raw: "- [ ] Pfeffer", nth: 0, checked: true })).toBe(NOTE);
    expect(edit(NOTE, { kind: "remove", raw: "- [ ] Pfeffer", nth: 0 })).toBe(NOTE);
  });

  it("removes a line with the note lines that hang below it, not its neighbours", () => {
    const out = edit(NOTE, { kind: "remove", raw: "- [ ] 1 l Milch · Kuchen", nth: 0 });
    expect(out).toContain("## Rewe\n\n- [x] 3 Eier");
    expect(out).not.toContain("Vollmilch");
    expect(out).toContain("Freitext bleibt.");
  });

  it("removes checked items together with their note lines", () => {
    const out = edit("# L\n\n- [x] Mehl\n  Type 405\n- [ ] Salz\n  fein\n- [x] Eier\n", { kind: "clearDone" });
    expect(out).toBe("# L\n\n- [ ] Salz\n  fein\n");
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
    expect(applyShoppingEdit("# L\n", { kind: "add", text: "1 l Milch" }, "L", stores, "de")).toContain("## Rewe");
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

describe("identical lines", () => {
  const TWICE = "# L\n\n- [ ] Milch\n- [ ] Salz\n- [ ] Milch\n";
  it("numbers them and gives each its own key", () => {
    const rows = readShoppingRows(TWICE);
    expect(rows.map((r) => r.nth)).toEqual([0, 0, 1]);
    expect(new Set(rows.map(rowKey)).size).toBe(3);
  });

  it("hits the one that was meant", () => {
    expect(edit(TWICE, { kind: "check", raw: "- [ ] Milch", nth: 1, checked: true })).toBe(
      "# L\n\n- [ ] Milch\n- [ ] Salz\n- [x] Milch\n",
    );
    expect(edit(TWICE, { kind: "remove", raw: "- [ ] Milch", nth: 0 })).toBe("# L\n\n- [ ] Salz\n- [ ] Milch\n");
    expect(edit(TWICE, { kind: "remove", raw: "- [ ] Milch", nth: 2 })).toBe(TWICE);
  });
});

describe("note lines below an item", () => {
  const NOTES = "# L\n\n- [ ] Milch\n  Bio\n    Vollmilch\n- [ ] Salz\n";
  it("are read as notes of the row", () => {
    expect(readShoppingRows(NOTES)[0].notes).toEqual(["Bio", "Vollmilch"]);
    expect(readShoppingRows(NOTES)[1].notes).toEqual([]);
  });

  it("go with the item when it is removed, but only lines indented deeper than the item", () => {
    expect(edit(NOTES, { kind: "remove", raw: "- [ ] Milch", nth: 0 })).toBe("# L\n\n- [ ] Salz\n");
    const flush = "# L\n\n- [ ] Milch\nFreitext\n  - [ ] eingerückt\n";
    expect(edit(flush, { kind: "remove", raw: "- [ ] Milch", nth: 0 })).toBe("# L\n\nFreitext\n  - [ ] eingerückt\n");
    const nested = "# L\n  - [ ] innen\n    Notiz\n  - [ ] zweite\n";
    expect(edit(nested, { kind: "remove", raw: "  - [ ] innen", nth: 0 })).toBe("# L\n  - [ ] zweite\n");
  });

  it("stay with an empty line between", () => {
    const gap = "- [ ] Milch\n\n  spät\n";
    expect(edit(gap, { kind: "remove", raw: "- [ ] Milch", nth: 0 })).toBe("\n  spät\n");
  });
});

describe("line endings and unchanged text", () => {
  it("returns the original text when nothing changes", () => {
    const crlf = "# L\r\n\r\n- [ ] Milch\r\n";
    expect(edit(crlf, { kind: "check", raw: "- [ ] Nope", nth: 0, checked: true })).toBe(crlf);
    expect(edit(crlf, { kind: "clearDone" })).toBe(crlf);
    expect(edit(crlf, { kind: "removeRecipe", recipe: "X" })).toBe(crlf);
    expect(edit(crlf, { kind: "add", text: "  " })).toBe(crlf);
  });

  it("keeps CRLF when it changes the note", () => {
    const crlf = "# L\r\n\r\n- [ ] Milch\r\n- [x] Salz\r\n";
    expect(edit(crlf, { kind: "check", raw: "- [ ] Milch", nth: 0, checked: true })).toBe(
      "# L\r\n\r\n- [x] Milch\r\n- [x] Salz\r\n",
    );
    expect(edit(crlf, { kind: "clearDone" })).toBe("# L\r\n\r\n- [ ] Milch\r\n");
    expect(edit(crlf, { kind: "add", text: "Eier" })).toBe("# L\r\n\r\n- [ ] Milch\r\n- [x] Salz\r\n- [ ] Eier\r\n");
  });

  it("reads CRLF notes and [X] as checked", () => {
    const rows = readShoppingRows("- [X] Milch\r\n- [ ] Salz\r\n");
    expect(rows.map((r) => [r.raw, r.checked])).toEqual([
      ["- [X] Milch", true],
      ["- [ ] Salz", false],
    ]);
    const e: ShoppingEdit = { kind: "check", raw: "- [X] Milch", nth: 0, checked: false };
    expect(edit("- [X] Milch\r\n", e)).toBe("- [ ] Milch\r\n");
  });
});

describe("own items with the separator in the text", () => {
  it("never become a recipe", () => {
    const out = edit("# L\n", { kind: "add", text: "Salz · Pfeffer" });
    const row = readShoppingRows(out)[0];
    expect(row.sources).toEqual([]);
    expect(row.name).toBe("Salz - Pfeffer");
  });
});

describe("removing a recipe, more cases", () => {
  it("takes the notes of an item only for that recipe, also when it is done", () => {
    const text = "# L\n\n- [x] 2 Eier · Kuchen\n  Bio\n- [ ] Salz · Brot\n";
    expect(edit(text, { kind: "removeRecipe", recipe: "Kuchen" })).toBe("# L\n\n- [ ] Salz · Brot\n");
  });

  it("changes a done shared item the same way as an open one", () => {
    const text = "- [x] 2 Eier · Kuchen, Brot\n";
    expect(edit(text, { kind: "removeRecipe", recipe: "Kuchen" })).toBe("- [x] 2 Eier · Brot\n");
  });
});

describe("an opened item", () => {
  const none = {
    attempt: false,
    dialog: false,
    view: false,
    import: false,
    cooking: false,
    recipe: false,
    ask: false,
    details: false,
    planDialog: false,
    undo: false,
    page: true,
  };
  it("is only a layer for Esc while its line is in the note", () => {
    const key = rowKey({ raw: "- [ ] Milch", nth: 0 });
    expect(rowExists("- [ ] Milch\n", key)).toBe(true);
    expect(rowExists("- [ ] Salz\n", key)).toBe(false);
    expect(rowExists("", null)).toBe(false);
    // The line is gone (sync): Esc leaves the page instead of closing nothing.
    expect(escapeTarget({ ...none, details: rowExists("- [ ] Salz\n", key) })).toBe("page");
    expect(escapeTarget({ ...none, details: rowExists("- [ ] Milch\n", key) })).toBe("details");
  });
});
