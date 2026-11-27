import { beforeEach, describe, expect, it } from "vitest";
import { setLanguage } from "../src/i18n";
import {
  BUBBLE_SPACE,
  bubbleTime,
  clampPoint,
  defaultPoint,
  fromAnchor,
  isDrag,
  parseAnchor,
  panelLimits,
  placePanel,
  spokenTime,
  snapToEdge,
  toAnchor,
  type Insets,
} from "../src/timerBubble";

beforeEach(() => setLanguage("en"));

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
  it("starts bottom right above the bottom inset (in cooking mode it contains the footer)", () => {
    expect(defaultPoint(S, VIEW, { ...NONE, bottom: 34 })).toEqual({ x: 336, y: 800 - 34 - 8 - 56 });
    expect(defaultPoint(S, VIEW, { ...NONE, bottom: 34 + 84 })).toEqual({ x: 336, y: 800 - 118 - 8 - 56 });
  });
  it("stays inside a view that is too low", () => {
    expect(defaultPoint(S, { w: 400, h: 100 }, { ...NONE, bottom: 84 })).toEqual({ x: 336, y: 8 });
  });
  it("a remembered spot at the bottom rests above the footer when the footer is in the insets", () => {
    const withFooter = { ...NONE, bottom: 34 + 84 };
    expect(fromAnchor({ side: "left", y: 1 }, S, VIEW, withFooter).y).toBe(800 - 118 - 8 - 56);
    expect(fromAnchor({ side: "left", y: 1 }, S, { w: 800, h: 400 }, withFooter).y).toBe(400 - 118 - 8 - 56);
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

describe("panelLimits", () => {
  it("is as wide as fits, up to the widest list, and as high as the space between the insets", () => {
    expect(panelLimits({ w: 390, h: 844 }, { ...NONE, bottom: 34 })).toEqual({ width: 374, maxHeight: 844 - 34 - 16 });
    expect(panelLimits({ w: 1400, h: 900 }, NONE).width).toBe(420);
    expect(panelLimits({ w: 390, h: 844 }, { ...NONE, left: 47, right: 47 }).width).toBe(280);
  });
  it("is never negative", () => {
    expect(panelLimits({ w: 10, h: 10 }, NONE)).toEqual({ width: 0, maxHeight: 0 });
  });
});

describe("room at the bottom of the pages", () => {
  it("is the bubble and its gap on both sides", () => {
    expect(BUBBLE_SPACE).toBe(72);
  });
});

describe("bubbleTime", () => {
  it("shows minutes and seconds below an hour, like the clock of the cooking mode", () => {
    expect(bubbleTime(0)).toBe("0:00");
    expect(bubbleTime(65_000)).toBe("1:05");
    expect(bubbleTime(59 * 60_000 + 59_000)).toBe("59:59");
    expect(bubbleTime(-5)).toBe("0:00");
  });
  it("shows hours and minutes from an hour on, short and unambiguous", () => {
    expect(bubbleTime(3_600_000)).toBe("1h00");
    expect(bubbleTime(5_409_000)).toBe("1h30");
    expect(bubbleTime(11 * 3_600_000 + 5 * 60_000)).toBe("11h05");
  });
});

describe("spokenTime", () => {
  it("counts to the minute, rounded up", () => {
    expect(spokenTime(1_000)).toBe("1 min");
    expect(spokenTime(65_000)).toBe("2 min");
    expect(spokenTime(120_000)).toBe("2 min");
    expect(spokenTime(5_400_000)).toBe("1 h 30 min");
  });
});
