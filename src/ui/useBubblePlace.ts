// Where the timer bubble sits and how it is moved (issue #154): measures the view, follows a drag with mouse and touch
// (pointer events), snaps to a side edge on release and remembers the spot per device. The geometry is in src/timerBubble.ts.
import type { RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  BUBBLE_SIZE,
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

/** Where the position is kept: on the device, not in the synced settings. Both calls must not throw. */
export interface DeviceStore {
  load(): unknown;
  save(value: unknown): void;
}

const SIZE: Box = { w: BUBBLE_SIZE, h: BUBBLE_SIZE };
const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const px = (el: HTMLElement, name: string, fallback: number) => {
  const v = parseFloat(el.ownerDocument.defaultView?.getComputedStyle(el).getPropertyValue(name) ?? "");
  return Number.isFinite(v) ? v : fallback;
};

/** The view the bubble floats in and what it keeps free: size, safe areas and keyboard, and the height of the cooking footer. */
function measure(root: HTMLElement) {
  const view: Box = { w: root.clientWidth, h: root.clientHeight };
  const insets: Insets = {
    top: 0,
    right: px(root, "--rz-rechts", 0),
    bottom: px(root, "--rz-unten", 0),
    left: px(root, "--rz-links", 0),
  };
  return { view, insets, reserve: px(root, "--rz-koch-fuss", 84) };
}

/** Size, safe areas and footer height of the view; measured again when the view changes size (window, rotation) or the safe areas and the keyboard change its variables. */
function useMeasure(bubble: RefObject<HTMLElement>, active: boolean) {
  const [m, setM] = useState({ view: { w: 0, h: 0 }, insets: NO_INSETS, reserve: 84 });
  useEffect(() => {
    const el = bubble.current?.closest<HTMLElement>(".rz-root");
    if (!el) return;
    const read = () => {
      const n = measure(el);
      setM((o) => (JSON.stringify(o) === JSON.stringify(n) ? o : n));
    };
    read();
    const win = el.ownerDocument.defaultView ?? window;
    const size = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(read);
    size?.observe(el);
    const style = typeof MutationObserver === "undefined" ? undefined : new MutationObserver(read);
    style?.observe(el, { attributes: true, attributeFilter: ["style"] });
    win.addEventListener("resize", read);
    return () => {
      size?.disconnect();
      style?.disconnect();
      win.removeEventListener("resize", read);
    };
  }, [active]);

  return m;
}

/** `bubble` is the bubble's button: the view is its `.rz-root`. `active`: the bubble is shown (it is not while there are no timers). */
export function useBubblePlace(bubble: RefObject<HTMLElement>, active: boolean, store?: DeviceStore) {
  const m = useMeasure(bubble, active);
  const [anchor, setAnchor] = useState<Anchor | undefined>(() => parseAnchor(store?.load()));
  const [drag, setDrag] = useState<Point | undefined>();
  const press = useRef<{ x: number; y: number; from: Point; moved: boolean } | null>(null);
  const skipClick = useRef(false);
  const latest = useRef({ m, anchor, drag });
  latest.current = { m, anchor, drag };

  const rest = (a: Anchor | undefined): Point =>
    a ? fromAnchor(a, SIZE, m.view, m.insets) : defaultPoint(SIZE, m.view, m.insets, m.reserve);
  const point = clampPoint(drag ?? rest(anchor), SIZE, m.view, m.insets);

  const end = (el: HTMLElement | null, id: number, release: boolean) => {
    const p = press.current;
    press.current = null;
    if (el?.hasPointerCapture?.(id)) el.releasePointerCapture(id);
    if (!p?.moved || !release) return setDrag(undefined);
    const { m: now, drag: at } = latest.current;
    const snapped = snapToEdge(at ?? p.from, SIZE, now.view, now.insets);
    const next = toAnchor(snapped, SIZE, now.view, now.insets);
    setAnchor(next);
    setDrag(undefined);
    skipClick.current = true; // the click that follows the release must not open the list
    try {
      store?.save(next);
    } catch {
      // no storage: the bubble keeps its place until the view closes
    }
  };

  return {
    view: m.view,
    insets: m.insets,
    point,
    moving: drag !== undefined,
    /** Props for the bubble button. */
    handlers: {
      onPointerDown: (e: PointerEvent) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        skipClick.current = false;
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
      onPointerCancel: (e: PointerEvent) => end(e.currentTarget as HTMLElement, e.pointerId, false),
    },
    /** True once for the click that ends a drag. */
    takeSkippedClick: () => {
      const s = skipClick.current;
      skipClick.current = false;
      return s;
    },
  };
}
