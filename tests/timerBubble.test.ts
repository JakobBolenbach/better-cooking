import { describe, expect, it } from "vitest";
import {
  bubbleTime,
  clampPoint,
  defaultPoint,
  fromAnchor,
  isDrag,
  parseAnchor,
  placePanel,
  snapToEdge,
  toAnchor,
  type Insets,
} from "../src/timerBubble";

const S = { w: 56, h: 56 };
const VIEW = { w: 400, h: 800 };
const NONE: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

describe("drag threshold", () => {
  it("is a tap below the threshold and a drag from it on, in any direction", () => {
    expect(isDrag(0, 0)).toBe(false);
    expect(isDrag(5, 5)).toBe(false);
    expect(isDrag(8, 0)).toBe(true);
    expect(isDrag(0, -9)).toBe(true);
    expect(isDrag(6, 6)).toBe(true);
    expect(isDrag(3, 0, 2)).toBe(true);
  });
});

describe("clampPoint", () => {
  it("leaves a point inside the view as it is", () => {
    expect(clampPoint({ x: 100, y: 200 }, S, VIEW, NONE)).toEqual({ x: 100, y: 200 });
  });
  it("keeps the bubble inside, a gap away from every edge", () => {
    expect(clampPoint({ x: -50, y: -50 }, S, VIEW, NONE)).toEqual({ x: 8, y: 8 });
    expect(clampPoint({ x: 900, y: 900 }, S, VIEW, NONE)).toEqual({ x: 400 - 8 - 56, y: 800 - 8 - 56 });
  });
  it("keeps clear of the safe areas", () => {
    const safe = { top: 47, right: 20, bottom: 34, left: 30 };
    expect(clampPoint({ x: 0, y: 0 }, S, VIEW, safe)).toEqual({ x: 38, y: 55 });
    expect(clampPoint({ x: 999, y: 999 }, S, VIEW, safe)).toEqual({ x: 400 - 20 - 8 - 56, y: 800 - 34 - 8 - 56 });
  });
  it("puts the bubble at the top left corner when the view is smaller than it", () => {
    expect(clampPoint({ x: 30, y: 30 }, S, { w: 40, h: 40 }, NONE)).toEqual({ x: 8, y: 8 });
  });
});

describe("snapToEdge", () => {
  it("snaps to the left edge from the left half, the height kept", () => {
    expect(snapToEdge({ x: 100, y: 300 }, S, VIEW, NONE)).toEqual({ x: 8, y: 300 });
  });
  it("snaps to the right edge from the right half", () => {
    expect(snapToEdge({ x: 300, y: 300 }, S, VIEW, NONE)).toEqual({ x: 336, y: 300 });
  });
  it("decides by the centre of the bubble", () => {
    expect(snapToEdge({ x: 171, y: 0 }, S, VIEW, NONE).x).toBe(8); // centre 199
    expect(snapToEdge({ x: 172, y: 0 }, S, VIEW, NONE).x).toBe(336); // centre 200
  });
  it("snaps inside the safe areas and clamps the height", () => {
    const safe = { top: 47, right: 0, bottom: 34, left: 44 };
    expect(snapToEdge({ x: 0, y: 0 }, S, VIEW, safe)).toEqual({ x: 52, y: 55 });
    expect(snapToEdge({ x: 390, y: 5000 }, S, VIEW, safe)).toEqual({ x: 336, y: 702 });
  });
});

describe("remembered position", () => {
  it("round-trips side and relative height", () => {
    const p = snapToEdge({ x: 300, y: 400 }, S, VIEW, NONE);
    const a = toAnchor(p, S, VIEW, NONE);
    expect(a.side).toBe("right");
    expect(fromAnchor(a, S, VIEW, NONE)).toEqual(p);
  });
  it("keeps the relative height and the side when the view is rotated", () => {
    const a = toAnchor({ x: 336, y: 400 }, S, VIEW, NONE);
    const wide = { w: 800, h: 400 };
    const p = fromAnchor(a, S, wide, NONE);
    expect(p.x).toBe(800 - 8 - 56);
    expect(p.y).toBeGreaterThanOrEqual(8);
    expect(p.y).toBeLessThanOrEqual(400 - 8 - 56);
  });
  it("puts a bubble at the bottom (y = 1) above the bottom safe area", () => {
    const safe = { ...NONE, bottom: 34 };
    expect(fromAnchor({ side: "left", y: 1 }, S, VIEW, safe)).toEqual({ x: 8, y: 800 - 34 - 8 - 56 });
  });
  it("copes with a view without free height", () => {
    expect(toAnchor({ x: 0, y: 0 }, S, { w: 100, h: 40 }, NONE).y).toBe(0);
    expect(fromAnchor({ side: "right", y: 0.5 }, S, { w: 100, h: 40 }, NONE).y).toBe(8);
  });
  it("accepts only a well-formed stored anchor", () => {
    expect(parseAnchor({ side: "left", y: 0.25 })).toEqual({ side: "left", y: 0.25 });
    expect(parseAnchor({ side: "right", y: 7 })).toEqual({ side: "right", y: 1 });
    expect(parseAnchor({ side: "top", y: 0.5 })).toBeUndefined();
    expect(parseAnchor({ side: "left", y: "0.5" })).toBeUndefined();
    expect(parseAnchor({ side: "left", y: NaN })).toBeUndefined();
    expect(parseAnchor(null)).toBeUndefined();
    expect(parseAnchor("left")).toBeUndefined();
    expect(parseAnchor(undefined)).toBeUndefined();
  });
});

describe("defaultPoint", () => {
  it("starts bottom right, above the footer and the safe area", () => {
    expect(defaultPoint(S, VIEW, { ...NONE, bottom: 34 }, 84)).toEqual({ x: 336, y: 800 - 34 - 8 - 56 - 84 });
  });
  it("stays inside a view that is too low for the reserve", () => {
    expect(defaultPoint(S, { w: 400, h: 120 }, NONE, 84)).toEqual({ x: 336, y: 8 });
  });
});

describe("placePanel", () => {
  const panel = { w: 300, h: 200 };
  it("opens above a bubble in the lower part, its right edge in line with the bubble", () => {
    expect(placePanel({ x: 336, y: 600 }, S, panel, VIEW, NONE)).toEqual({ x: 92, y: 600 - 8 - 200 });
  });
  it("opens below a bubble at the top, in line with its left edge", () => {
    expect(placePanel({ x: 8, y: 20 }, S, panel, VIEW, NONE)).toEqual({ x: 8, y: 20 + 56 + 8 });
  });
  it("stays inside the view and the safe areas when there is no room either way", () => {
    const safe = { top: 47, right: 0, bottom: 34, left: 0 };
    const r = placePanel({ x: 336, y: 100 }, S, { w: 300, h: 700 }, VIEW, safe);
    expect(r.y).toBeGreaterThanOrEqual(55);
    expect(r.y + 700).toBeLessThanOrEqual(800 - 34);
    expect(r.x).toBe(92);
  });
});

describe("bubbleTime", () => {
  it("shows minutes and seconds below an hour", () => {
    expect(bubbleTime(0)).toBe("0:00");
    expect(bubbleTime(65_000)).toBe("1:05");
    expect(bubbleTime(59 * 60_000 + 59_000)).toBe("59:59");
    expect(bubbleTime(-5)).toBe("0:00");
  });
  it("shows hours and minutes from an hour on", () => {
    expect(bubbleTime(3_600_000)).toBe("1:00");
    expect(bubbleTime(5_409_000)).toBe("1:30");
    expect(bubbleTime(11 * 3_600_000 + 5 * 60_000)).toBe("11:05");
  });
});
