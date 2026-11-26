import { describe, expect, it } from "vitest";
import {
  countListEntries,
  defaultListPath,
  defaultMatches,
  resolveListNote,
  pinConflict,
  type ListFile,
} from "../src/listNoteResolve";

const f = (path: string, entries: number, mtime = 1): ListFile => ({ path, entries, mtime });
const PLAN = "## 2026-11-30 · Montag\n- [[Zopf]] · 4 Portionen\n";
const LIST = "# Einkaufsliste\n\n- [ ] 200 g Mehl\n";

describe("default list note names", () => {
  it("per language, and found whatever the case of the file name", () => {
    expect(defaultListPath("de", "mealPlan")).toBe("Wochenplan.md");
    expect(defaultListPath("en", "shoppingList")).toBe("Shopping list.md");
    expect(defaultMatches(["wochenplan.MD", "Meal plan.md", "Plan.md", "Sub/Wochenplan.md"], "mealPlan")).toEqual([
      "wochenplan.MD",
      "Meal plan.md",
    ]);
  });
});

describe("resolveListNote", () => {
  it("uses a path set by the user as it is", () => {
    expect(resolveListNote("Listen/Plan", "mealPlan", "en", [f("Wochenplan.md", 3)]).path).toBe("Listen/Plan.md");
  });

  it("without any note: the default of the current note language, not existing", () => {
    expect(resolveListNote("", "mealPlan", "en", [])).toEqual({ path: "Meal plan.md" });
    expect(resolveListNote("", "shoppingList", "de", []).path).toBe("Einkaufsliste.md");
  });

  it("keeps the German plan after the note language changed (#76)", () => {
    for (const lang of ["de", "en"] as const)
      expect(resolveListNote("", "mealPlan", lang, [f("Wochenplan.md", 3)])).toEqual({ path: "Wochenplan.md" });
  });

  it("a file that shows up later is taken into account at once", () => {
    expect(resolveListNote("", "shoppingList", "en", []).path).toBe("Shopping list.md");
    expect(resolveListNote("", "shoppingList", "en", [f("Einkaufsliste.md", 2)]).path).toBe("Einkaufsliste.md");
  });

  it("a note with another case keeps its spelling", () => {
    expect(resolveListNote("", "mealPlan", "de", [f("wochenplan.md", 1)]).path).toBe("wochenplan.md");
  });

  it("two notes: the one with entries wins over an empty one", () => {
    const found = [f("Wochenplan.md", 3), f("Meal plan.md", 0)];
    expect(resolveListNote("", "mealPlan", "en", found)).toEqual({ path: "Wochenplan.md" });
    expect(resolveListNote("", "mealPlan", "de", [f("Wochenplan.md", 0), f("Meal plan.md", 2)]).path).toBe(
      "Meal plan.md",
    );
  });

  it("two notes with entries: the one with more, then the newer; all are reported", () => {
    const r = resolveListNote("", "mealPlan", "de", [f("Wochenplan.md", 1), f("Meal plan.md", 3)]);
    expect(r.path).toBe("Meal plan.md");
    expect(r.conflict?.map((x) => x.path)).toEqual(["Meal plan.md", "Wochenplan.md"]);
    const tie = resolveListNote("", "mealPlan", "de", [f("Wochenplan.md", 2, 5), f("Meal plan.md", 2, 9)]);
    expect(tie.path).toBe("Meal plan.md");
  });

  it("the user's choice is a stored path and ends the conflict", () => {
    const found = [f("Wochenplan.md", 1), f("Meal plan.md", 3)];
    expect(resolveListNote("Wochenplan.md", "mealPlan", "de", found).conflict).toBeUndefined();
    expect(resolveListNote("Wochenplan.md", "mealPlan", "de", found).path).toBe("Wochenplan.md");
  });

  it("both empty: the current language's note, no conflict", () => {
    const r = resolveListNote("", "shoppingList", "en", [f("Einkaufsliste.md", 0), f("Shopping list.md", 0)]);
    expect(r).toEqual({ path: "Shopping list.md" });
  });
});

describe("countListEntries", () => {
  it("counts checkbox lines and plan entries only", () => {
    expect(countListEntries("shoppingList", LIST)).toBe(1);
    expect(countListEntries("shoppingList", "# Einkaufsliste\n\nText\n")).toBe(0);
    expect(countListEntries("mealPlan", PLAN)).toBe(1);
    expect(countListEntries("mealPlan", "# Wochenplan\n\n## 2026-11-30 · Montag\n")).toBe(0);
  });
});

describe("not counted yet", () => {
  it("is not 0: the note of the language is used and no conflict is reported", () => {
    const unknown: ListFile = { path: "Wochenplan.md", mtime: 1 };
    expect(resolveListNote("", "mealPlan", "en", [unknown, f("Meal plan.md", 0)])).toEqual({ path: "Meal plan.md" });
    expect(resolveListNote("", "mealPlan", "de", [unknown, f("Meal plan.md", 5)])).toEqual({ path: "Wochenplan.md" });
  });
});

describe("the provisional choice in a conflict", () => {
  const r = (a: number, b: number) =>
    resolveListNote("", "mealPlan", "de", [f("Wochenplan.md", a), f("Meal plan.md", b)]);

  it("is kept while the conflict lasts, also when the notes' entries change", () => {
    const first = pinConflict(r(1, 3), undefined);
    expect(first.choice.path).toBe("Meal plan.md");
    // An edit through the page removes entries from the used note: it would flip, the pin holds.
    const later = pinConflict(r(2, 1), first.pin);
    expect(later.choice.path).toBe("Meal plan.md");
    expect(later.choice.conflict?.map((x) => x.path)).toEqual(["Meal plan.md", "Wochenplan.md"]);
  });

  it("ends with the conflict", () => {
    expect(pinConflict(r(2, 0), "Meal plan.md")).toEqual({ choice: { path: "Wochenplan.md" }, pin: undefined });
  });
});
