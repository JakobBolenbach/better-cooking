import { describe, expect, it } from "vitest";
import { markMade, undoMade } from "../src/madeUndo";
import { FIELD_PRESETS } from "../src/noteFormat";

const fields = FIELD_PRESETS.en;

describe("markMade / undoMade (issue #45)", () => {
  it("writes today and restores the previous values", () => {
    const fm: Record<string, unknown> = { last_made: "2026-11-20", updated: "2026-11-21", rating: 4 };
    const token = markMade(fm, fields, "2026-11-26");
    expect(fm).toEqual({ last_made: "2026-11-26", updated: "2026-11-26", rating: 4 });
    expect(undoMade(fm, token)).toBe(true);
    expect(fm).toEqual({ last_made: "2026-11-20", updated: "2026-11-21", rating: 4 });
  });

  it("writes an empty template line back as empty, not as a missing or filled field", () => {
    const fm: Record<string, unknown> = { last_made: null, updated: null };
    const token = markMade(fm, fields, "2026-11-26");
    expect(undoMade(fm, token)).toBe(true);
    expect(fm.last_made).toBeNull();
    expect(Object.keys(fm)).toEqual(["last_made", "updated"]);
    expect(fm.updated).toBeNull();
  });

  it("removes only what the click created", () => {
    const fm: Record<string, unknown> = { rating: 3 };
    const token = markMade(fm, fields, "2026-11-26");
    expect(undoMade(fm, token)).toBe(true);
    expect(fm).toEqual({ rating: 3 });
  });

  it("uses the name the note already has", () => {
    const fm: Record<string, unknown> = { zuletzt_gemacht: "2026-11-20" };
    const token = markMade(fm, fields, "2026-11-26");
    expect(fm.zuletzt_gemacht).toBe("2026-11-26");
    expect(undoMade(fm, token)).toBe(true);
    expect(fm.zuletzt_gemacht).toBe("2026-11-20");
  });

  it("does nothing when the note was changed in the meantime", () => {
    const fm: Record<string, unknown> = { last_made: "2026-11-20", updated: "2026-11-21" };
    const token = markMade(fm, fields, "2026-11-26");
    fm.last_made = "2026-11-25"; // edited by the user or another device
    expect(undoMade(fm, token)).toBe(false);
    expect(fm.last_made).toBe("2026-11-25");
    expect(fm.updated).toBe("2026-11-26");
  });

  it("leaves `updated` alone when someone else set it", () => {
    const fm: Record<string, unknown> = { last_made: "2026-11-20", updated: "2026-11-21" };
    const token = markMade(fm, fields, "2026-11-26");
    fm.updated = "2026-11-27";
    expect(undoMade(fm, token)).toBe(true);
    expect(fm.last_made).toBe("2026-11-20");
    expect(fm.updated).toBe("2026-11-27");
  });
});
