// Swiping sideways in cooking mode: to the left goes on, to the right goes back (rules: src/tapZones.ts).
import { useRef } from "preact/hooks";
import { swipeDirection, type Direction } from "../tapZones";

/** Pointer handlers for the swipe; a mouse does not swipe (it has buttons and the arrow keys). */
export function useSwipeSteps(onSwipe: (d: Direction) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType !== "mouse") start.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: PointerEvent) => {
      const w = start.current;
      start.current = null;
      const d = w && swipeDirection(e.clientX - w.x, e.clientY - w.y);
      if (d) onSwipe(d);
    },
  };
}
