import { describe, expect, it } from "vitest";
import { bottomInset } from "../src/bottomInset";

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

import { bottomClearance, keyboardOverlap, safeOverlap } from "../src/bottomInset";

describe("bottomClearance (issue #56)", () => {
  const phone = { left: 0, right: 390, top: 95, bottom: 844 }; // view under the header, down to the screen edge
  const navbar = { left: 12, right: 378, top: 758, bottom: 822 }; // floating bar above the home indicator
  const base = { view: phone, viewportHeight: 844, safe: 34 };

  it("takes the floating bar, which already lies over the home indicator, without adding the safe area", () => {
    expect(bottomClearance({ ...base, bars: [navbar] })).toEqual({ unten: 94, tastatur: 0 });
  });
  it("falls back to the safe area when no bar is there", () => {
    expect(bottomClearance({ ...base, bars: [] })).toEqual({ unten: 34, tastatur: 0 });
  });
  it("counts the safe area only where the view reaches into it", () => {
    expect(safeOverlap({ ...phone, bottom: 810 }, 844, 34)).toBe(0);
    expect(safeOverlap({ ...phone, bottom: 830 }, 844, 34)).toBe(20);
    expect(safeOverlap(phone, 844, 0)).toBe(0);
  });
  it("lets the keyboard cover bars and safe area, and counts it alone", () => {
    const visual = { top: 0, height: 844 - 290 };
    expect(keyboardOverlap(phone, visual)).toBe(290);
    expect(bottomClearance({ ...base, bars: [navbar], visual })).toEqual({ unten: 0, tastatur: 290 });
  });
  it("ignores small viewport changes and pinch zoom", () => {
    expect(keyboardOverlap(phone, { top: 0, height: 844 - 60 })).toBe(0);
    expect(keyboardOverlap(phone, { top: 0, height: 500, scale: 2 })).toBe(0);
    expect(keyboardOverlap(phone, { top: 0, height: 844 })).toBe(0);
  });
});
