import { beforeEach, describe, expect, it } from "vitest";
import { applyPlanEdit, type PlanEdit } from "../src/planEdit";
import { addDays, readPlan, readPlanRows, rowKey } from "../src/mealPlan";
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
const edit = (e: PlanEdit, text = PLAN) => applyPlanEdit(text, e, "Wochenplan");
const ref = (date: string, raw: string, nth = 0) => ({ date, raw, nth });

describe("days", () => {
  it("counts back and forth across months", () => {
    expect(addDays("2026-12-02", -3)).toBe("2026-11-29");
    expect(addDays("2026-11-29", 7)).toBe("2026-12-06");
  });
});

describe("reading rows", () => {
  it("lists entries under day headings with their line and hanging lines, ignores other sections", () => {
    expect(readPlanRows(PLAN)).toEqual([
      {
        date: "2026-11-30",
        raw: "- [[Linsensuppe]] · 4 Portionen",
        nth: 0,
        target: "Linsensuppe",
        servings: 4,
        hanging: [],
      },
      { date: "2026-11-30", raw: "- [[Brot]]", nth: 0, target: "Brot", hanging: [] },
      { date: "2026-12-02", raw: "- [[Pizza]] · 2", nth: 0, target: "Pizza", servings: 2, hanging: ["  ohne Oliven"] },
    ]);
  });

  it("numbers identical lines of a day, also across two headings of that day", () => {
    const text = "## 2026-11-30\n- [[A]]\n\n## 2026-11-30 · Montag\n- [[A]]\n";
    const rows = readPlanRows(text);
    expect(rows.map((r) => r.nth)).toEqual([0, 1]);
    expect(new Set(rows.map(rowKey)).size).toBe(2);
    expect(readPlan(text)).toEqual([{ date: "2026-11-30", entries: [{ target: "A" }, { target: "A" }] }]);
  });

  it("keeps the folder of a link target", () => {
    expect(readPlanRows("## 2026-11-30\n- [[Rezepte/Brot|das Brot]] · 2\n")[0].target).toBe("Rezepte/Brot");
  });
});

describe("servings", () => {
  const set = (line: string, count: number) =>
    edit({ kind: "servings", ...ref("2026-11-30", line), count }, `## 2026-11-30\n${line}\n`).split("\n")[1];

  it("changes only the amount and keeps unit, prefix and separator", () => {
    expect(set("- [[Suppe]] · 4 Portionen", 6)).toBe("- [[Suppe]] · 6 Portionen");
    expect(set("- [[Suppe]] · ca. 4 Portionen", 6)).toBe("- [[Suppe]] · ca. 6 Portionen");
    expect(set("- [[Suppe]] · für 4 Personen", 2)).toBe("- [[Suppe]] · für 2 Personen");
    expect(set("- [[Suppe]]: 4 Portionen", 2)).toBe("- [[Suppe]]: 2 Portionen");
    expect(set("- [[Suppe]] 4 Portionen", 2)).toBe("- [[Suppe]] 2 Portionen");
  });

  it("writes fractions and replaces a range or a mixed number by one amount", () => {
    expect(set("- [[Suppe]] · 4 Portionen", 1.5)).toBe("- [[Suppe]] · 1 ½ Portionen");
    expect(set("- [[Suppe]] · 4-6 Portionen", 5)).toBe("- [[Suppe]] · 5 Portionen");
    expect(set("- [[Suppe]] · 1 ½ Portionen", 2)).toBe("- [[Suppe]] · 2 Portionen");
    expect(set("- [[Suppe]] · ½ Zopf", 1)).toBe("- [[Suppe]] · 1 Zopf");
  });

  it("adds an amount to an entry without one", () => {
    expect(set("- [[Brot]]", 3)).toBe("- [[Brot]] · 3");
  });
});

describe("removing", () => {
  it("removes an entry and its hanging lines, the day stays while it has entries", () => {
    expect(edit({ kind: "remove", ...ref("2026-11-30", "- [[Brot]]") })).toBe(PLAN.replace("- [[Brot]]\n", ""));
  });

  it("removes the plugin's heading of a day that is empty afterwards", () => {
    const out = edit({ kind: "remove", ...ref("2026-12-02", "- [[Pizza]] · 2") });
    expect(out).not.toContain("2026-12-02");
    expect(out).not.toContain("ohne Oliven");
    expect(out).toContain("## Ideen\n- [[Kuchen]]");
  });

  it("keeps the lines of its neighbours and what the user wrote after an empty line", () => {
    const text = "## 2026-11-30\n- [[A]]\n  note\n- [[B]]\n\n  später\n";
    expect(edit({ kind: "remove", ...ref("2026-11-30", "- [[A]]") }, text)).toBe(
      "## 2026-11-30\n- [[B]]\n\n  später\n",
    );
    expect(edit({ kind: "remove", ...ref("2026-11-30", "- [[B]]") }, text)).toBe(
      "## 2026-11-30\n- [[A]]\n  note\n\n  später\n",
    );
  });

  it("does not take nested entries along", () => {
    const text = "## 2026-11-30\n- [[A]]\n  - [[B]]\n    note of B\n";
    expect(edit({ kind: "remove", ...ref("2026-11-30", "- [[A]]") }, text)).toBe(
      "## 2026-11-30\n  - [[B]]\n    note of B\n",
    );
  });

  it("never removes a heading with text of the user's or text below it", () => {
    const own = "## 2026-11-30 · Montag, Geburtstag\n- [[A]]\n";
    expect(edit({ kind: "remove", ...ref("2026-11-30", "- [[A]]") }, own)).toBe("## 2026-11-30 · Montag, Geburtstag\n");
    const below = "## 2026-11-30 · Montag\n- [[A]]\nEinladen nicht vergessen\n";
    expect(edit({ kind: "remove", ...ref("2026-11-30", "- [[A]]") }, below)).toBe(
      "## 2026-11-30 · Montag\nEinladen nicht vergessen\n",
    );
  });

  it("puts removed lines back after the entry that was above them, else at the end of the day", () => {
    const text = "## 2026-11-30\n- [[A]]\n  note of A\n- [[C]]\n";
    const lines = ["- [[B]]", "  note of B"];
    expect(edit({ kind: "restore", date: "2026-11-30", lines, after: { raw: "- [[A]]", nth: 0 } }, text)).toBe(
      "## 2026-11-30\n- [[A]]\n  note of A\n- [[B]]\n  note of B\n- [[C]]\n",
    );
    // The entry above is gone, or there was none: the end of the day.
    const end = "## 2026-11-30\n- [[A]]\n  note of A\n- [[C]]\n- [[B]]\n  note of B\n";
    expect(edit({ kind: "restore", date: "2026-11-30", lines, after: { raw: "- [[X]]", nth: 0 } }, text)).toBe(end);
    expect(edit({ kind: "restore", date: "2026-11-30", lines }, text)).toBe(end);
    // The day heading was removed with the last entry: it comes back.
    expect(edit({ kind: "restore", date: "2026-12-01", lines: ["- [[B]]"] }, text)).toContain(
      "## 2026-12-01 · Dienstag\n- [[B]]",
    );
  });

  it("puts removed lines back on their day", () => {
    const out = edit({ kind: "restore", date: "2026-11-30", lines: ["- [[Brot]]", "  warm"] });
    expect(out).toContain("- [[Linsensuppe]] · 4 Portionen\n- [[Brot]]\n- [[Brot]]\n  warm");
  });
});

describe("moving", () => {
  it("moves to a day with a heading and to a new day in date order, with the hanging lines", () => {
    const toExisting = edit({ kind: "move", ...ref("2026-11-30", "- [[Brot]]"), to: "2026-12-02" });
    expect(toExisting).toContain("## 2026-12-02 · Mittwoch\n- [[Pizza]] · 2\n  ohne Oliven\n- [[Brot]]");
    const toNew = edit({ kind: "move", ...ref("2026-12-02", "- [[Pizza]] · 2"), to: "2026-12-01" });
    expect(toNew).toContain("## 2026-12-01 · Dienstag\n- [[Pizza]] · 2\n  ohne Oliven");
    expect(toNew.indexOf("2026-11-30")).toBeLessThan(toNew.indexOf("2026-12-01"));
  });

  it("does nothing onto the same day", () => {
    expect(edit({ kind: "move", ...ref("2026-11-30", "- [[Brot]]"), to: "2026-11-30" })).toBe(PLAN);
  });
});

describe("identical entries and stale clicks", () => {
  const TWICE = "## 2026-11-30\n- [[A]]\n- [[B]]\n\n## 2026-11-30 · Montag\n- [[A]]\n";
  it("hits the one that was meant, in any section of the day", () => {
    expect(edit({ kind: "remove", ...ref("2026-11-30", "- [[A]]", 1) }, TWICE)).toBe(
      "## 2026-11-30\n- [[A]]\n- [[B]]\n",
    );
    expect(edit({ kind: "servings", ...ref("2026-11-30", "- [[A]]", 1), count: 2 }, TWICE)).toContain("- [[A]] · 2");
  });

  it("does nothing when the entry is gone or on another day, and returns the text as it was", () => {
    const crlf = "## 2026-11-30\r\n- [[A]]\r\n";
    expect(edit({ kind: "remove", ...ref("2026-11-30", "- [[Nope]]") }, crlf)).toBe(crlf);
    expect(edit({ kind: "remove", ...ref("2026-12-02", "- [[A]]") }, crlf)).toBe(crlf);
    expect(edit({ kind: "remove", ...ref("2026-11-30", "- [[A]]", 1) }, crlf)).toBe(crlf);
    expect(edit({ kind: "move", ...ref("2026-11-30", "- [[A]]"), to: "2026-11-30" }, crlf)).toBe(crlf);
    expect(edit({ kind: "restore", date: "2026-11-30", lines: [] }, crlf)).toBe(crlf);
  });

  it("keeps CRLF when it changes the note", () => {
    const crlf = "## 2026-11-30\r\n- [[A]] · 2\r\n- [[B]]\r\n";
    expect(edit({ kind: "servings", ...ref("2026-11-30", "- [[A]] · 2"), count: 3 }, crlf)).toBe(
      "## 2026-11-30\r\n- [[A]] · 3\r\n- [[B]]\r\n",
    );
    expect(edit({ kind: "remove", ...ref("2026-11-30", "- [[B]]") }, crlf)).toBe("## 2026-11-30\r\n- [[A]] · 2\r\n");
    const moved = edit({ kind: "move", ...ref("2026-11-30", "- [[B]]"), to: "2026-12-01" }, crlf);
    expect(moved).not.toMatch(/[^\r]\n/);
    expect(moved).toContain("- [[B]]");
  });
});
