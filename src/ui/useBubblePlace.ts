// Where the timer bubble sits and how it is moved (issue #154): measures the view, follows a drag with mouse and touch
// (pointer events), snaps to a side edge on release and remembers the spot per device. The geometry is in src/timerBubble.ts.
import type { RefObject } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { LocalStore } from "../localStore";
import { cssPx, setCssVar } from "../cssProps";
import {
  BUBBLE_SIZE,
  BUBBLE_SPACE,
  clampPoint,
  defaultPoint,
  fromAnchor,
  isDrag,
  parseAnchor,
  snapToEdge,
  toAnchor,
  type Anchor,
  type Box,
  type Insets,
  type Point,
} from "../timerBubble";

const SIZE: Box = { w: BUBBLE_SIZE, h: BUBBLE_SIZE };
const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
/** A click this soon after a drag ended belongs to the drag (ms). */
const CLICK_AFTER_DRAG_MS = 400;

const px = (el: HTMLElement, name: string) =>
  cssPx(el.ownerDocument.defaultView?.getComputedStyle(el).getPropertyValue(name) ?? "");

/**
 * The view the bubble floats in and what it keeps free. Bottom: the home indicator or the keyboard (whichever is
 * higher, like the dialogs) and, in cooking mode, the footer with "Back" and "Next", so the bubble never rests on it.
 */
function measure(root: HTMLElement, cooking: boolean) {
  const view: Box = { w: root.clientWidth, h: root.clientHeight };
  const unten = px(root, "--rz-unten");
  // The footer is measured (it grows with the safe area and larger text); its variable is the fallback.
  const footer = cooking ? root.querySelector(".rz-koch-fuss")?.getBoundingClientRect().height : undefined;
  const extra = !cooking ? 0 : footer ? Math.max(0, footer - unten) : px(root, "--rz-koch-fuss");
  const insets: Insets = {
    top: 0,
    right: px(root, "--rz-rechts"),
    bottom: Math.max(unten, px(root, "--rz-tastatur")) + extra,
    left: px(root, "--rz-links"),
  };
  return { view, insets };
}

/** Size and insets of the view, measured before the first paint and again when the view changes size (window,
 *  rotation) or the safe areas and the keyboard change its variables. Also tells the pages how much room the bubble needs. */
function useMeasure(bubble: RefObject<HTMLElement>, active: boolean, cooking: boolean) {
  const [m, setM] = useState({ view: { w: 0, h: 0 }, insets: NO_INSETS });
  useLayoutEffect(() => {
    const el = bubble.current?.closest<HTMLElement>(".rz-root");
    if (!el) return;
    const read = () => {
      const n = measure(el, cooking);
      setM((o) => (JSON.stringify(o) === JSON.stringify(n) ? o : n));
    };
    read();
    setCssVar(el, "--rz-kugel", `${BUBBLE_SPACE}px`);
    const win = el.ownerDocument.defaultView ?? window;
    const size = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(read);
    size?.observe(el);
    const footer = cooking ? el.querySelector(".rz-koch-fuss") : null;
    if (footer) size?.observe(footer);
    const style = typeof MutationObserver === "undefined" ? undefined : new MutationObserver(read);
    style?.observe(el, { attributes: true, attributeFilter: ["style"] });
    win.addEventListener("resize", read);
    return () => {
      size?.disconnect();
      style?.disconnect();
      win.removeEventListener("resize", read);
      setCssVar(el, "--rz-kugel", ""); // empty value removes the variable
    };
  }, [active, cooking]);
  return m;
}

/** Touches on the bubble belong to the bubble: no swipe of Obsidian's sidebars or pull to refresh. To be confirmed on a device. */
function useOwnTouches(bubble: RefObject<HTMLElement>, active: boolean) {
  useEffect(() => {
    const el = bubble.current;
    if (!el) return;
    const stop = (e: TouchEvent) => e.stopPropagation();
    const move = (e: TouchEvent) => {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchstart", stop);
    el.addEventListener("touchmove", move, { passive: false }); // passive would ignore preventDefault
    return () => {
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("touchmove", move);
    };
  }, [active]);
}

/**
 * `bubble` is the bubble's button: the view is its `.rz-root`. `active`: the bubble is shown (it is not while there
 * are no timers). `cooking`: the footer of cooking mode is there and the bubble stays above it.
 */
export function useBubblePlace(bubble: RefObject<HTMLElement>, active: boolean, cooking: boolean, store?: LocalStore) {
  const m = useMeasure(bubble, active, cooking);
  const [anchor, setAnchor] = useState<Anchor | undefined>(() => parseAnchor(store?.load()));
  const [drag, setDrag] = useState<Point | undefined>();
  const press = useRef<{ x: number; y: number; from: Point; moved: boolean } | null>(null);
  const skipClickUntil = useRef(0);
  const latest = useRef({ m, drag });
  latest.current = { m, drag };
  useOwnTouches(bubble, active);

  // The bubble goes away (last timer stopped) in the middle of a drag: nothing stays pressed.
  useEffect(() => {
    if (active) return;
    press.current = null;
    setDrag(undefined);
  }, [active]);

  // The first frame after the measurement shows the bubble at its place without gliding there.
  const ready = m.view.w > 0 && m.view.h > 0;
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!ready) return setSettled(false);
    const win = bubble.current?.ownerDocument.defaultView ?? window;
    const id = win.requestAnimationFrame(() => setSettled(true));
    return () => win.cancelAnimationFrame(id);
  }, [ready]);

  const rest: Point = anchor ? fromAnchor(anchor, SIZE, m.view, m.insets) : defaultPoint(SIZE, m.view, m.insets);
  const point = clampPoint(drag ?? rest, SIZE, m.view, m.insets);

  const end = (el: HTMLElement | null, id: number, release: boolean) => {
    const p = press.current;
    press.current = null;
    if (el?.hasPointerCapture?.(id)) el.releasePointerCapture(id);
    if (!p?.moved || !release) return setDrag(undefined); // a tap, or a drag that was cancelled: back to where it was
    const { m: now, drag: at } = latest.current;
    const next = toAnchor(snapToEdge(at ?? p.from, SIZE, now.view, now.insets), SIZE, now.view, now.insets);
    setAnchor(next);
    setDrag(undefined);
    skipClickUntil.current = Date.now() + CLICK_AFTER_DRAG_MS; // the click that follows the release must not open the list
    try {
      store?.save(next);
    } catch {
      // no storage: the bubble keeps its place until the view closes
    }
  };
  const cancel = (e: PointerEvent) => end(e.currentTarget as HTMLElement, e.pointerId, false);

  return {
    view: m.view,
    insets: m.insets,
    /** The view is measured; before that the bubble would show at a wrong place for a moment. */
    ready,
    /** No gliding: until the first frame after the measurement. */
    instant: !settled,
    point,
    moving: drag !== undefined,
    /** Props for the bubble button. */
    handlers: {
      onPointerDown: (e: PointerEvent) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        skipClickUntil.current = 0;
        press.current = { x: e.clientX, y: e.clientY, from: point, moved: false };
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      },
      onPointerMove: (e: PointerEvent) => {
        const p = press.current;
        if (!p) return;
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        if (!p.moved && !isDrag(dx, dy)) return;
        p.moved = true;
        setDrag(clampPoint({ x: p.from.x + dx, y: p.from.y + dy }, SIZE, m.view, m.insets));
      },
      onPointerUp: (e: PointerEvent) => end(e.currentTarget as HTMLElement, e.pointerId, true),
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
      onKeyDown: () => {
        skipClickUntil.current = 0; // Enter and Space click without a pointer: never a leftover of a drag
      },
    },
    /** True once for the click that ends a drag. */
    takeSkippedClick: () => {
      const skip = Date.now() < skipClickUntil.current;
      skipClickUntil.current = 0;
      return skip;
    },
  };
}
