import { describe, expect, it } from "vitest";
import { planServings } from "../src/planServings";
import { readPlan, readPlanRows } from "../src/mealPlan";
import { applyPlanEdit } from "../src/planEdit";
import { readResult } from "../src/quantities";

const recipe = (text: string) => readResult(text);
const en = (count: number | undefined, unit: string | undefined, yieldText: string | undefined) =>
  planServings({ count, unit }, recipe(yieldText ?? ""), "en");
const de = (count: number | undefined, unit: string | undefined, yieldText: string | undefined) =>
  planServings({ count, unit }, recipe(yieldText ?? ""), "de");

describe("meal plan servings (#109)", () => {
  it("reads the unit written in the entry", () => {
    const plan = "## 2026-11-30 · Montag\n- [[Banana Bread]] · 8 servings\n- [[Brot]] · 2\n- [[Suppe]]\n";
    expect(readPlan(plan)[0].entries).toEqual([
      { target: "Banana Bread", servings: 8, unit: "servings" },
      { target: "Brot", servings: 2 },
      { target: "Suppe" },
    ]);
    expect(readPlanRows(plan).map((r) => r.unit)).toEqual(["servings", undefined, undefined]);
  });

  it("shows the unit of the entry, factor 1 against a concrete unit of the recipe", () => {
    expect(en(8, "servings", "1 loaf")).toEqual({ text: "8 servings", factor: 1 });
    expect(de(4, "Portionen", "1 Zopf")).toEqual({ text: "4 Portionen", factor: 1 });
  });

  it("a bare number or none takes the unit of the recipe", () => {
    expect(en(2, undefined, "1 loaf")).toEqual({ text: "2 loaves", factor: 2 });
    expect(en(undefined, undefined, "1 loaf")).toEqual({ text: "1 loaf", factor: 1 });
    expect(de(6, undefined, "4 Portionen")).toEqual({ text: "6 Portionen", factor: 1.5 });
    expect(en(undefined, undefined, undefined)).toEqual({ text: "", factor: 1 });
  });

  it("scales by number when the units are the same or both generic", () => {
    expect(de(4, "Portionen", "4 Portionen")).toEqual({ text: "4 Portionen", factor: 1 });
    expect(de(6, "Portionen", "4 Portionen")).toEqual({ text: "6 Portionen", factor: 1.5 });
    expect(en(6, "servings", "4 Portionen").factor).toBe(1.5);
    expect(en(8, "servings", "4").factor).toBe(2);
    expect(en(2, "loaves", "1 loaf")).toEqual({ text: "2 loaves", factor: 2 });
    expect(en(3, "Rolls", "6 roll").factor).toBe(0.5);
  });

  it("a concrete unit against a generic or another concrete one is the recipe as written", () => {
    expect(de(2, "Brötchen", "4 Portionen").factor).toBe(1);
    expect(de(2, "Brötchen", "6 Zöpfe").factor).toBe(1);
  });

  it("plural only where the plugin knows it, otherwise as written", () => {
    expect(en(3, undefined, "1 slice").text).toBe("3 slices");
    expect(en(3, undefined, "1 roll").text).toBe("3 rolls");
    expect(en(1, undefined, "4 loaf").text).toBe("1 loaf");
    expect(de(3, undefined, "1 Zopf").text).toBe("3 Zopf");
  });

  it("plus and minus change only the number of the entry", () => {
    const raw = "- [[Banana Bread]] · 8 servings";
    const text = `## 2026-11-30 · Montag\n${raw}\n`;
    const out = applyPlanEdit(text, { kind: "servings", date: "2026-11-30", raw, nth: 0, count: 9 }, "Meal plan", "en");
    expect(out).toContain("- [[Banana Bread]] · 9 servings");
  });
});
