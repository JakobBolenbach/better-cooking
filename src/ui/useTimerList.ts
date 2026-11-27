// Behaviour of the opened timer list (issue #154): it closes with the last timer and with a tap outside, reports its
// height for placing it next to the bubble, and gives the focus back to the bubble when it closes from inside.
import type { RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

export function useTimerList(o: {
  bubble: RefObject<HTMLElement>;
  panel: RefObject<HTMLElement>;
  open: boolean;
  onOpen: (open: boolean) => void;
  /** There is at least one timer. */
  any: boolean;
  /** Number of timers (the list changes its height with it). */
  count: number;
}) {
  const { bubble, panel, open, onOpen, any, count } = o;
  const [height, setHeight] = useState(0);
  const focusIn = useRef(false);

  // The last timer is gone: the list closes with it.
  useEffect(() => {
    if (!any && open) onOpen(false);
  }, [any, open]);

  // A tap outside closes the list; the tap itself still reaches what is below.
  useEffect(() => {
    const doc = bubble.current?.ownerDocument;
    if (!open || !doc) return;
    const away = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && (bubble.current?.contains(target) || panel.current?.contains(target))) return;
      onOpen(false);
    };
    doc.addEventListener("pointerdown", away, true);
    return () => doc.removeEventListener("pointerdown", away, true);
  }, [open]);

  // Height of the list, to place it next to the bubble.
  useEffect(() => {
    const el = panel.current;
    if (!open || !el) return;
    const set = () => setHeight(Math.round(el.getBoundingClientRect().height));
    set();
    const watch = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(set);
    watch?.observe(el);
    return () => watch?.disconnect();
  }, [open, count]);

  // Closed from the list (Esc, close button): the focus goes back to the bubble instead of the page.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open && focusIn.current) bubble.current?.focus({ preventScroll: true });
    if (!open) focusIn.current = false;
    wasOpen.current = open;
  }, [open]);

  return {
    height,
    /** Props for the list element: where the focus is. */
    focus: {
      onFocusIn: () => (focusIn.current = true),
      onFocusOut: (e: FocusEvent) => {
        if (!panel.current?.contains(e.relatedTarget as Node | null)) focusIn.current = false;
      },
    },
  };
}
