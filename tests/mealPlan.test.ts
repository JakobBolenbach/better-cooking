import { beforeEach, describe, expect, it } from "vitest";
import {
  addToPlan as addToPlanIn,
  days,
  entryLine as entryLineIn,
  planIcs,
  plannedFrom,
  readPlan,
} from "../src/mealPlan";
import { setLanguage } from "../src/i18n";

const addToPlan = (text: string, date: string, line: string, title: string) =>
  addToPlanIn(text, date, line, title, "de");
const entryLine = (target: string, servings?: number, unit?: string) => entryLineIn(target, servings, unit, "de");

beforeEach(() => setLanguage("de"));

describe("meal plan", () => {
  it("counts days across months", () => {
    expect(days("2026-11-29", 4)).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
  });

  it("starts a plan and keeps the days in order", () => {
    let t = addToPlan("", "2026-12-02", entryLine("Linsensuppe", 4, "Portionen"), "Wochenplan");
    t = addToPlan(t, "2026-11-30", entryLine("Pfannkuchen"), "x");
    t = addToPlan(t, "2026-12-02", entryLine("Brot"), "x");
    t = addToPlan(t, "2026-12-05", entryLine("Pizza", 2), "x");
    expect(t).toBe(
      [
        "# Wochenplan",
        "",
        "## 2026-11-30 · Montag",
        "- [[Pfannkuchen]]",
        "",
        "## 2026-12-02 · Mittwoch",
        "- [[Linsensuppe]] · 4 Portionen",
        "- [[Brot]]",
        "",
        "## 2026-12-05 · Samstag",
        "- [[Pizza]] · 2",
        "",
      ].join("\n"),
    );
  });

  it("names days in the language of the note", () => {
    setLanguage("en");
    expect(addToPlanIn("", "2026-11-30", entryLine("Soup"), "Meal plan", "en")).toContain("## 2026-11-30 · Monday");
  });

  it("reads entries with servings, aliases and checkboxes and ignores other sections", () => {
    const plan = readPlan(
      [
        "# Wochenplan",
        "Notiz",
        "## 2026-11-30 · Montag",
        "- [[Linsensuppe]] · 4 Portionen",
        "- [ ] [[Brot|Sauerteigbrot]]",
        "- Reste essen",
        "## Ideen",
        "- [[Pizza]]",
      ].join("\n"),
    );
    expect(plan).toEqual([
      {
        date: "2026-11-30",
        entries: [{ target: "Linsensuppe", servings: 4 }, { target: "Brot" }],
      },
    ]);
  });

  it("collects the next days", () => {
    const plan = readPlan("## 2026-11-29 · x\n- [[A]]\n## 2026-11-30 · x\n- [[B]]\n## 2026-12-07 · x\n- [[C]]\n");
    expect(plannedFrom(plan, "2026-11-30").map((e) => e.target)).toEqual(["B"]);
  });

  it("exports all-day events", () => {
    const ics = planIcs(readPlan("## 2026-11-30 · x\n- [[Suppe, scharf]]\n"), "20261126T080000Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261130\r\nDTEND;VALUE=DATE:20261201\r\nSUMMARY:Suppe\\, scharf");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });
});
