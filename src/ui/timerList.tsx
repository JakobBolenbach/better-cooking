// The opened list of the timers (issue #58, #154): a card next to the bubble with every timer and its controls.
import type { Ref } from "preact";
import { timer as clock } from "../cooking";
import { isPaused, isRinging, remaining, type Timer } from "../timers";
import { Icon } from "./icons";
import { tr } from "../i18n";

export function TimerList({
  id,
  panelRef,
  style,
  moving,
  focus,
  timers,
  now,
  onClose,
  onToggle,
  onPlusMinute,
  onStop,
}: {
  id: string;
  panelRef: Ref<HTMLDivElement>;
  style: Record<string, string | undefined>;
  moving: boolean;
  focus: { onFocusIn: () => void; onFocusOut: (e: FocusEvent) => void };
  timers: Timer[];
  now: number;
  onClose: () => void;
  onToggle: (id: string) => void;
  onPlusMinute: (id: string) => void;
  onStop: (id: string) => void;
}) {
  return (
    <div
      id={id}
      class={`rz-uhren${moving ? " bewegt" : ""}`}
      role="region"
      aria-label={tr("timers")}
      ref={panelRef}
      style={style}
      {...focus}
    >
      <div class="rz-uhren-kopf">
        <span>{tr("timers")}</span>
        <button type="button" class="rz-symbol" aria-label={tr("close")} onClick={onClose}>
          <Icon n="x" large={16} />
        </button>
      </div>
      <Bar timers={timers} now={now} onToggle={onToggle} onPlusMinute={onPlusMinute} onStop={onStop} />
    </div>
  );
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
  return (
    <>
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
    </>
  );
}
