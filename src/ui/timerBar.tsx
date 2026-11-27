// The timers of the view (issue #58, #154): a small bubble with the next timer that opens to the list of all timers
// (pause, one more minute, stop). It floats over cooking mode and every other page and can be moved. The timers
// themselves live in the plugin (src/timerService.ts).
import { useRef } from "preact/hooks";
import { timer as clock } from "../cooking";
import { isPaused, isRinging, remaining, type Timer } from "../timers";
import { BUBBLE_SIZE, placePanel } from "../timerBubble";
import type { TimerApi } from "../timerStore";
import { useTimers } from "./useTimers";
import { useBubblePlace, type DeviceStore } from "./useBubblePlace";
import { useTimerList } from "./useTimerList";
import { TimerBubble } from "./timerBubble";
import { Icon } from "./icons";
import { tr } from "../i18n";

const PANEL_WIDTH = 420;

/**
 * The bubble and the list for the timers of the plugin; nothing while there are none. The one-second tick of the
 * display lives here. `open` is held by the App, so that Esc can close the list like any other layer.
 */
export function TimerBar({
  api,
  open,
  onOpen,
  store,
}: {
  api: TimerApi;
  open: boolean;
  onOpen: (open: boolean) => void;
  /** Where the position is kept per device; unset: it is not kept. */
  store?: DeviceStore;
}) {
  const t = useTimers(api);
  const any = t.timers.length > 0;
  const bubble = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const place = useBubblePlace(bubble, any, store);
  const list = useTimerList({ bubble, panel, open, onOpen, any, count: t.timers.length });

  if (!any) return null;
  const width = Math.min(PANEL_WIDTH, place.view.w - place.insets.left - place.insets.right - 16);
  const at = placePanel(
    place.point,
    { w: BUBBLE_SIZE, h: BUBBLE_SIZE },
    { w: Math.max(0, width), h: list.height },
    place.view,
    place.insets,
  );
  const maxHeight = place.view.h - place.insets.top - place.insets.bottom - 16;
  return (
    <>
      <TimerBubble
        next={t.timers[0]}
        more={t.timers.length - 1}
        now={t.now}
        open={open}
        moving={place.moving}
        at={place.point}
        buttonRef={bubble}
        handlers={place.handlers}
        onClick={() => !place.takeSkippedClick() && onOpen(!open)}
      />
      {open && (
        <div
          id="rz-uhren-liste"
          class={`rz-uhren${place.moving ? " bewegt" : ""}`}
          role="region"
          aria-label={tr("timers")}
          ref={panel}
          style={{
            left: `${at.x}px`,
            top: `${at.y}px`,
            width: width > 0 ? `${width}px` : undefined,
            maxHeight: maxHeight > 0 ? `${maxHeight}px` : undefined,
          }}
          {...list.focus}
        >
          <div class="rz-uhren-kopf">
            <span>{tr("timers")}</span>
            <button type="button" class="rz-symbol" aria-label={tr("close")} onClick={() => onOpen(false)}>
              <Icon n="x" large={16} />
            </button>
          </div>
          <Bar timers={t.timers} now={t.now} onToggle={t.toggle} onPlusMinute={t.plusMinute} onStop={t.stop} />
        </div>
      )}
    </>
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
