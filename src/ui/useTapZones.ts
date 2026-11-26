// DOM side of the tap zones in cooking mode (rules: src/tapZones.ts): collects pointer down/up on the step area,
// asks tapAction and reports the result. Does not touch keyboard handling.
import { useRef, useState } from "preact/hooks";
import { tapAction, type TapAction } from "../tapZones";

/** Elements that keep their own tap: buttons, links, fields, timer chips, the ingredient lists. */
const INTERACTIVE =
  'button, a, input, select, textarea, summary, label, [role="button"], [contenteditable], [tabindex], .rz-koch-zutaten, .rz-koch-alle-zutaten';

export interface TapPulse {
  side: "back" | "next";
  id: number;
  top: number;
  height: number;
}

/** Handlers for the step area, the visual pulse of the tapped side, and the ref of the step area. */
export function useTapZones(onTap: (a: Exclude<TapAction, null>) => void) {
  const area = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; t: number; target: Element | null } | null>(null);
  const fingers = useRef(new Set<number>());
  const multi = useRef(false);
  const [pulse, setPulse] = useState<TapPulse | null>(null);
  const counter = useRef(0);

  const reset = (id: number) => {
    fingers.current.delete(id);
    if (!fingers.current.size) multi.current = false;
  };
  return {
    area,
    pulse,
    handlers: {
      onPointerDown: (e: PointerEvent) => {
        fingers.current.add(e.pointerId);
        if (fingers.current.size > 1) multi.current = true;
        press.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, target: e.target as Element | null };
      },
      onPointerCancel: (e: PointerEvent) => {
        press.current = null;
        reset(e.pointerId);
      },
      onPointerUp: (e: PointerEvent) => {
        const start = press.current;
        const was = multi.current;
        press.current = null;
        reset(e.pointerId);
        const box = area.current?.getBoundingClientRect();
        if (!start || was || !box) return;
        const hit = start.target?.closest(INTERACTIVE);
        const action = tapAction({
          down: start,
          up: { x: e.clientX, y: e.clientY, t: e.timeStamp },
          left: box.left,
          width: box.width,
          button: e.button,
          pointers: was ? 2 : 1,
          interactive: !!hit && !!area.current?.contains(hit),
          selection: !!window.getSelection()?.toString(),
        });
        if (!action) return;
        const el = area.current!;
        setPulse({ side: action, id: ++counter.current, top: el.offsetTop, height: el.offsetHeight });
        onTap(action);
      },
    },
    clearPulse: () => setPulse(null),
  };
}
