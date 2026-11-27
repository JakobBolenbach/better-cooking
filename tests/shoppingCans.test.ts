// Shopping list: cans keep their unit and size (#117).
import { describe, expect, it } from "vitest";
import { splitQuantity } from "../src/quantities";
import { addToList, itemFromLine, itemLine, readItemLine } from "../src/shopping";
import { applyShoppingEdit } from "../src/shoppingEdit";

const line = (l: string, lang: "en" | "de" = "en") =>
  itemLine(itemFromLine(l, undefined), lang).replace(/^- \[ \] /, "");

describe("cans on the shopping list (#117)", () => {
  it("keeps the can and its size, whichever way it is written", () => {
    expect(line("1 (14 oz) can crushed tomatoes")).toBe("1 can crushed tomatoes (14 oz)");
    expect(line("1 can (14 oz) crushed tomatoes")).toBe("1 can crushed tomatoes (14 oz)");
    expect(line("2 (14.5 oz) cans diced tomatoes")).toBe("2 cans diced tomatoes (14.5 oz)");
  });

  it("keeps Dose and size in German, without the lead word", () => {
    expect(line("1 Dose (400 g) Tomaten", "de")).toBe("1 Dose Tomaten (400 g)");
    expect(line("2 Dosen (à 400 g) Tomaten", "de")).toBe("2 Dosen Tomaten (400 g)");
    expect(line("1 (400 g) Dose Tomaten", "de")).toBe("1 Dose Tomaten (400 g)");
  });

  it("leaves a line without size and other units as they were", () => {
    expect(line("1 can crushed tomatoes")).toBe("1 can crushed tomatoes");
    expect(line("1 stick (113 g) butter")).toBe("1 stick butter");
  });

  it("reads its own line back", () => {
    const item = readItemLine("- [ ] 1 can crushed tomatoes (14 oz) · Pasta");
    expect(item).toMatchObject({ amount: 1, unit: "can", name: "crushed tomatoes (14 oz)" });
  });

  it("two recipes with one can each are two cans", () => {
    const a = addToList("", [itemFromLine("1 (14 oz) can crushed tomatoes", "A")], "List", [], "en");
    const b = addToList(a, [itemFromLine("1 (14 oz) can crushed tomatoes", "B")], "List", [], "en");
    expect(b).toContain("- [ ] 2 cans crushed tomatoes (14 oz) · A, B");
    expect(b.match(/crushed tomatoes/g)).toHaveLength(1);
  });

  it("a can of unknown size is its own line, whatever the order (A without size, B 14 oz, C 28 oz)", () => {
    const lines = {
      A: "1 can crushed tomatoes",
      B: "1 (14 oz) can crushed tomatoes",
      C: "1 (28 oz) can crushed tomatoes",
    };
    const run = (order: (keyof typeof lines)[]) => {
      let text = "";
      for (const k of order) text = addToList(text, [itemFromLine(lines[k], k)], "List", [], "en");
      return text
        .split("\n")
        .filter((l) => l.startsWith("- ["))
        .map((l) => l.replace(/ · .*/, ""))
        .sort();
    };
    const expected = [
      "- [ ] 1 can crushed tomatoes",
      "- [ ] 1 can crushed tomatoes (14 oz)",
      "- [ ] 1 can crushed tomatoes (28 oz)",
    ];
    for (const order of [
      ["A", "B", "C"],
      ["B", "A", "C"],
      ["C", "B", "A"],
      ["B", "C", "A"],
    ] as const)
      expect(run([...order])).toEqual(expected);
  });

  it("the same size is added up, also written differently in spacing and case", () => {
    let text = addToList("", [itemFromLine("1 (14 oz) can tomatoes", "A")], "List", [], "en");
    text = addToList(text, [itemFromLine("2 cans tomatoes (14OZ)", "B")], "List", [], "en");
    expect(text).toContain("- [ ] 3 cans tomatoes (14 oz) · A, B");
  });

  it('"14 oz" and "14-ounce" stay two lines (on purpose: two lines are better than one wrong line)', () => {
    let text = addToList("", [itemFromLine("1 (14 oz) can tomatoes", "A")], "List", [], "en");
    text = addToList(text, [itemFromLine("1 (14-ounce) can tomatoes", "B")], "List", [], "en");
    expect(text.match(/can tomatoes/g)).toHaveLength(2);
  });
});

describe("where the size is written (#117)", () => {
  it("at the end, with lead words à, je, each, ca.", () => {
    expect(line("2 Dosen Tomaten (à 400 g)", "de")).toBe("2 Dosen Tomaten (400 g)");
    expect(line("2 Dosen Tomaten (je 400 g)", "de")).toBe("2 Dosen Tomaten (400 g)");
    expect(line("2 Dosen (ca. 400 g) Tomaten", "de")).toBe("2 Dosen Tomaten (400 g)");
    expect(line("1 can tomatoes (14 oz)")).toBe("1 can tomatoes (14 oz)");
    expect(line("2 cans tomatoes (each 14 oz)")).toBe("2 cans tomatoes (14 oz)");
  });

  it("a note in brackets without a number is no size and does not hide the unit", () => {
    expect(line("2 (kleine) Dosen Mais", "de")).toBe("2 Dosen Mais");
    expect(line("1 (organic) can beans")).toBe("1 can beans");
  });

  it("Glas and Packung have sizes too", () => {
    expect(line("1 Glas (370 g) Rotkohl", "de")).toBe("1 Glas Rotkohl (370 g)");
    expect(line("2 Gläser (je 370 g) Rotkohl", "de")).toBe("2 Glas Rotkohl (370 g)");
    expect(line("1 Packung (500 g) Nudeln", "de")).toBe("1 Packung Nudeln (500 g)");
    expect(line("2 Packungen (500 g) Nudeln", "de")).toBe("2 Packungen Nudeln (500 g)");
    expect(line("1 (8 oz) package cream cheese")).toBe("1 package cream cheese (8 oz)");
  });

  it("a bracket in front of any unit does not hide it", () => {
    expect(line("1 (113 g) stick butter")).toBe("1 stick butter");
    expect(splitQuantity("1 (113 g) stick butter")).toEqual({
      amount: 1,
      unit: "stick",
      rest: "butter",
      lead: "113 g",
    });
    expect(splitQuantity("2 Zwiebeln")).toEqual({ amount: 2, unit: undefined, rest: "Zwiebeln" });
  });

  it("a half can keeps its size", () => {
    expect(itemLine(itemFromLine("1 Dose (400 g) Tomaten", "A", 0.5), "de")).toBe("- [ ] ½ Dose Tomaten (400 g) · A");
    expect(itemLine(itemFromLine("1 Dose (400 g) Tomaten", "A", 3), "de")).toBe("- [ ] 3 Dosen Tomaten (400 g) · A");
  });

  it("an own entry typed on the page is read the same way", () => {
    const text = applyShoppingEdit("# Liste\n", { kind: "add", text: "2 Dosen Tomaten (à 400 g)" }, "Liste", [], "de");
    expect(text).toContain("- [ ] 2 Dosen Tomaten (400 g)");
  });
});
