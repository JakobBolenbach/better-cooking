// Tap zones of the cooking mode: is a press a tap, and does it mean "back" or "next"?
// Pure function without DOM, tested in tests/tapZones.test.ts. The DOM side is src/ui/useTapZones.ts.

/** A press that moves further than this (px) is a drag or a scroll, not a tap. */
export const TAP_MAX_MOVE = 10;
/** A press that lasts longer than this (ms) is a long press (text selection, context menu), not a tap. */
export const TAP_MAX_MS = 500;
/** Left share of the width that goes back; the rest goes on. Forward is the common move, so it gets the larger area. */
export const TAP_BACK_SHARE = 1 / 3;

export type Direction = "back" | "next";

/** Tap not closer than this (px) to a button, chip or link: a near miss is not meant as "next". */
export const TAP_NEAR = 12;
/** A press that starts this soon (ms) after a scroll event is taken as stopping a scroll, not as a tap. */
export const TAP_SCROLL_QUIET = 250;

/** After a tap that changed the step, the click that follows is swallowed for this long (ms). */
export const TAP_GHOST_MS = 500;
/** The ghost click lands this close (px) to where the finger lifted. */
export const TAP_GHOST_RADIUS = 16;

/** A click expected after a tap: where the finger lifted and when the wait ends (same time base as the events). */
export interface ExpectedClick {
  x: number;
  y: number;
  until: number;
}

export interface ClickInfo {
  x: number;
  y: number;
  /** MouseEvent.detail: 0 = keyboard or assistive technology. */
  detail: number;
  /** Event.isTrusted: false for clicks from scripts. */
  trusted: boolean;
  at: number;
}

/** Index of the expected click that this click is the ghost of, or -1 (then the click goes through). */
export function ghostIndex(expected: ExpectedClick[], c: ClickInfo): number {
  if (!c.trusted || c.detail < 1) return -1;
  return expected.findIndex((g) => c.at <= g.until && Math.hypot(c.x - g.x, c.y - g.y) <= TAP_GHOST_RADIUS);
}

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
  /** The press started on a button, link, field, timer chip or checkable ingredient. */
  interactive: boolean;
  /** Boxes of the small controls in the tap area (client coordinates). */
  targets: Rect[];
  /** Text was selected at the start or is selected at the end of the press. */
  selection: boolean;
  /** Time of the last scroll event of the tap area, if any. */
  scrollAt: number | null;
}

export type TapAction = Direction | null;

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
  if (t.width <= 0) return null;
  if (nearRect(t.down.x, t.down.y, t.targets, TAP_NEAR)) return null;
  return t.down.x - t.left < t.width * TAP_BACK_SHARE ? "back" : "next";
}

/** Step after one move: never before 0 and never after the end (n = the "done" view). Keys and taps use it. */
export function nextStep(dir: Direction, step: number, n: number): number {
  return Math.max(0, Math.min(n, step + (dir === "next" ? 1 : -1)));
}

/** What the browser says about its pointers; passed in, so the check runs in tests without a browser. */
export interface PointerEnv {
  /** `matchMedia("(any-pointer: coarse)").matches`, undefined where matchMedia is missing. */
  anyCoarse?: boolean;
  /** `navigator.maxTouchPoints`. */
  touchPoints?: number;
}

/** Can the device tap at all? Only then the tap zone hint makes sense; a mouse does not turn pages (see tapZoneFor). */
export function hasTouch(env: PointerEnv): boolean {
  return env.anyCoarse ?? (env.touchPoints ?? 0) > 0;
}
