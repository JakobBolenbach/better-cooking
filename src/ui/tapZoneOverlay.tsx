// Pulse on the tapped side and the one-time hint of the tap zones in cooking mode. Neither takes touches nor focus.
import { useEffect, useState } from "preact/hooks";
import { tr } from "../i18n";
import type { TapPulse } from "./useTapZones";

const HINT_MS = 5000;

export function TapZoneOverlay(p: {
  area: { current: HTMLElement | null };
  pulse: TapPulse | null;
  /** The hint was shown before (saved in the settings). */
  hintSeen?: boolean;
  onHintSeen?: () => void;
}) {
  const [hintTop, setHintTop] = useState<number | null>(null);
  useEffect(() => {
    if (p.hintSeen) return;
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
