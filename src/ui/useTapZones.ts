// DOM side of the tap zones in cooking mode (rules: src/tapZones.ts). Remembers the pointer data of a press and
// decides on the `click` that follows it: a scroll or a long press ends in pointercancel and never gets there, and
// a click without a press of its own (keyboard, assistive technology) is ignored.
import { useEffect, useRef, useState } from "preact/hooks";
import { tapAction, TAP_CLICK_MS, type Direction } from "../tapZones";

/** Elements that keep their own tap: buttons, links, fields, timer chips, the ingredient lists. */
const INTERACTIVE =
  'button, a, input, select, textarea, summary, label, [role="button"], [contenteditable], [tabindex], .rz-koch-zutaten, .rz-koch-alle-zutaten';

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
  up?: { x: number; y: number; t: number };
}

/** `onTap` returns whether the step changed; only then the pulse shows. */
export function useTapZones(onTap: (d: Direction) => boolean) {
  const area = useRef<HTMLDivElement>(null);
  const press = useRef<Press | null>(null);
  const scrollAt = useRef<number | null>(null);
  const [pulse, setPulse] = useState<TapPulse | null>(null);
  const counter = useRef(0);

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
        if (e.isPrimary && press.current) press.current.up = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      },
      onPointerCancel: () => {
        press.current = null;
      },
      onScroll: (e: Event) => {
        scrollAt.current = e.timeStamp;
      },
      onClick: (e: MouseEvent) => {
        const start = press.current;
        press.current = null;
        const el = area.current;
        // detail 0: a click from the keyboard or assistive technology, not from this press.
        if (!start?.up || !el || e.detail === 0 || e.timeStamp - start.up.t > TAP_CLICK_MS) return;
        const box = el.getBoundingClientRect();
        const hit = start.target?.closest(INTERACTIVE);
        const action = tapAction({
          pointerType: start.pointerType,
          down: start,
          up: start.up,
          left: box.left,
          width: box.width,
          button: 0,
          multiTouch: start.multi,
          interactive: !!hit && el.contains(hit),
          targets: Array.from(el.querySelectorAll(INTERACTIVE)).map((x) => x.getBoundingClientRect()),
          selection: start.selection || selected(),
          scrollAt: scrollAt.current,
        });
        if (action && onTap(action))
          setPulse({ side: action, id: ++counter.current, top: el.offsetTop, height: el.offsetHeight });
      },
    },
  };
}
