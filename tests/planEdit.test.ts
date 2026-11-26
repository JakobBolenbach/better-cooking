import { beforeEach, describe, expect, it } from "vitest";
import { applyPlanEdit, readPlanRows } from "../src/planEdit";
import { addDays } from "../src/mealPlan";
import { setLanguage } from "../src/i18n";

beforeEach(() => setLanguage("de"));

const PLAN = `# Wochenplan

## 2026-11-30 · Montag
- [[Linsensuppe]] · 4 Portionen
- [[Brot]]

## 2026-12-02 · Mittwoch
- [[Pizza]] · 2
  ohne Oliven

## Ideen
- [[Kuchen]]
`;
const edit = (e: Parameters<typeof applyPlanEdit>[1], text = PLAN) => applyPlanEdit(text, e, "Wochenplan");

describe("days", () => {
  it("counts back and forth across months", () => {
    expect(addDays("2026-12-02", -3)).toBe("2026-11-29");
    expect(addDays("2026-11-29", 7)).toBe("2026-12-06");
  });
});

describe("reading rows", () => {
  it("lists entries under day headings with their line, ignores other sections", () => {
    expect(readPlanRows(PLAN)).toEqual([
      { date: "2026-11-30", raw: "- [[Linsensuppe]] · 4 Portionen", target: "Linsensuppe", servings: 4 },
      { date: "2026-11-30", raw: "- [[Brot]]", target: "Brot" },
      { date: "2026-12-02", raw: "- [[Pizza]] · 2", target: "Pizza", servings: 2 },
    ]);
  });
});

describe("editing", () => {
  it("changes the servings and keeps the unit", () => {
    const out = edit({ kind: "servings", date: "2026-11-30", raw: "- [[Linsensuppe]] · 4 Portionen", count: 6 });
    expect(out).toBe(PLAN.replace("4 Portionen", "6 Portionen"));
  });

  it("adds servings to an entry without any", () => {
    expect(edit({ kind: "servings", date: "2026-11-30", raw: "- [[Brot]]", count: 3 })).toBe(
      PLAN.replace("- [[Brot]]", "- [[Brot]] · 3"),
    );
  });

  it("removes an entry and its note lines, the day stays while it has entries", () => {
    const out = edit({ kind: "remove", date: "2026-11-30", raw: "- [[Brot]]" });
    expect(out).toBe(PLAN.replace("- [[Brot]]\n", ""));
  });

  it("removes the heading of a day that is empty afterwards", () => {
    const out = edit({ kind: "remove", date: "2026-12-02", raw: "- [[Pizza]] · 2" });
    expect(out).not.toContain("2026-12-02");
    expect(out).not.toContain("ohne Oliven");
    expect(out).toContain("## Ideen\n- [[Kuchen]]");
  });

  it("moves an entry to a day with a heading, to a new day in date order, and not onto itself", () => {
    const toExisting = edit({ kind: "move", date: "2026-11-30", raw: "- [[Brot]]", to: "2026-12-02" });
    expect(toExisting).toContain("## 2026-12-02 · Mittwoch\n- [[Pizza]] · 2\n  ohne Oliven\n- [[Brot]]");
    expect(toExisting).not.toContain("- [[Brot]]\n\n## 2026-12-02");
    const toNew = edit({ kind: "move", date: "2026-12-02", raw: "- [[Pizza]] · 2", to: "2026-12-01" });
    expect(toNew.indexOf("2026-11-30")).toBeLessThan(toNew.indexOf("2026-12-01"));
    expect(toNew).toContain("## 2026-12-01 · Dienstag\n- [[Pizza]] · 2\n  ohne Oliven");
    expect(edit({ kind: "move", date: "2026-11-30", raw: "- [[Brot]]", to: "2026-11-30" })).toBe(PLAN);
  });

  it("does nothing when the entry is gone or on another day", () => {
    expect(edit({ kind: "remove", date: "2026-11-30", raw: "- [[Nope]]" })).toBe(PLAN);
    expect(edit({ kind: "remove", date: "2026-12-02", raw: "- [[Brot]]" })).toBe(PLAN);
    expect(edit({ kind: "remove", date: "2026-12-09", raw: "- [[Brot]]" })).toBe(PLAN);
  });
});
