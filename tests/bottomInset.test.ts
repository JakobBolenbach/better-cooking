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
