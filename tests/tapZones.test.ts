import { describe, expect, it } from "vitest";
import { stepAfterTap, tapAction, TAP_EDGE, TAP_MAX_MOVE, TAP_MAX_MS, type TapPress } from "../src/tapZones";
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
    pointers: 1,
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

  it("ignores other mouse buttons, several fingers, interactive targets and selected text", () => {
    expect(tapAction(press({ button: 2 }))).toBeNull();
    expect(tapAction(press({ button: 1 }))).toBeNull();
    expect(tapAction(press({ pointers: 2 }))).toBeNull();
    expect(tapAction(press({ interactive: true }))).toBeNull();
    expect(tapAction(press({ selection: true }))).toBeNull();
  });

  it("ignores an area without width", () => {
    expect(tapAction(press({ width: 0 }))).toBeNull();
  });
});

describe("stepAfterTap", () => {
  it("moves one step and stays within 0 and the done view", () => {
    expect(stepAfterTap("next", 2, 5)).toBe(3);
    expect(stepAfterTap("back", 2, 5)).toBe(1);
    expect(stepAfterTap("next", 4, 5)).toBe(5);
  });

  it("does nothing at the borders", () => {
    expect(stepAfterTap("back", 0, 5)).toBeNull();
    expect(stepAfterTap("next", 5, 5)).toBeNull();
    expect(stepAfterTap(null, 2, 5)).toBeNull();
  });

  it("goes back from the done view to the last step", () => {
    expect(stepAfterTap("back", 5, 5)).toBe(4);
  });
});

describe("hint flag", () => {
  it("is off by default and survives migration", () => {
    expect(DEFAULTS.cookingTapHintSeen).toBe(false);
    expect(migrateSettings({ cookingTapHintSeen: true }).cookingTapHintSeen).toBe(true);
  });
});
