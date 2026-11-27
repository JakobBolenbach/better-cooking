// Pulse on the tapped side and the one-time hint of the tap zones in cooking mode. Neither takes touches nor focus.
import { useEffect, useState } from "preact/hooks";
import { tr } from "../i18n";
import { hasTouch } from "../tapZones";
import type { TapPulse } from "./useTapZones";

const HINT_MS = 5000;

/** Some pointer of the device is coarse (a touch screen); without it the hint on the tap zones is left out. A pen-only device reports a fine pointer and gets no hint (accepted). */
const browserHasTouch = (): boolean =>
  hasTouch({
    anyCoarse: typeof window.matchMedia === "function" ? window.matchMedia("(any-pointer: coarse)").matches : undefined,
    touchPoints: navigator.maxTouchPoints,
  });

export function TapZoneOverlay(p: {
  area: { current: HTMLElement | null };
  pulse: TapPulse | null;
  /** The hint was shown before (saved in the settings). */
  hintSeen?: boolean;
  onHintSeen?: () => void;
  /** Whether the device can tap (tests pass it; default: asks the browser). Without touch there is no hint. */
  touch?: boolean;
}) {
  const [hintTop, setHintTop] = useState<number | null>(null);
  useEffect(() => {
    // No hint without touch, and it is not marked as seen: that flag counts for all devices (see settingsMerge).
    if (p.hintSeen || !(p.touch ?? browserHasTouch())) return;
    p.onHintSeen?.();
    const el = p.area.current;
    if (el) setHintTop(el.offsetTop + el.offsetHeight - 60);
    const t = window.setTimeout(() => setHintTop(null), HINT_MS);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (p.pulse) setHintTop(null);
  }, [p.pulse]);
  return (
    <>
      {p.pulse && (
        <div
          key={p.pulse.id}
          class={`rz-koch-puls ${p.pulse.side === "back" ? "links" : "rechts"}`}
          style={{ top: `${p.pulse.top}px`, height: `${p.pulse.height}px` }}
          aria-hidden="true"
        />
      )}
      {hintTop !== null && (
        <div class="rz-koch-tipp" style={{ top: `${hintTop}px` }} aria-hidden="true">
          {tr("tapZonesHint")}
        </div>
      )}
    </>
  );
}
