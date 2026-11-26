import { describe, expect, it } from "vitest";
import { bottomClearance, bottomInset, keyboardOverlap, safeOverlap, scrollDelta } from "../src/bottomInset";

const view = { left: 0, right: 1000, top: 0, bottom: 800 };

describe("bottomInset", () => {
  it("keeps clear of a status bar that floats over the bottom right of the view (issue #45)", () => {
    const status = { left: 820, right: 990, top: 772, bottom: 796 };
    expect(bottomInset(view, [status])).toBe(36);
  });
  it("takes the largest overlap of several bars", () => {
    const a = { left: 0, right: 1000, top: 760, bottom: 800 };
    const b = { left: 800, right: 1000, top: 772, bottom: 796 };
    expect(bottomInset(view, [a, b])).toBe(48);
  });
  it("ignores bars that do not cover the view and hidden bars", () => {
    expect(bottomInset(view, [])).toBe(0);
    expect(bottomInset(view, [{ left: 1010, right: 1200, top: 772, bottom: 796 }])).toBe(0); // under a sidebar
    expect(bottomInset(view, [{ left: 0, right: 1000, top: 800, bottom: 824 }])).toBe(0); // below the view
    expect(bottomInset(view, [{ left: 0, right: 100, top: 0, bottom: 0 }])).toBe(0); // display: none
  });
});

describe("bottomClearance (issue #56)", () => {
  const phone = { left: 0, right: 390, top: 95, bottom: 844 }; // view under the header, down to the screen edge
  const navbar = { left: 12, right: 378, top: 758, bottom: 822 }; // floating bar above the home indicator
  const base = { view: phone, viewportHeight: 844, safe: 34 };

  it("takes the floating bar, which already lies over the home indicator, without adding the safe area", () => {
    expect(bottomClearance({ ...base, bars: [navbar] })).toEqual({ unten: 94, tastatur: 0 });
  });
  it("falls back to the safe area when no bar is there, and when it is larger than a low bar", () => {
    expect(bottomClearance({ ...base, bars: [] })).toEqual({ unten: 34, tastatur: 0 });
    const low = { left: 12, right: 378, top: 824, bottom: 844 }; // 20 px high + gap 8 = 28 < 34
    expect(bottomClearance({ ...base, bars: [low] })).toEqual({ unten: 34, tastatur: 0 });
  });
  it("counts the safe area only where the view reaches into it", () => {
    expect(safeOverlap(34, 34)).toBe(0); // view ends above the home indicator
    expect(safeOverlap(14, 34)).toBe(20);
    expect(safeOverlap(0, 34)).toBe(34);
    expect(safeOverlap(0, 0)).toBe(0);
    // a split view that ends 20 px above the screen edge
    expect(bottomClearance({ view: { ...phone, bottom: 824 }, bars: [], viewportHeight: 844, safe: 34 }).unten).toBe(
      14,
    );
  });
  it("lets the keyboard cover bars and safe area, and counts it alone", () => {
    const visual = { top: 0, height: 844 - 290 };
    expect(bottomClearance({ ...base, bars: [navbar], visual })).toEqual({ unten: 0, tastatur: 290 });
  });
});

describe("keyboardOverlap", () => {
  const view = { left: 0, right: 390, top: 95, bottom: 844 };
  it("is open when the visual viewport ends 100 px or more above the screen bottom", () => {
    expect(keyboardOverlap(view, { top: 0, height: 554 }, 844)).toBe(290);
    expect(keyboardOverlap(view, { top: 0, height: 744 }, 844)).toBe(100);
    expect(keyboardOverlap(view, { top: 0, height: 745 }, 844)).toBe(0); // 99 px: browser bar, no keyboard
  });
  it("adds the offset of the visual viewport (iOS scrolls it when a field is focused)", () => {
    expect(keyboardOverlap(view, { top: 40, height: 514 }, 844)).toBe(290);
    expect(keyboardOverlap(view, { top: 40, height: 764 }, 844)).toBe(0);
  });
  it("counts the part of a view that ends above the screen edge without a threshold", () => {
    expect(keyboardOverlap({ ...view, bottom: 600 }, { top: 0, height: 554 }, 844)).toBe(46);
    expect(keyboardOverlap({ ...view, bottom: 500 }, { top: 0, height: 554 }, 844)).toBe(0);
  });
  it("ignores pinch zoom and a layout that already shrank (Android)", () => {
    expect(keyboardOverlap(view, { top: 0, height: 500, scale: 2 }, 844)).toBe(0);
    expect(keyboardOverlap({ ...view, bottom: 554 }, { top: 0, height: 554 }, 554)).toBe(0);
  });
});

describe("scrollDelta", () => {
  const area = { top: 100, bottom: 400 };
  it("does nothing for a field that is in view", () => {
    expect(scrollDelta({ top: 150, bottom: 200 }, area)).toBe(0);
  });
  it("scrolls up or down by what is missing, with a margin", () => {
    expect(scrollDelta({ top: 380, bottom: 440 }, area)).toBe(48);
    expect(scrollDelta({ top: 60, bottom: 110 }, area)).toBe(-48);
  });
  it("aligns a field taller than the area at its top", () => {
    expect(scrollDelta({ top: 300, bottom: 900 }, area)).toBe(192);
  });
});
