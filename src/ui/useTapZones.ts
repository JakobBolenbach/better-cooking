// DOM side of the tap zones in cooking mode (rules: src/tapZones.ts). Remembers the pointer data of a press and
// decides on `pointerup`. The synthetic click proved unreliable in Obsidian on iPhone (issue #81), so the tap is not
// decided on it. A scroll or a long press ends in pointercancel and never gets there. A tap that changed the step
// expects one ghost click at that spot; it is swallowed so it cannot land on a button that appears there with the
// new step. One listener on the document serves all expected clicks; a new press drops them, unmount removes all.
import { useEffect, useRef, useState } from "preact/hooks";
import { isTrusted } from "./trusted";
import { ghostIndex, tapAction, TAP_GHOST_MS, type Direction, type ExpectedClick } from "../tapZones";

/** Small controls that keep their own tap: buttons (timer chips, checkable ingredients), links, fields, labels. */
export const INTERACTIVE =
  'button, a, input, select, textarea, summary, label, [role="button"], [contenteditable], [tabindex]';

/** How long the pulse stays (ms), a little longer than its CSS animation. */
const PULSE_MS = 450;

export interface TapPulse {
  side: Direction;
  id: number;
  top: number;
  height: number;
}

interface Press {
  x: number;
  y: number;
  t: number;
  pointerType: string;
  target: Element | null;
  multi: boolean;
  selection: boolean;
}

/** `onTap` returns whether the step changed; only then the pulse shows. */
export function useTapZones(onTap: (d: Direction) => boolean) {
  const area = useRef<HTMLDivElement>(null);
  const press = useRef<Press | null>(null);
  const scrollAt = useRef<number | null>(null);
  const [pulse, setPulse] = useState<TapPulse | null>(null);
  const counter = useRef(0);
  const ghosts = useRef<ExpectedClick[]>([]);

  // Capture phase on the document: swallow the ghost click before it reaches a button; a new finger drops the rest.
  useEffect(() => {
    const doc = area.current?.ownerDocument;
    if (!doc) return;
    const onClick = (e: MouseEvent) => {
      const i = ghostIndex(ghosts.current, {
        x: e.clientX,
        y: e.clientY,
        detail: e.detail,
        trusted: isTrusted(e),
        at: e.timeStamp,
      });
      if (i < 0) return;
      ghosts.current.splice(i, 1);
      e.preventDefault();
      e.stopPropagation();
    };
    const onDown = () => {
      ghosts.current = [];
    };
    doc.addEventListener("click", onClick, true);
    doc.addEventListener("pointerdown", onDown, true);
    return () => {
      doc.removeEventListener("click", onClick, true);
      doc.removeEventListener("pointerdown", onDown, true);
      ghosts.current = [];
    };
  }, []);

  useEffect(() => {
    if (!pulse) return;
    const t = window.setTimeout(() => setPulse(null), PULSE_MS);
    return () => window.clearTimeout(t);
  }, [pulse]);

  const selected = () => !!area.current?.ownerDocument.getSelection()?.toString();
  return {
    area,
    pulse,
    handlers: {
      onPointerDown: (e: PointerEvent) => {
        // A second finger spoils the press of the first one.
        if (!e.isPrimary) {
          if (press.current) press.current.multi = true;
          return;
        }
        press.current = {
          x: e.clientX,
          y: e.clientY,
          t: e.timeStamp,
          pointerType: e.pointerType,
          target: e.target as Element | null,
          multi: false,
          selection: selected(),
        };
      },
      onPointerUp: (e: PointerEvent) => {
        const start = press.current;
        press.current = null;
        const el = area.current;
        if (!start || !el || !e.isPrimary) return;
        const box = el.getBoundingClientRect();
        const hit = start.target?.closest(INTERACTIVE);
        const action = tapAction({
          pointerType: start.pointerType,
          down: start,
          up: { x: e.clientX, y: e.clientY, t: e.timeStamp },
          left: box.left,
          width: box.width,
          button: e.button,
          multiTouch: start.multi,
          interactive: !!hit && el.contains(hit),
          targets: Array.from(el.querySelectorAll(INTERACTIVE)).map((x) => x.getBoundingClientRect()),
          selection: start.selection || selected(),
          scrollAt: scrollAt.current,
        });
        if (!action || !onTap(action)) return;
        ghosts.current.push({ x: e.clientX, y: e.clientY, until: e.timeStamp + TAP_GHOST_MS });
        setPulse({ side: action, id: ++counter.current, top: el.offsetTop, height: el.offsetHeight });
      },
      onPointerCancel: () => {
        press.current = null;
      },
      onScroll: (e: Event) => {
        scrollAt.current = e.timeStamp;
      },
    },
  };
}
