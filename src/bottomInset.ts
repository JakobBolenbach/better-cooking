// How far bars of Obsidian cover the bottom of the plugin view. Pure function, tested in tests/bottomInset.test.ts.

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Pixels the view has to keep free at its bottom edge: the largest overlap of any bar with the view, plus a small
 * gap. Bars that sit beside the view or above/below it (a status bar under a sidebar) count as 0.
 * Used for the floating bar of Obsidian mobile and the status bar on desktop (bottom right, fixed).
 */
export function bottomInset(view: Box, bars: Box[], gap = 8): number {
  let inset = 0;
  for (const b of bars) {
    const height = b.bottom - b.top;
    const overlaps = b.left < view.right && b.right > view.left && b.top < view.bottom && b.bottom > view.top;
    if (height > 0 && overlaps) inset = Math.max(inset, view.bottom - b.top);
  }
  return inset > 0 ? Math.round(Math.max(0, inset) + gap) : 0;
}

/** Bars of Obsidian that can lie over the bottom of a view: the navigation bar of Obsidian mobile (floating, seen on
 *  an iPhone) and the status bar on desktop. Only visible bars that overlap the view count (src/insets.ts). */
export const BAR_SELECTOR = ".mobile-navbar, .status-bar";

/** The visual viewport (what is not covered by the on-screen keyboard), in the coordinates of the layout viewport. */
export interface Visual {
  top: number;
  height: number;
  scale?: number;
}

/** Smallest height of the viewport that has to be covered to call it an on-screen keyboard (browser bars stay below). */
const KEYBOARD_MIN = 100;

/**
 * Pixels of the view's bottom edge that the on-screen keyboard covers. The keyboard is open when the visual viewport
 * ends at least 100 px above the bottom of the layout viewport (not zoomed in); how much of the view it covers has no
 * threshold, a view that ends above the screen edge is covered less.
 */
export function keyboardOverlap(view: Box, visual: Visual, viewportHeight: number): number {
  if ((visual.scale ?? 1) > 1.01) return 0;
  const visibleBottom = visual.top + visual.height;
  if (viewportHeight - visibleBottom < KEYBOARD_MIN) return 0;
  return Math.max(0, Math.round(view.bottom - visibleBottom));
}

/** Part of a safe area (home indicator, notch) that lies inside the view; 0 if the view ends before it.
 *  `distance` is the gap between the view's edge and the screen edge. */
export function safeOverlap(distance: number, safe: number): number {
  return Math.round(Math.max(0, safe - Math.max(0, distance)));
}

export interface Clearance {
  /** `--rz-unten`: space to keep free for bars and the home indicator. */
  unten: number;
  /** `--rz-tastatur`: space the on-screen keyboard covers; the bars lie under it then. */
  tastatur: number;
}

/**
 * What to keep free at the bottom of the view. Bars and the safe area overlap each other (a bar usually reaches to the
 * screen edge and includes the home indicator), so the larger one counts, not the sum. With the keyboard open the
 * keyboard covers both and counts alone.
 */
export function bottomClearance(a: {
  view: Box;
  bars: Box[];
  viewportHeight: number;
  safe: number;
  visual?: Visual;
}): Clearance {
  const tastatur = a.visual ? keyboardOverlap(a.view, a.visual, a.viewportHeight) : 0;
  if (tastatur > 0) return { unten: 0, tastatur };
  const bar = bottomInset(a.view, a.bars);
  return { unten: Math.max(bar, safeOverlap(a.viewportHeight - a.view.bottom, a.safe)), tastatur: 0 };
}

/**
 * How far to scroll an area so that a focused field is fully visible in it (with a small margin); 0 if it already is.
 * Fields taller than the area are aligned at their top.
 */
export function scrollDelta(field: { top: number; bottom: number }, area: { top: number; bottom: number }, margin = 8) {
  if (field.top < area.top + margin) return Math.round(field.top - area.top - margin);
  if (field.bottom > area.bottom - margin) {
    return Math.round(Math.min(field.bottom - area.bottom + margin, field.top - area.top - margin));
  }
  return 0;
}
