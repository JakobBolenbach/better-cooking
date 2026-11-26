import { describe, expect, it } from "vitest";
import { addToList, itemFromLine, itemLine, itemsFromRecipe, readItemLine, removeChecked } from "../src/shopping";
import { splitQuantity } from "../src/quantities";

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
