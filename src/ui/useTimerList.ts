// Behaviour of the opened timer list (issue #154): it closes with the last timer and with a tap outside, reports its
// height for placing it next to the bubble, and gives the focus back to the bubble when it closes from inside.
import type { RefObject } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { INTERACTIVE } from "./useTapZones";

/**
 * Is the target text on the stage of cooking mode, not a button, link or field? Only such a tap is swallowed.
 * Like the tap zones, "interactive" counts only inside the stage: the view and its parents carry tabindex
 * themselves. Anything outside the stage (sidebars, other leaves, Obsidian's own elements) is never stopped.
 */
function onlyText(from: Element | null, target: Element | null): boolean {
  const stage = from?.closest(".rz-root")?.querySelector(".rz-koch-buehne");
  if (!stage || !target || !stage.contains(target)) return false;
  const hit = target.closest(INTERACTIVE);
  return !(hit && hit !== stage && stage.contains(hit));
}

export function useTimerList(o: {
  bubble: RefObject<HTMLElement>;
  panel: RefObject<HTMLElement>;
  open: boolean;
  onOpen: (open: boolean) => void;
  /** There is at least one timer. */
  any: boolean;
  /** Cooking mode: a tap outside that only closes the list does not turn the step. */
  cooking: boolean;
}) {
  const { bubble, panel, open, onOpen, any, cooking } = o;
  const [height, setHeight] = useState(0);
  const focusIn = useRef(false);

  // The last timer is gone: the list closes with it.
  useEffect(() => {
    if (!any && open) onOpen(false);
  }, [any, open]);

  // A tap outside closes the list. In cooking mode a tap on the text (not on a button or link) does only that: the
  // press does not reach the tap zones, so the step stays (src/ui/useTapZones.ts decides on the press it sees).
  useEffect(() => {
    const doc = bubble.current?.ownerDocument;
    if (!open || !doc) return;
    const away = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && (bubble.current?.contains(target) || panel.current?.contains(target))) return;
      focusIn.current = false; // the focus goes where the tap puts it, not back to the bubble
      if (cooking && onlyText(bubble.current, target as Element | null)) e.stopPropagation();
      onOpen(false);
    };
    doc.addEventListener("pointerdown", away, true);
    return () => doc.removeEventListener("pointerdown", away, true);
  }, [open, cooking]);

  // Height of the list, to place it next to the bubble (measured before the first paint).
  useLayoutEffect(() => {
    const el = panel.current;
    if (!open || !el) return;
    const set = () => setHeight(Math.round(el.getBoundingClientRect().height));
    set();
    const watch = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(set);
    watch?.observe(el);
    return () => watch?.disconnect();
  }, [open]);

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
