import { describe, expect, it } from "vitest";
import {
  addToList,
  itemFromLine,
  itemLine,
  itemsFromRecipe,
  readItemLine,
  readStores,
  removeChecked,
} from "../src/shopping";
import { UNIT_FORMS, ingredientName, scaleLine, splitQuantity, unitFor } from "../src/quantities";

describe("splitQuantity", () => {
  it("splits amount, unit and the rest", () => {
    expect(splitQuantity("1 ½ EL Öl")).toEqual({ amount: 1.5, unit: "EL", rest: "Öl" });
    expect(splitQuantity("2 Zwiebeln")).toEqual({ amount: 2, unit: undefined, rest: "Zwiebeln" });
    expect(splitQuantity("2-3 Möhren")).toEqual({ amount: 3, unit: undefined, rest: "Möhren" });
    expect(splitQuantity("Salz")).toEqual({ rest: "Salz" });
  });
});

describe("items", () => {
  it("reads ingredients for a servings factor and leaves out equipment", () => {
    const items = itemsFromRecipe(
      "Brot",
      [
        { ingredients: ["500 g Weizenmehl Type 550", "1 Zwiebel, fein gehackt", "Salz"] },
        { title: "Ausstattung", ingredients: ["1 Gusseisentopf"] },
      ],
      2,
    );
    expect(items.map(itemLine)).toEqual([
      "- [ ] 1 kg Weizenmehl Type 550 · Brot",
      "- [ ] 2 Zwiebel · Brot",
      "- [ ] Salz · Brot",
    ]);
  });

  it("skips ingredients that are checked on the recipe page", () => {
    const groups = [{ ingredients: ["500 g Mehl", "Salz"] }, { title: "Teig", ingredients: ["2 Eier"] }];
    expect(itemsFromRecipe("Brot", groups, 1, ["0-1", "1-0"]).map((i) => i.name)).toEqual(["Mehl"]);
  });

  it("reads its own lines back", () => {
    const i = itemFromLine("250 ml Milch", "Pfannkuchen");
    expect(readItemLine(itemLine(i))).toEqual(i);
    expect(readItemLine("- [x] Brot")).toEqual({
      amount: undefined,
      unit: undefined,
      name: "Brot",
      recipes: [],
      checked: true,
    });
    expect(readItemLine("Kein Eintrag")).toBeUndefined();
  });
});

describe("litres and kilograms (#40)", () => {
  it("writes the amount in the unit as written", () => {
    expect(itemLine(itemFromLine("1.2 l vegetable stock", "Soup"))).toBe("- [ ] 1,2 l vegetable stock · Soup");
    expect(itemLine(itemFromLine("0.5 kg flour", "Bread"))).toBe("- [ ] 500 g flour · Bread");
    expect(itemLine(itemFromLine("2 dl cream", "Sauce"))).toBe("- [ ] 200 ml cream · Sauce");
  });
  it("reads long forms, L and grams", () => {
    expect(itemLine(itemFromLine("1.2 L vegetable stock", "Soup"))).toBe("- [ ] 1,2 l vegetable stock · Soup");
    expect(itemLine(itemFromLine("500 grams flour", "Bread"))).toBe("- [ ] 500 g flour · Bread");
    expect(itemLine(itemFromLine("2 Deziliter Sahne", "Sauce"))).toBe("- [ ] 200 ml Sahne · Sauce");
  });
  it("merges long forms with the short ones", () => {
    const out = addToList("# L\n\n- [ ] 200 ml Sahne · A\n", [itemFromLine("2 Deziliter Sahne", "B")], "L");
    expect(out).toContain("- [ ] 400 ml Sahne · A, B");
  });
  it("writes small weights in mg, never 0 g", () => {
    expect(itemLine(itemFromLine("20 mg Safran", "A"))).toBe("- [ ] 20 mg Safran · A");
    expect(itemLine(itemFromLine("250 mg Safran", "A"))).toBe("- [ ] 250 mg Safran · A");
    expect(itemLine(itemFromLine("0.25 g Safran", "A"))).toBe("- [ ] 250 mg Safran · A");
  });
  it("rounds in the base unit before choosing the unit", () => {
    expect(itemLine({ name: "Milch", amount: 999.6, unit: "ml", recipes: [], checked: false })).toBe("- [ ] 1 l Milch");
    expect(itemLine({ name: "Mehl", amount: 1005, unit: "g", recipes: [], checked: false })).toBe("- [ ] 1,01 kg Mehl");
    expect(itemLine(itemFromLine("0.05 l Rum", "A"))).toBe("- [ ] 50 ml Rum · A");
    expect(itemLine(itemFromLine("0.333 l Milch", "A"))).toBe("- [ ] 335 ml Milch · A");
  });
  it("adds mixed units and reads them back", () => {
    const list = (items: string[]) => items.reduce((t, l) => addToList(t, [itemFromLine(l, undefined)], "List"), "");
    expect(list(["500 ml milk", "250 ml milk", "500 ml milk"])).toContain("- [ ] 1,25 l milk");
    expect(list(["500 ml milk", "1 l milk"])).toContain("- [ ] 1,5 l milk");
    expect(list(["1 l milk", "250 ml milk"])).toContain("- [ ] 1,25 l milk");
    expect(list(["0.5 kg flour", "300 g flour"])).toContain("- [ ] 800 g flour");
  });
  it("counts up an existing line in litres", () => {
    const out = addToList("# L\n\n- [ ] 1,2 l stock · Soup\n", [itemFromLine("0.5 l stock", "Stew")], "L");
    expect(out).toContain("- [ ] 1,7 l stock · Soup, Stew");
    expect(addToList(out, [itemFromLine("300 ml stock", "Curry")], "L")).toContain("- [ ] 2 l stock");
  });
});

describe("addToList", () => {
  it("starts a new list with a heading", () => {
    expect(addToList("", [itemFromLine("2 Eier", "Kuchen")], "Einkaufsliste")).toBe(
      "# Einkaufsliste\n\n- [ ] 2 Eier · Kuchen\n",
    );
  });

  it("merges equal items with compatible units and keeps everything else", () => {
    const list = ["# Einkaufsliste", "", "Notiz von mir", "- [ ] 500 g Mehl · Brot", "- [ ] Butter", "", "Ende"].join(
      "\n",
    );
    const out = addToList(
      list,
      [
        itemFromLine("1 kg Mehl", "Kuchen"),
        itemFromLine("100 g Butter", "Kuchen"),
        itemFromLine("1 Zwiebel", "Suppe"),
        itemFromLine("2 Zwiebeln", "Salat"),
      ],
      "x",
    );
    expect(out).toBe(
      [
        "# Einkaufsliste",
        "",
        "Notiz von mir",
        "- [ ] 1,5 kg Mehl · Brot, Kuchen",
        "- [ ] Butter",
        "- [ ] 100 g Butter · Kuchen",
        "- [ ] 3 Zwiebeln · Suppe, Salat",
        "",
        "Ende",
        "",
      ].join("\n"),
    );
  });

  it("adds spoons to spoons and liters to milliliters, but not across kinds", () => {
    const out = addToList(
      "- [ ] 1 EL Öl\n- [ ] 0,5 l Milch\n",
      [itemFromLine("2 EL Öl", "A"), itemFromLine("250 ml Milch", "B"), itemFromLine("1 TL Öl", "C")],
      "x",
    );
    expect(out).toBe("- [ ] 3 EL Öl · A\n- [ ] 750 ml Milch · B\n- [ ] 1 TL Öl · C\n");
  });

  it("merges singular and plural", () => {
    expect(addToList("- [ ] 2 Tomaten\n", [itemFromLine("1 Tomate", "A")], "x")).toBe("- [ ] 3 Tomaten · A\n");
    expect(addToList("- [ ] 1 Kartoffel\n", [itemFromLine("3 Kartoffeln", "A")], "x")).toBe("- [ ] 4 Kartoffeln · A\n");
  });

  it("does not merge into checked items", () => {
    expect(addToList("- [x] 2 Eier\n", [itemFromLine("2 Eier", "Kuchen")], "x")).toBe(
      "- [x] 2 Eier\n- [ ] 2 Eier · Kuchen\n",
    );
  });

  it("removes checked items", () => {
    expect(removeChecked("# L\n- [x] Mehl\n- [ ] Salz\nText\n")).toBe("# L\n- [ ] Salz\nText\n");
  });
});

describe("stores", () => {
  const stores = readStores("dm: Backpapier, Zahnpasta\nRewe: Mehl, Milch, Eier\nkein Laden\nLeer:");

  it("reads the setting", () => {
    expect(stores).toEqual([
      { name: "dm", words: ["backpapier", "zahnpasta"] },
      { name: "Rewe", words: ["mehl", "milch", "eier"] },
    ]);
  });

  it("sorts new items into store sections and keeps the rest above them", () => {
    const out = addToList(
      "# Einkaufsliste\n",
      [
        itemFromLine("500 g Weizenmehl", "Brot"),
        itemFromLine("1 Rolle Backpapier", "Brot"),
        itemFromLine("2 Zwiebeln", "Suppe"),
        itemFromLine("200 ml Milch", "Suppe"),
      ],
      "x",
      stores,
    );
    expect(out).toBe(
      [
        "# Einkaufsliste",
        "",
        "- [ ] 2 Zwiebeln · Suppe",
        "",
        "## Rewe",
        "- [ ] 500 g Weizenmehl · Brot",
        "- [ ] 200 ml Milch · Suppe",
        "",
        "## dm",
        "- [ ] 1 Rolle Backpapier · Brot",
        "",
      ].join("\n"),
    );
  });

  it("remembers where the user moved an item, even when it is checked", () => {
    const list = "# L\n\n- [ ] Salz\n\n## Markt\n- [x] Zwiebeln\n";
    expect(addToList(list, [itemFromLine("1 Zwiebel", "Suppe")], "x", stores)).toBe(
      "# L\n\n- [ ] Salz\n\n## Markt\n- [x] Zwiebeln\n- [ ] 1 Zwiebel · Suppe\n",
    );
  });
});

const list = (...items: string[]) =>
  addToList(
    "",
    items.map((l) => itemFromLine(l, undefined)),
    "Einkaufsliste",
  );

describe("merging plurals (#46)", () => {
  it("merges Ei, Eier and Ei(er)", () => {
    expect(list("3 Eier", "6 Ei(er)")).toBe("# Einkaufsliste\n\n- [ ] 9 Eier\n");
    expect(list("2 Ei", "3 Eier")).toBe("# Einkaufsliste\n\n- [ ] 5 Eier\n");
    expect(list("6 Ei(er)", "1 Ei")).toBe("# Einkaufsliste\n\n- [ ] 7 Eier\n");
    expect(list("2 Wachteleier", "2 Wachtelei")).toContain("4 Wachteleier");
  });

  it("keeps the regular plurals working", () => {
    expect(list("1 Zwiebel", "2 Zwiebeln")).toContain("3 Zwiebeln");
    expect(list("2 Tomaten", "1 Tomate(n)")).toContain("3 Tomaten");
    expect(list("2 Möhren", "1 Möhre")).toContain("3 Möhren");
    expect(list("2 eggs", "1 egg")).toContain("3 eggs");
    expect(list("1 onion", "2 onions")).toContain("3 onions");
    expect(list("2 Lorbeerblätter", "1 Lorbeerblatt")).toContain("3 Lorbeerblätter");
  });

  it("does not merge different words that only end alike", () => {
    expect(list("100 g Butter", "100 g Butt")).toBe("# Einkaufsliste\n\n- [ ] 100 g Butter\n- [ ] 100 g Butt\n");
    expect(list("100 g Zucker", "100 g Zuck")).toContain("100 g Zuck");
    expect(
      list("100 g Butter", "100 g Zucker")
        .split("\n")
        .filter((l) => l.startsWith("- ")),
    ).toHaveLength(2);
    expect(
      list("1 Bier", "1 Bi")
        .split("\n")
        .filter((l) => l.startsWith("- ")),
    ).toHaveLength(2);
  });
});

describe("unit plurals (#46)", () => {
  it("every pair is known as a unit", () => {
    for (const [one, many] of Object.entries(UNIT_FORMS)) {
      expect(splitQuantity(`2 ${one} X`).unit).toBe(one);
      expect(splitQuantity(`2 ${many} X`).unit).toBe(many);
    }
  });

  it("picks the form by amount", () => {
    expect(unitFor("Prise", 2)).toBe("Prisen");
    expect(unitFor("Prisen", 1)).toBe("Prise");
    expect(unitFor("Prise", 0.5)).toBe("Prise");
    expect(unitFor("Blatt", 3)).toBe("Blätter");
    expect(unitFor("pinch", 2)).toBe("pinches");
    expect(unitFor("handfuls", 1)).toBe("handful");
    expect(unitFor("Stück", 3)).toBe("Stück");
    expect(unitFor("EL", 3)).toBe("EL");
  });

  it("writes the plural when merging and the singular for one", () => {
    expect(list("1 Prise Salz", "1 Prise Salz")).toContain("2 Prisen Salz");
    expect(list("1 Prise Salz", "2 Prisen Salz")).toContain("3 Prisen Salz");
    expect(list("1 clove Garlic", "1 clove Garlic")).toContain("2 cloves Garlic");
    expect(list("1 Zehe Knoblauch")).toContain("1 Zehe Knoblauch");
    expect(list("2 Zehen Knoblauch")).toContain("2 Zehen Knoblauch");
    expect(list("1 Dose Tomaten", "1 Dose Tomaten")).toContain("2 Dosen Tomaten");
    expect(list("3 Stück Brot", "1 Stück Brot")).toContain("4 Stück Brot");
  });

  it("uses the singular for an amount that is written as plural but is one", () => {
    expect(itemLine(itemFromLine("1 Prisen Salz", undefined))).toBe("- [ ] 1 Prise Salz");
    expect(itemLine(itemFromLine("1 Prise Salz", undefined, 2))).toBe("- [ ] 2 Prisen Salz");
  });

  it("scales recipe lines with the matching unit", () => {
    const text = (l: string, f: number) =>
      scaleLine(l, f)
        .map((p) => p.text)
        .join("");
    expect(text("1 Handvoll Nüsse", 2)).toBe("2 Handvoll Nüsse");
    expect(text("1 handful nuts", 2)).toBe("2 handfuls nuts");
    expect(text("2 handfuls nuts", 0.5)).toBe("1 handful nuts");
    expect(text("1 Prise Salz", 3)).toBe("3 Prisen Salz");
    expect(text("2-3 Zehen Knoblauch", 0.5)).toMatch(/^1 \S+ 1 ½ Zehen Knoblauch$/);
    expect(text("1-2 Zehen Knoblauch", 0.5)).toMatch(/^½ \S+ 1 Zehe Knoblauch$/);
    expect(text("1 EL Öl, 1 Zehe Knoblauch", 2)).toBe("2 EL Öl, 2 Zehen Knoblauch");
  });
});

describe("comma after the unit (#46)", () => {
  it("belongs to the text, not the quantity", () => {
    expect(splitQuantity("1 TL, gestr. Backpulver")).toEqual({ amount: 1, unit: "TL", rest: "gestr. Backpulver" });
    expect(scaleLine("1 TL, gestr. Backpulver", 2)).toEqual([
      { text: "2 TL", quantity: true },
      { text: ", gestr. Backpulver" },
    ]);
    expect(scaleLine("1 TL, gestr. Backpulver", 1)[0]).toEqual({ text: "1 TL", quantity: true });
  });

  it("names the ingredient without the measuring word", () => {
    expect(ingredientName("1 TL, gestr. Backpulver")).toBe("Backpulver");
    expect(ingredientName("1 EL, gehäuft Zucker")).toBe("Zucker");
    expect(ingredientName("1,5 kg Mehl")).toBe("Mehl");
    expect(ingredientName("1 Zwiebel, fein gehackt")).toBe("Zwiebel");
    expect(ingredientName("1 EL, gehackte Petersilie")).toBe("gehackte Petersilie");
    expect(itemLine(itemFromLine("1 TL, gestr. Backpulver", "Kuchen"))).toBe("- [ ] 1 TL Backpulver · Kuchen");
    expect(list("1 TL, gestr. Backpulver", "1 TL Backpulver")).toContain("2 TL Backpulver");
  });

  it("reads an old list line with the comma in front of the name", () => {
    expect(readItemLine("- [ ] 1 TL , gestr. Backpulver · Kuchen")?.name).toBe("gestr. Backpulver");
  });
});

describe("stores for lines that are only counted up (#46)", () => {
  const stores = readStores("Rewe: Mehl, Milch");

  it("moves a counted-up line above the sections into the store that fits now", () => {
    const old = "# Einkaufsliste\n\n- [ ] 500 g Mehl · Brot\n- [ ] 1 Zwiebel · Brot\n";
    const out = addToList(old, [itemFromLine("250 g Mehl", "Kuchen")], "Einkaufsliste", stores);
    expect(out).toBe("# Einkaufsliste\n\n- [ ] 1 Zwiebel · Brot\n\n## Rewe\n- [ ] 750 g Mehl · Brot, Kuchen\n");
  });

  it("leaves a line the user put in a section where it is", () => {
    const old = "# Einkaufsliste\n\n## Markt\n- [ ] 500 g Mehl · Brot\n\n## Rewe\n- [ ] 1 l Milch · Brot\n";
    const out = addToList(old, [itemFromLine("250 g Mehl", "Kuchen")], "Einkaufsliste", stores);
    expect(out).toBe(
      "# Einkaufsliste\n\n## Markt\n- [ ] 750 g Mehl · Brot, Kuchen\n\n## Rewe\n- [ ] 1 l Milch · Brot\n",
    );
  });

  it("keeps a counted-up line above when no store fits", () => {
    const old = "# Einkaufsliste\n\n- [ ] 1 Zwiebel · Brot\n";
    expect(addToList(old, [itemFromLine("1 Zwiebel", "Suppe")], "Einkaufsliste", stores)).toBe(
      "# Einkaufsliste\n\n- [ ] 2 Zwiebel · Brot, Suppe\n",
    );
  });
});
