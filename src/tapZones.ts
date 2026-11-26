// Tap zones of the cooking mode: is a press a tap, and does it mean "back" or "next"?
// Pure function without DOM, tested in tests/tapZones.test.ts. The DOM side is src/ui/useTapZones.ts.

/** A press that moves further than this (px) is a drag or a scroll, not a tap. */
export const TAP_MAX_MOVE = 10;
/** A press that lasts longer than this (ms) is a long press (text selection, context menu), not a tap. */
export const TAP_MAX_MS = 500;
/** Outermost strip (px) on both sides that Obsidian's own edge gestures (sidebars) may use; taps there do nothing. */
export const TAP_EDGE = 16;
/** Left share of the width that goes back; the rest goes on. Forward is the common move, so it gets the larger area. */
export const TAP_BACK_SHARE = 1 / 3;

export interface TapPress {
  /** Pointer down and up: client position and time (ms). */
  down: { x: number; y: number; t: number };
  up: { x: number; y: number; t: number };
  /** Left and width of the tap area (client coordinates). */
  left: number;
  width: number;
  /** MouseEvent.button of the press: 0 = primary (finger, pen, left mouse button). */
  button: number;
  /** Fingers on the screen during the press (a second finger anywhere cancels the tap). */
  pointers: number;
  /** The press started on a button, link, field, timer chip or ingredient list. */
  interactive: boolean;
  /** Text is selected after the press. */
  selection: boolean;
}

export type TapAction = Direction | null;

/** "back", "next" or null (not a tap, or in a place that does not count). */
export function tapAction(t: TapPress): TapAction {
  if (t.button !== 0 || t.pointers !== 1 || t.interactive || t.selection) return null;
  if (Math.hypot(t.up.x - t.down.x, t.up.y - t.down.y) > TAP_MAX_MOVE) return null;
  const ms = t.up.t - t.down.t;
  if (ms < 0 || ms > TAP_MAX_MS) return null;
  const x = t.down.x - t.left;
  if (t.width <= 0 || x < TAP_EDGE || x > t.width - TAP_EDGE) return null;
  return x < t.width * TAP_BACK_SHARE ? "back" : "next";
}

export type Direction = "back" | "next";

/** Step after one move: never before 0 and never after the end (n = the "done" view). Keys, swipes and taps use it. */
export function nextStep(dir: Direction, step: number, n: number): number {
  return Math.max(0, Math.min(n, step + (dir === "next" ? 1 : -1)));
}

/** A swipe must be at least this long (px) and clearly more horizontal than vertical (factor). */
export const SWIPE_MIN = 60;
export const SWIPE_RATIO = 1.5;

/** Direction of a swipe from its movement: to the left goes on, to the right goes back; null if it is none. */
export function swipeDirection(dx: number, dy: number): Direction | null {
  if (Math.abs(dx) <= SWIPE_MIN || Math.abs(dx) <= Math.abs(dy) * SWIPE_RATIO) return null;
  return dx < 0 ? "next" : "back";
}
