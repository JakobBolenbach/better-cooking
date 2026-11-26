import { describe, expect, it } from "vitest";
import { CLOSED_BY_PAGE_CHANGE, pendingGoTo } from "../src/ui/pages";
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
