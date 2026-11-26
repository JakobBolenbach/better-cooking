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
