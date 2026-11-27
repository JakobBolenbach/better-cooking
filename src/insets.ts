// Measures what covers the edges of the plugin view and sets --rz-unten / --rz-tastatur / --rz-links / --rz-rechts
// on it. Runs in Obsidian (src/view.ts) and in the browser preview (dev/preview.tsx) with the same code.
// Logic: src/bottomInset.ts.
import { BAR_SELECTOR, bottomClearance, safeOverlap, type Visual } from "./bottomInset";
import { cssPx, setCssVar } from "./cssProps";

export interface Safe {
  bottom: number;
  left: number;
  right: number;
}

export interface InsetOverrides {
  /** Safe areas in px (the preview simulates them; `env()` cannot be faked). */
  safe?: Safe;
  /** Visual viewport (the preview simulates the keyboard). */
  visual?: Visual;
}

// The safe areas only change with the orientation, so they are read once per view and again after `resetSafe`.
const cache = new WeakMap<HTMLElement, { probe: HTMLElement; safe?: Safe }>();

/** Forget the cached safe areas (window resized, orientation changed). */
export function resetSafe(el: HTMLElement): void {
  const c = cache.get(el);
  if (c) c.safe = undefined;
}

/** env(safe-area-inset-*) in px, read through a hidden element that stays next to the view (not inside it, where the
 *  UI render would remove it). */
function readSafe(el: HTMLElement): Safe {
  let c = cache.get(el);
  if (!c) {
    c = { probe: el.ownerDocument.createElement("div") };
    c.probe.className = "rz-sicher-probe";
    cache.set(el, c);
  }
  if (c.safe) return c.safe;
  if (!c.probe.isConnected) (el.parentElement ?? el.ownerDocument.body).appendChild(c.probe);
  const style = (el.ownerDocument.defaultView ?? window).getComputedStyle(c.probe);
  c.safe = { bottom: cssPx(style.paddingBottom), left: cssPx(style.paddingLeft), right: cssPx(style.paddingRight) };
  return c.safe;
}

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.height <= 0 || r.width <= 0) return false;
  return el.checkVisibility ? el.checkVisibility({ checkVisibilityCSS: true, opacityProperty: true }) : true;
}

/** Measures in the document of `el` (popout windows have their own) and sets the CSS variables. */
export function applyInsets(el: HTMLElement, over: InsetOverrides = {}): void {
  const doc = el.ownerDocument;
  const win = doc.defaultView ?? window;
  const bars = Array.from(doc.querySelectorAll<HTMLElement>(BAR_SELECTOR))
    .filter(visible)
    .map((b) => b.getBoundingClientRect());
  const vv = win.visualViewport;
  const visual = over.visual ?? (vv ? { top: vv.offsetTop, height: vv.height, scale: vv.scale } : undefined);
  const safe = over.safe ?? readSafe(el);
  const view = el.getBoundingClientRect();
  const c = bottomClearance({ view, bars, viewportHeight: win.innerHeight, safe: safe.bottom, visual });
  setCssVar(el, "--rz-unten", `${c.unten}px`);
  setCssVar(el, "--rz-tastatur", `${c.tastatur}px`);
  // Landscape: notch and rounded corners at the sides, unless Obsidian already moved the view away from them.
  setCssVar(el, "--rz-links", `${safeOverlap(view.left, safe.left)}px`);
  setCssVar(el, "--rz-rechts", `${safeOverlap(win.innerWidth - view.right, safe.right)}px`);
}
