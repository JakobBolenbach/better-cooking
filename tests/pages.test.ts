import { describe, expect, it } from "vitest";
import { CLOSED_BY_PAGE_CHANGE, blocksPageChange, pendingGoTo } from "../src/ui/pages";
import { ESCAPE_ORDER } from "../src/ui/keyboard";

describe("changing the page", () => {
  it("closes every layer that lies above a page, so a new layer must be listed", () => {
    // "page" is the page itself; "dialog" belongs to the recipe and goes with it.
    const above = ESCAPE_ORDER.filter((l) => l !== "page" && l !== "dialog");
    expect([...CLOSED_BY_PAGE_CHANGE].sort()).toEqual([...above].sort());
  });
});

describe("a request to show a page", () => {
  it("counts once", () => {
    expect(pendingGoTo(0, { page: "shopping", id: 1 })).toBe("shopping");
    expect(pendingGoTo(1, { page: "shopping", id: 1 })).toBeNull();
    expect(pendingGoTo(1, { page: "plan", id: 2 })).toBe("plan");
  });
  it("is nothing without a request", () => {
    expect(pendingGoTo(0, undefined)).toBeNull();
  });
});

describe("dialogs and a page change", () => {
  const none = { attempt: { open: false, recipeExists: false, dirty: false }, import: { open: false, dirty: false } };
  it("blocks only for a dialog with text of the user's", () => {
    expect(blocksPageChange(none)).toBe(false);
    expect(blocksPageChange({ ...none, attempt: { open: true, recipeExists: true, dirty: false } })).toBe(false);
    expect(blocksPageChange({ ...none, attempt: { open: true, recipeExists: true, dirty: true } })).toBe(true);
    expect(blocksPageChange({ ...none, import: { open: true, dirty: false } })).toBe(false);
    expect(blocksPageChange({ ...none, import: { open: true, dirty: true } })).toBe(true);
  });
  it("ignores an attempt dialog whose recipe is gone", () => {
    expect(blocksPageChange({ ...none, attempt: { open: true, recipeExists: false, dirty: true } })).toBe(false);
  });
});
