import { describe, expect, it } from "vitest";
import {
  inEdge,
  nearRect,
  nextStep,
  TAP_SCROLL_QUIET,
  swipeDirection,
  SWIPE_MIN,
  tapAction,
  TAP_EDGE,
  TAP_MAX_MOVE,
  TAP_MAX_MS,
  type TapPress,
} from "../src/tapZones";
import { DEFAULTS } from "../src/settings";
import { migrateSettings } from "../src/migrate";

/** A clean tap at x in an area 390 wide starting at 0. */
function press(over: Partial<TapPress> & { x?: number } = {}): TapPress {
  const { x = 300, ...rest } = over;
  return {
    down: { x, y: 400, t: 1000 },
    up: { x, y: 400, t: 1080 },
    left: 0,
    width: 390,
    button: 0,
    pointerType: "touch",
    multiTouch: false,
    targets: [],
    scrollAt: null,
    interactive: false,
    selection: false,
    ...rest,
  };
}

describe("tapAction (issue #57)", () => {
  it("left third goes back, the rest goes on", () => {
    expect(tapAction(press({ x: 40 }))).toBe("back");
    expect(tapAction(press({ x: 129 }))).toBe("back");
    expect(tapAction(press({ x: 130 }))).toBe("next");
    expect(tapAction(press({ x: 350 }))).toBe("next");
  });

  it("measures from the left of the area, not of the screen", () => {
    expect(tapAction(press({ x: 440, left: 300, width: 600 }))).toBe("back");
    expect(tapAction(press({ x: 600, left: 300, width: 600 }))).toBe("next");
  });

  it("leaves out the outermost strip on both sides", () => {
    expect(tapAction(press({ x: TAP_EDGE - 1 }))).toBeNull();
    expect(tapAction(press({ x: TAP_EDGE }))).toBe("back");
    expect(tapAction(press({ x: 390 - TAP_EDGE }))).toBe("next");
    expect(tapAction(press({ x: 390 - TAP_EDGE + 1 }))).toBeNull();
  });

  it("allows a little finger jitter, but not a drag or a scroll", () => {
    const at = (dx: number, dy: number) => ({
      down: { x: 300, y: 400, t: 0 },
      up: { x: 300 + dx, y: 400 + dy, t: 90 },
    });
    expect(tapAction(press(at(TAP_MAX_MOVE - 1, 0)))).toBe("next");
    expect(tapAction(press(at(0, TAP_MAX_MOVE + 1)))).toBeNull();
    expect(tapAction(press(at(8, 8)))).toBeNull();
    expect(tapAction(press(at(80, 0)))).toBeNull();
  });

  it("ignores long presses", () => {
    const at = (ms: number) => ({ down: { x: 300, y: 400, t: 0 }, up: { x: 300, y: 400, t: ms } });
    expect(tapAction(press(at(TAP_MAX_MS)))).toBe("next");
    expect(tapAction(press(at(TAP_MAX_MS + 1)))).toBeNull();
    expect(tapAction(press(at(-5)))).toBeNull();
  });

  it("ignores the mouse, other buttons, several fingers, interactive targets and selected text", () => {
    expect(tapAction(press({ pointerType: "mouse" }))).toBeNull();
    expect(tapAction(press({ pointerType: "pen" }))).toBe("next");
    expect(tapAction(press({ button: 2 }))).toBeNull();
    expect(tapAction(press({ button: 1 }))).toBeNull();
    expect(tapAction(press({ multiTouch: true }))).toBeNull();
    expect(tapAction(press({ interactive: true }))).toBeNull();
    expect(tapAction(press({ selection: true }))).toBeNull();
  });

  it("ignores a tap right after a scroll (stopping a scroll)", () => {
    // press() starts at t = 1000
    expect(tapAction(press({ scrollAt: 1000 - TAP_SCROLL_QUIET + 1 }))).toBeNull();
    expect(tapAction(press({ scrollAt: 1050 }))).toBeNull(); // scrolled during the press
    expect(tapAction(press({ scrollAt: 1000 - TAP_SCROLL_QUIET }))).toBe("next");
    expect(tapAction(press({ scrollAt: null }))).toBe("next");
  });

  it("ignores a near miss next to a button or chip", () => {
    const chip = { left: 200, top: 380, right: 260, bottom: 420 };
    expect(tapAction(press({ x: 270, targets: [chip] }))).toBeNull(); // 10 px
    expect(tapAction(press({ x: 280, targets: [chip] }))).toBe("next"); // 20 px
    expect(tapAction(press({ x: 300, targets: [{ ...chip, top: 100, bottom: 140 }] }))).toBe("next");
  });

  it("ignores an area without width", () => {
    expect(tapAction(press({ width: 0 }))).toBeNull();
  });
});

describe("inEdge and nearRect", () => {
  it("find the outer strips of the area", () => {
    expect(inEdge(5, 0, 390)).toBe(true);
    expect(inEdge(200, 0, 390)).toBe(false);
    expect(inEdge(380, 0, 390)).toBe(true);
    expect(inEdge(310, 300, 600)).toBe(true);
  });

  it("measures the distance to a box", () => {
    const r = { left: 10, top: 10, right: 20, bottom: 20 };
    expect(nearRect(25, 15, [r], 12)).toBe(true);
    expect(nearRect(40, 15, [r], 12)).toBe(false);
    expect(nearRect(15, 15, [], 12)).toBe(false);
  });
});

describe("nextStep", () => {
  it("moves one step and stays within 0 and the done view", () => {
    expect(nextStep("next", 2, 5)).toBe(3);
    expect(nextStep("back", 2, 5)).toBe(1);
    expect(nextStep("next", 4, 5)).toBe(5);
    expect(nextStep("back", 5, 5)).toBe(4);
  });

  it("stays at the borders", () => {
    expect(nextStep("back", 0, 5)).toBe(0);
    expect(nextStep("next", 5, 5)).toBe(5);
  });
});

describe("swipeDirection", () => {
  it("left goes on, right goes back", () => {
    expect(swipeDirection(-80, 5)).toBe("next");
    expect(swipeDirection(80, -5)).toBe("back");
  });

  it("needs length and a mostly horizontal move", () => {
    expect(swipeDirection(-SWIPE_MIN, 0)).toBeNull();
    expect(swipeDirection(-100, 80)).toBeNull();
    expect(swipeDirection(0, 200)).toBeNull();
  });
});

describe("hint flag", () => {
  it("is off by default and survives migration", () => {
    expect(DEFAULTS.cookingTapHintSeen).toBe(false);
    expect(migrateSettings({ cookingTapHintSeen: true }).cookingTapHintSeen).toBe(true);
  });
});
