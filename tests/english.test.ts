import { beforeEach, describe, expect, it } from "vitest";
import { formatQuantity, scaleLine, splitQuantity } from "../src/quantities";
import { durationText, findTimes } from "../src/cooking";
import { addToList, itemFromLine } from "../src/shopping";
import { setLanguage } from "../src/i18n";
import { readFileSync, readdirSync } from "node:fs";
import { parseRecipe } from "../src/parse";
import { makeNoteFormat } from "../src/noteFormat";
import { checkImportedNote } from "../src/importCheck";
import { itemsFromRecipe } from "../src/shopping";

beforeEach(() => setLanguage("en"));
const text = (parts: { text: string }[]) => parts.map((t) => t.text).join("");

describe("English recipes", () => {
  it("finds durations as timers", () => {
    const t = findTimes("Bake for 25 minutes, rest 1 hour, simmer 10 to 15 mins and stir for 30 seconds.");
    expect(t.map((x) => [x.text, x.seconds, x.untilSeconds])).toEqual([
      ["25 minutes", 1500, undefined],
      ["1 hour", 3600, undefined],
      ["10 to 15 mins", 600, 900],
      ["30 seconds", 30, undefined],
    ]);
    expect(findTimes("about 2 hrs").map((x) => x.seconds)).toEqual([7200]);
  });

  it("names durations in the interface language", () => {
    expect(durationText(45)).toBe("45 s");
    expect(durationText(600)).toBe("10 min");
    expect(durationText(5400)).toBe("1 h 30 min");
    setLanguage("de");
    expect(durationText(5400)).toBe("1 Std. 30 Min.");
  });

  it("knows cups, spoons, ounces and pounds", () => {
    expect(splitQuantity("1 ½ cups flour")).toEqual({ amount: 1.5, unit: "cups", rest: "flour" });
    expect(splitQuantity("2 tbsp olive oil")).toEqual({ amount: 2, unit: "tbsp", rest: "olive oil" });
    expect(text(scaleLine("¾ cup sugar", 2))).toBe("1 ½ cup sugar");
    expect(text(scaleLine("2 to 3 cloves garlic", 2))).toBe("4 to 6 cloves garlic");
    expect(formatQuantity(1.5, "cups")).toBe("1 ½");
  });

  it("merges English units on the shopping list", () => {
    const out = addToList(
      "- [ ] 1 cup milk\n- [ ] 8 oz pasta\n",
      [itemFromLine("½ cup milk", "A"), itemFromLine("1 lb pasta", "B"), itemFromLine("2 tbsp butter", "C")],
      "x",
    );
    expect(out).toBe("- [ ] 1 ½ cup milk · A\n- [ ] 24 oz pasta · B\n- [ ] 2 tbsp butter · C\n");
  });
});

describe("English example recipes", () => {
  const dir = new URL("./fixtures/en/", import.meta.url);
  const fields = makeNoteFormat("en").format.fields;
  const recipes = readdirSync(dir).map((f) =>
    parseRecipe(`Recipes/${f}`, readFileSync(new URL(f, dir), "utf8"), 1, fields),
  );

  it("are read completely", () => {
    expect(recipes).toHaveLength(5);
    for (const r of recipes) {
      expect(r.ingredients.length, r.name).toBeGreaterThan(0);
      expect(r.steps.length, r.name).toBeGreaterThan(0);
      expect(r.description, r.name).toMatch(/Example recipe/);
      expect(r.findings, r.name).toBeUndefined();
    }
    const pasta = recipes.find((r) => r.title === "Weeknight Tomato Pasta")!;
    expect(pasta).toMatchObject({ status: "bewaehrt", category: "Main course", rating: 4, timeTotal: 30 });
    expect(pasta.servings).toEqual({ count: 4, unit: "servings" });
    expect(pasta.attempts[0]).toEqual({
      date: "20.11.2026",
      lines: ["Changed: more garlic", "Result: even better", "Rating: 4/5"],
    });
    expect(recipes.find((r) => r.title === "Banana Bread")!.status).toBe("ausprobieren");
  });

  it("have timers in their steps", () => {
    const soup = recipes.find((r) => r.title === "Red Lentil Soup")!;
    expect(soup.steps.flatMap((s) => findTimes(s.text).map((t) => t.text))).toEqual([
      "8 minutes",
      "30 seconds",
      "20 to 25 minutes",
    ]);
  });

  it("leave equipment off the shopping list", () => {
    const bread = recipes.find((r) => r.title === "Banana Bread")!;
    const names = itemsFromRecipe(bread.title, bread.ingredients).map((i) => i.name);
    expect(names).toContain("walnuts");
    expect(names).not.toContain("Parchment paper");
  });

  it("contain nothing other plugins would run", () => {
    for (const f of readdirSync(dir)) expect(checkImportedNote(readFileSync(new URL(f, dir), "utf8")), f).toEqual([]);
  });
});
