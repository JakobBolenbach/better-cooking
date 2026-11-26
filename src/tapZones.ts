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

export type Direction = "back" | "next";

/** Tap not closer than this (px) to a button, chip or link: a near miss is not meant as "next". */
export const TAP_NEAR = 12;
/** A press that starts this soon (ms) after a scroll event is taken as stopping a scroll, not as a tap. */
export const TAP_SCROLL_QUIET = 250;

/** The click must follow the end of the press within this time (ms), else it is not that press's click. */
export const TAP_CLICK_MS = 400;

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TapPress {
  /** PointerEvent.pointerType of the press; a mouse does not tap (it has buttons and the arrow keys). */
  pointerType: string;
  /** Pointer down and up: client position and time (ms, same time base as the scroll time). */
  down: { x: number; y: number; t: number };
  up: { x: number; y: number; t: number };
  /** Left and width of the tap area (client coordinates). */
  left: number;
  width: number;
  /** MouseEvent.button of the press: 0 = primary (finger, pen). */
  button: number;
  /** A second finger touched the screen during the press. */
  multiTouch: boolean;
  /** The press started on a button, link, field, timer chip or ingredient list. */
  interactive: boolean;
  /** Boxes of the interactive elements in the tap area (client coordinates). */
  targets: Rect[];
  /** Text was selected at the start or is selected at the end of the press. */
  selection: boolean;
  /** Time of the last scroll event of the tap area, if any. */
  scrollAt: number | null;
}

export type TapAction = Direction | null;

/** In the outermost strip on one side of the area (client x, left and width of the area)? */
export function inEdge(x: number, left: number, width: number): boolean {
  return x - left < TAP_EDGE || x - left > width - TAP_EDGE;
}

/** Is the point inside one of the boxes or closer than `margin` to it? */
export function nearRect(x: number, y: number, rects: Rect[], margin: number): boolean {
  return rects.some(
    (r) => x >= r.left - margin && x <= r.right + margin && y >= r.top - margin && y <= r.bottom + margin,
  );
}

/** "back", "next" or null (not a tap, or in a place that does not count). */
export function tapAction(t: TapPress): TapAction {
  if (t.pointerType === "mouse" || t.button !== 0 || t.multiTouch || t.interactive || t.selection) return null;
  if (Math.hypot(t.up.x - t.down.x, t.up.y - t.down.y) > TAP_MAX_MOVE) return null;
  const ms = t.up.t - t.down.t;
  if (ms < 0 || ms > TAP_MAX_MS) return null;
  if (t.scrollAt !== null && t.down.t - t.scrollAt < TAP_SCROLL_QUIET) return null;
  if (t.width <= 0 || inEdge(t.down.x, t.left, t.width)) return null;
  if (nearRect(t.down.x, t.down.y, t.targets, TAP_NEAR)) return null;
  return t.down.x - t.left < t.width * TAP_BACK_SHARE ? "back" : "next";
}

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
