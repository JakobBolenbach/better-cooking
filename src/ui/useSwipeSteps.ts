// Swiping sideways in the step area of cooking mode: to the left goes on, to the right goes back (rules:
// src/tapZones.ts). The area has `touch-action: pan-y`, so the browser leaves horizontal moves to us and only takes
// vertical ones for scrolling (those end in pointercancel, which is judged like an end). A mouse does not swipe; the outermost strip is left to
// Obsidian's edge gestures.
import { useEffect, useRef } from "preact/hooks";
import { inEdge, swipeDirection, type Direction } from "../tapZones";

export function useSwipeSteps(area: { current: HTMLElement | null }, onSwipe: (d: Direction) => void) {
  const latest = useRef(onSwipe);
  latest.current = onSwipe;
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    let from: { x: number; y: number; id: number } | null = null;
    let to = { x: 0, y: 0 };
    const down = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      from =
        e.isPrimary && e.pointerType !== "mouse" && !inEdge(e.clientX, box.left, box.width)
          ? { x: e.clientX, y: e.clientY, id: e.pointerId }
          : null;
      to = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (from && e.pointerId === from.id) to = { x: e.clientX, y: e.clientY };
    };
    // Judge by the last position seen; pointercancel carries no useful position of its own.
    const end = () => {
      if (!from) return;
      const d = swipeDirection(to.x - from.x, to.y - from.y);
      from = null;
      if (d) latest.current(d);
    };
    const up = (e: PointerEvent) => {
      move(e);
      end();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", end);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", end);
    };
  }, []);
}
