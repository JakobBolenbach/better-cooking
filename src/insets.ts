// Measures what covers the bottom of the plugin view and sets --rz-unten / --rz-tastatur on it. Runs in Obsidian
// (src/view.ts) and in the browser preview (dev/preview.tsx) with the same code. Logic: src/bottomInset.ts.
import { BAR_SELECTOR, bottomClearance, type Visual } from "./bottomInset";

export interface InsetOverrides {
  /** Safe area at the bottom in px (the preview simulates it; `env()` cannot be faked). */
  safe?: number;
  /** Visual viewport (the preview simulates the keyboard). */
  visual?: Visual;
}

/** env(safe-area-inset-bottom) in px, read through a throw-away element. */
export function readSafeBottom(doc: Document): number {
  const probe = doc.createElement("div");
  probe.className = "rz-sicher-probe";
  doc.body.appendChild(probe);
  const px = parseFloat((doc.defaultView ?? window).getComputedStyle(probe).paddingBottom);
  probe.remove();
  return Number.isFinite(px) ? px : 0;
}

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.height <= 0 || r.width <= 0) return false;
  return el.checkVisibility ? el.checkVisibility({ checkVisibilityCSS: true, opacityProperty: true }) : true;
}

/** Measures in the document of `el` (popout windows have their own) and sets the two CSS variables. */
export function applyInsets(el: HTMLElement, over: InsetOverrides = {}): void {
  const doc = el.ownerDocument;
  const win = doc.defaultView ?? window;
  const bars = Array.from(doc.querySelectorAll<HTMLElement>(BAR_SELECTOR))
    .filter(visible)
    .map((b) => b.getBoundingClientRect());
  const vv = win.visualViewport;
  const visual = over.visual ?? (vv ? { top: vv.offsetTop, height: vv.height, scale: vv.scale } : undefined);
  const c = bottomClearance({
    view: el.getBoundingClientRect(),
    bars,
    viewportHeight: win.innerHeight,
    safe: over.safe ?? readSafeBottom(doc),
    visual,
  });
  set(el, "--rz-unten", `${c.unten}px`);
  set(el, "--rz-tastatur", `${c.tastatur}px`);
}

function set(el: HTMLElement, name: string, value: string) {
  if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
}
