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

/** Bars of Obsidian that can lie over the bottom of a view: the navigation bar of Obsidian mobile (floating since 1.11),
 *  the formatting toolbar of the editor on mobile, the status bar on desktop. Only the first and the last are
 *  confirmed on a device; `.mobile-toolbar` is an assumption (src/insets.ts only counts what is visible and overlaps). */
export const BAR_SELECTOR = ".mobile-navbar, .mobile-toolbar, .status-bar";

/** The visual viewport (what is not covered by the on-screen keyboard), in the coordinates of the layout viewport. */
export interface Visual {
  top: number;
  height: number;
  scale?: number;
}

/** Smallest overlap that counts as an on-screen keyboard; browser bars sliding in and out stay below. */
const KEYBOARD_MIN = 100;

/** Pixels of the view's bottom edge that the on-screen keyboard covers (0 without keyboard or when zoomed in). */
export function keyboardOverlap(view: Box, visual: Visual): number {
  if ((visual.scale ?? 1) > 1.01) return 0;
  const covered = view.bottom - (visual.top + visual.height);
  return covered >= KEYBOARD_MIN ? Math.round(covered) : 0;
}

/** Part of the safe area at the bottom (home indicator) that lies inside the view; 0 if the view ends above it. */
export function safeOverlap(view: Box, viewportHeight: number, safe: number): number {
  return Math.round(Math.max(0, safe - Math.max(0, viewportHeight - view.bottom)));
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
  const tastatur = a.visual ? keyboardOverlap(a.view, a.visual) : 0;
  if (tastatur > 0) return { unten: 0, tastatur };
  const bar = bottomInset(a.view, a.bars);
  return { unten: Math.max(bar, safeOverlap(a.view, a.viewportHeight, a.safe)), tastatur: 0 };
}
