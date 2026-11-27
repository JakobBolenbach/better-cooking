// Geometry of the timer bubble (issue #154): where it may sit, where it snaps to, where the opened list goes and what
// is remembered per device. Pure functions on plain numbers, no DOM; tests/timerBubble.test.ts.
// Coordinates are px inside the view, the origin is its top left corner; a point is the top left corner of an element.

export interface Point {
  x: number;
  y: number;
}
export interface Box {
  w: number;
  h: number;
}
/** Space the bubble keeps free at each edge: safe areas (notch, home indicator), keyboard, system bars. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
/** What is remembered: the side and how far down along the free height (0 top, 1 bottom), so a resized or rotated view keeps the spot. */
export interface Anchor {
  side: "left" | "right";
  y: number;
}

/** Key in the device storage (Obsidian's local storage), next to the timers themselves. */
export const BUBBLE_KEY = "better-cooking-timer-bubble";

export const BUBBLE_SIZE = 56;
/** Space between the bubble and the edge of the view. */
export const EDGE_GAP = 8;
/** Movement (px) from which a press becomes a drag; below it the press stays a tap. */
export const DRAG_THRESHOLD = 8;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/** Range an element of this size may occupy: its top left corner between `min` and `max`. A view too small for it gets min = max. */
function range(size: Box, view: Box, insets: Insets, gap: number) {
  const minX = insets.left + gap;
  const minY = insets.top + gap;
  return {
    minX,
    minY,
    maxX: Math.max(minX, view.w - insets.right - gap - size.w),
    maxY: Math.max(minY, view.h - insets.bottom - gap - size.h),
  };
}

/** Is the movement from the press far enough to count as a drag? */
export function isDrag(dx: number, dy: number, threshold = DRAG_THRESHOLD): boolean {
  return Math.hypot(dx, dy) >= threshold;
}

/** Keep the element inside the view, behind the insets. */
export function clampPoint(p: Point, size: Box, view: Box, insets: Insets, gap = EDGE_GAP): Point {
  const r = range(size, view, insets, gap);
  return { x: clamp(p.x, r.minX, r.maxX), y: clamp(p.y, r.minY, r.maxY) };
}

/** Where a released bubble comes to rest: on the nearer side edge (by its centre), the height kept. */
export function snapToEdge(p: Point, size: Box, view: Box, insets: Insets, gap = EDGE_GAP): Point {
  const r = range(size, view, insets, gap);
  const centre = p.x + size.w / 2;
  const left = centre < (insets.left + view.w - insets.right) / 2;
  return { x: left ? r.minX : r.maxX, y: clamp(p.y, r.minY, r.maxY) };
}

/** Remember a resting point as side and relative height. */
export function toAnchor(p: Point, size: Box, view: Box, insets: Insets, gap = EDGE_GAP): Anchor {
  const r = range(size, view, insets, gap);
  const centre = p.x + size.w / 2;
  const span = r.maxY - r.minY;
  return {
    side: centre < (insets.left + view.w - insets.right) / 2 ? "left" : "right",
    y: span > 0 ? clamp((p.y - r.minY) / span, 0, 1) : 0,
  };
}

/** The point for a remembered anchor in the view as it is now. */
export function fromAnchor(a: Anchor, size: Box, view: Box, insets: Insets, gap = EDGE_GAP): Point {
  const r = range(size, view, insets, gap);
  return { x: a.side === "left" ? r.minX : r.maxX, y: r.minY + a.y * (r.maxY - r.minY) };
}

/** Start position: right edge, `reserve` px above the bottom insets (the cooking mode footer with "Next" and the page's bottom bars). */
export function defaultPoint(size: Box, view: Box, insets: Insets, reserve: number, gap = EDGE_GAP): Point {
  const r = range(size, view, insets, gap);
  return { x: r.maxX, y: clamp(r.maxY - reserve, r.minY, r.maxY) };
}

/** Read what was stored; anything but a well-formed anchor gives undefined. */
export function parseAnchor(raw: unknown): Anchor | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if ((o.side !== "left" && o.side !== "right") || typeof o.y !== "number" || !Number.isFinite(o.y)) return undefined;
  return { side: o.side, y: clamp(o.y, 0, 1) };
}

/** Where the opened list goes: beside the bubble's edge, above it if there is room, otherwise below, always inside the view. */
export function placePanel(
  bubble: Point,
  bubbleSize: Box,
  panel: Box,
  view: Box,
  insets: Insets,
  gap = EDGE_GAP,
): Point {
  const r = range(panel, view, insets, gap);
  const onLeft = bubble.x + bubbleSize.w / 2 < (insets.left + view.w - insets.right) / 2;
  const x = onLeft ? bubble.x : bubble.x + bubbleSize.w - panel.w;
  const above = bubble.y - gap - panel.h;
  const below = bubble.y + bubbleSize.h + gap;
  const y = above >= r.minY ? above : below <= r.maxY ? below : above;
  return { x: clamp(x, r.minX, r.maxX), y: clamp(y, r.minY, r.maxY) };
}

/** Time on the bubble: 4:07 below an hour, 1:05 (hours:minutes, rounded down) from one hour on; it must fit a small circle. */
export function bubbleTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const z = (n: number) => String(n).padStart(2, "0");
  if (s >= 3600) return `${Math.floor(s / 3600)}:${z(Math.floor((s % 3600) / 60))}`;
  return `${Math.floor(s / 60)}:${z(s % 60)}`;
}
