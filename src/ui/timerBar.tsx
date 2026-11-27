// The timer bar: every timer as a pill with the remaining time, pause, one more minute and stop. It floats over the
// cooking mode and every other page of the view; the timers themselves live in the plugin (src/timerService.ts).
import { useEffect, useRef } from "preact/hooks";
import { timer as clock } from "../cooking";
import { isPaused, isRinging, remaining, type Timer } from "../timers";
import type { TimerApi } from "../timerStore";
import { useTimers } from "./useTimers";
import { Icon } from "./icons";
import { tr } from "../i18n";
import { setCssVar } from "../cssProps";

/** The bar for the timers of the plugin; nothing while there are none. The one-second tick of the display lives here. */
export function TimerBar({ api }: { api: TimerApi }) {
  const t = useTimers(api);
  if (!t.timers.length) return null;
  return <Bar timers={t.timers} now={t.now} onToggle={t.toggle} onPlusMinute={t.plusMinute} onStop={t.stop} />;
}

function Bar({
  timers,
  now,
  onToggle,
  onPlusMinute,
  onStop,
}: {
  timers: Timer[];
  now: number;
  /** Pause a running timer, continue a paused one. */
  onToggle: (id: string) => void;
  onPlusMinute: (id: string) => void;
  onStop: (id: string) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  // Tell the page behind (cooking step, recipe page) how tall the bar is, so its text can scroll above it.
  useEffect(() => {
    const el = bar.current;
    const root = el?.closest<HTMLElement>(".rz-root");
    if (!el || !root) return;
    const set = () => setCssVar(root, "--rz-uhren", `${Math.round(el.getBoundingClientRect().height)}px`);
    set();
    const watch = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(set);
    watch?.observe(el);
    return () => {
      watch?.disconnect();
      setCssVar(root, "--rz-uhren", ""); // empty value removes the variable
    };
  }, []);
  return (
    <div class="rz-uhren" role="region" aria-label={tr("timers")} ref={bar}>
      {timers.map((u) => {
        const over = isRinging(u);
        const paused = isPaused(u);
        return (
          <div key={u.id} class={`rz-uhr${over ? " fertig" : ""}${paused ? " pause" : ""}`}>
            <Icon n="timer" large={16} />
            <span class="rz-uhr-text">
              <span class="rz-uhr-zeit">{over ? tr("done") : clock(remaining(u, now) / 1000)}</span>
              <span class="rz-uhr-titel">{u.label}</span>
            </span>
            {!over && (
              <button
                type="button"
                class="rz-symbol"
                aria-label={`${paused ? tr("resume") : tr("pause")}: ${u.label}`}
                onClick={() => onToggle(u.id)}
              >
                <Icon n={paused ? "play" : "pause"} large={16} />
              </button>
            )}
            <button
              type="button"
              class="rz-uhr-knopf"
              aria-label={`${tr("timerPlusMinute")} ${u.label}`}
              onClick={() => onPlusMinute(u.id)}
            >
              {tr("timerPlusMinute")}
            </button>
            {over ? (
              <button
                type="button"
                class="rz-uhr-knopf rz-uhr-stopp"
                aria-label={`${tr("timerStop")}: ${u.label}`}
                onClick={() => onStop(u.id)}
              >
                {tr("timerStop")}
              </button>
            ) : (
              <button
                type="button"
                class="rz-symbol"
                aria-label={`${tr("removeTimer")}: ${u.label}`}
                onClick={() => onStop(u.id)}
              >
                <Icon n="x" large={16} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
