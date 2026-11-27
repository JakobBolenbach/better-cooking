import { describe, expect, it } from "vitest";
import { planServings } from "../src/planServings";
import { readResult } from "../src/quantities";
import { servingsUnitText } from "../src/servingsWords";
import { applyPlanEdit } from "../src/planEdit";

const plan = (lang: "en" | "de") => (count: number | undefined, unit: string | undefined, yieldText: string) =>
  planServings({ count, unit }, readResult(yieldText), lang);
const en = plan("en");
const de = plan("de");

describe("meal plan servings (#109)", () => {
  it("shows the unit of the entry, factor 1 against a concrete unit of the recipe", () => {
    expect(en(8, "servings", "1 loaf")).toMatchObject({
      text: "8 servings",
      factor: 1,
      mismatch: true,
      asWritten: "1 loaf",
    });
    expect(de(4, "Portionen", "1 Zopf")).toMatchObject({ text: "4 Portionen", factor: 1, mismatch: true });
  });

  it("a concrete entry against generic servings is the recipe as written too", () => {
    expect(de(2, "Brötchen", "4 Portionen")).toMatchObject({ text: "2 Brötchen", factor: 1, mismatch: true });
    expect(de(4, "Portionen", "24 Stück")).toMatchObject({ factor: 1, mismatch: true });
    expect(de(24, "Stück", "4 Portionen")).toMatchObject({ factor: 1, mismatch: true });
  });

  it("a bare number or none takes the unit of the recipe", () => {
    expect(en(2, undefined, "1 loaf")).toMatchObject({ text: "2 loaves", factor: 2, mismatch: false });
    expect(en(undefined, undefined, "1 loaf")).toMatchObject({ text: "1 loaf", factor: 1 });
    expect(de(6, undefined, "4 Portionen")).toMatchObject({ text: "6 Portionen", factor: 1.5 });
    expect(en(undefined, undefined, "")).toMatchObject({ text: "", factor: 1 });
  });

  it("scales by number in every other case, as on main", () => {
    expect(de(4, "Portionen", "4 Portionen").factor).toBe(1);
    expect(de(6, "Portionen", "4 Portionen").factor).toBe(1.5);
    expect(de(8, "Portionen (Gäste)", "4 Portionen")).toMatchObject({ text: "8 Portionen (Gäste)", factor: 2 });
    expect(en(6, "servings", "4 Portionen").factor).toBe(1.5);
    expect(en(8, "servings", "4").factor).toBe(2);
    expect(de(2, "Zöpfe", "1 Zopf").factor).toBe(2);
    expect(en(2, "cakes", "1 cake").factor).toBe(2);
    expect(en(2, "loaves", "1 loaf (about 10 slices)")).toMatchObject({ text: "2 loaves", factor: 2 });
    expect(en(12, "pieces", "24 Stück").factor).toBe(0.5);
    expect(de(6, "Pers.", "4 Port.").factor).toBe(1.5);
    expect(en(4, "portions", "2 servings").factor).toBe(2);
  });

  it("a range is passed on", () => {
    expect(planServings({ count: 4, countTo: 6, unit: "servings" }, readResult("1 loaf"), "en").text).toBe(
      "4 to 6 servings",
    );
  });

  it("plus and minus change only the number of the entry", () => {
    const raw = "- [[Banana Bread]] · 8 servings";
    const text = `## 2026-11-30 · Montag\n${raw}\n`;
    const edit = { kind: "servings", date: "2026-11-30", raw, nth: 0, count: 9 } as const;
    expect(applyPlanEdit(text, edit, "Meal plan", "en")).toContain("- [[Banana Bread]] · 9 servings");
  });
});

describe("plural of a yield unit", () => {
  it("uses the table for a number other than 1, ignoring letter case, and keeps the rest as written", () => {
    const t = (u: string, n: number) => servingsUnitText(u, n, "en");
    expect(t("loaf", 2)).toBe("loaves");
    expect(t("Loaf", 2)).toBe("Loaves");
    expect(t("loaf", 1)).toBe("loaf");
    expect(t("roll", 3)).toBe("rolls");
    expect(t("slice", 3)).toBe("slices");
    expect(t("Zopf", 3)).toBe("Zöpfe");
    expect(t("Brot", 2)).toBe("Brote");
    expect(t("Blech", 2)).toBe("Bleche");
    expect(t("Kuchen", 2)).toBe("Kuchen");
    expect(t("cookie", 2)).toBe("cookies");
    expect(t("Brötchen", 5)).toBe("Brötchen");
    expect(t("loaves", 2)).toBe("loaves");
    expect(t("tray", 0.5)).toBe("trays");
  });
});
