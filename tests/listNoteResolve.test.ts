import { describe, expect, it } from "vitest";
import { defaultListPath, hasListEntries, resolveListNote } from "../src/listNoteResolve";

const files = (o: Record<string, string>) => (p: string) => o[p];
const PLAN = "## 2026-11-30 · Montag\n- [[Zopf]] · 4 Portionen\n";
const LIST = "# Einkaufsliste\n\n- [ ] 200 g Mehl\n";

describe("resolveListNote", () => {
  it("uses a path set by the user as it is", () => {
    expect(resolveListNote("Listen/Plan", "mealPlan", "en", files({}))).toEqual({
      path: "Listen/Plan.md",
      keep: true,
    });
  });

  it("without any note: the default of the current note language, nothing to keep", () => {
    expect(resolveListNote("", "mealPlan", "en", files({}))).toEqual({ path: "Meal plan.md", keep: false });
    expect(resolveListNote("", "shoppingList", "de", files({}))).toEqual({ path: "Einkaufsliste.md", keep: false });
  });

  it("keeps the German plan after the note language changed to English (#76)", () => {
    const r = resolveListNote("", "mealPlan", "en", files({ "Wochenplan.md": PLAN }));
    expect(r).toEqual({ path: "Wochenplan.md", keep: true });
  });

  it("keeps the English list after the note language changed to German", () => {
    expect(resolveListNote("", "shoppingList", "de", files({ "Shopping list.md": LIST })).path).toBe(
      "Shopping list.md",
    );
  });

  it("both exist: the one with entries wins over an empty one", () => {
    const r = resolveListNote("", "mealPlan", "en", files({ "Wochenplan.md": PLAN, "Meal plan.md": "# Meal plan\n" }));
    expect(r).toEqual({ path: "Wochenplan.md", keep: true });
    const r2 = resolveListNote("", "mealPlan", "de", files({ "Wochenplan.md": "", "Meal plan.md": PLAN }));
    expect(r2.path).toBe("Meal plan.md");
  });

  it("both have entries: the current language's note and a conflict with both names", () => {
    const f = files({ "Wochenplan.md": PLAN, "Meal plan.md": PLAN });
    expect(resolveListNote("", "mealPlan", "en", f)).toEqual({
      path: "Meal plan.md",
      keep: true,
      conflict: ["Meal plan.md", "Wochenplan.md"],
    });
    expect(resolveListNote("", "mealPlan", "de", f).path).toBe("Wochenplan.md");
  });

  it("both exist and are empty: the current language's note, no conflict", () => {
    const r = resolveListNote("", "shoppingList", "en", files({ "Einkaufsliste.md": "", "Shopping list.md": "" }));
    expect(r).toEqual({ path: "Shopping list.md", keep: true });
  });
});

describe("hasListEntries", () => {
  it("counts checkbox lines and plan entries only", () => {
    expect(hasListEntries("shoppingList", LIST)).toBe(true);
    expect(hasListEntries("shoppingList", "# Einkaufsliste\n\nText\n")).toBe(false);
    expect(hasListEntries("mealPlan", PLAN)).toBe(true);
    expect(hasListEntries("mealPlan", "# Wochenplan\n\n## 2026-11-30 · Montag\n")).toBe(false);
  });

  it("default paths per language", () => {
    expect(defaultListPath("de", "mealPlan")).toBe("Wochenplan.md");
    expect(defaultListPath("en", "shoppingList")).toBe("Shopping list.md");
  });
});
