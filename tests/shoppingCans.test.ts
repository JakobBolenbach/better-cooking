// Shopping list: cans keep their unit and size (#117).
import { describe, expect, it } from "vitest";
import { addToList, itemFromLine, itemLine, readItemLine } from "../src/shopping";

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

  it("a can without size joins a can with one; cans of other sizes stay apart", () => {
    const a = addToList("", [itemFromLine("1 (14 oz) can crushed tomatoes", "A")], "List", [], "en");
    const same = addToList(a, [itemFromLine("1 can crushed tomatoes", "B")], "List", [], "en");
    expect(same).toContain("2 cans crushed tomatoes (14 oz)");
    const other = addToList(a, [itemFromLine("1 (28 oz) can crushed tomatoes", "B")], "List", [], "en");
    expect(other).toContain("1 can crushed tomatoes (14 oz)");
    expect(other).toContain("1 can crushed tomatoes (28 oz)");
  });
});
