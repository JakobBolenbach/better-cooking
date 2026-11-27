// The timers of the view (issue #58, #154): a small bubble with the next timer that opens to the list of all timers
// (pause, one more minute, stop). It floats over cooking mode and every other page and can be moved. The timers
// themselves live in the plugin (src/timerService.ts).
import { useId, useRef } from "preact/hooks";
import { isRinging } from "../timers";
import { BUBBLE_SIZE, panelLimits, placePanel } from "../timerBubble";
import type { TimerApi } from "../timerStore";
import { useTimers } from "./useTimers";
import { useBubblePlace, type DeviceStore } from "./useBubblePlace";
import { useTimerList } from "./useTimerList";
import { TimerBubble } from "./timerBubble";
import { TimerList } from "./timerList";

/**
 * The bubble and the list for the timers of the plugin; nothing while there are none. The one-second tick of the
 * display lives here. `open` is held by the App, so that Esc can close the list like any other layer.
 */
export function TimerBar(p: {
  api: TimerApi;
  open: boolean;
  onOpen: (open: boolean) => void;
  /** Where the position is kept per device; unset: it is not kept. */
  store?: DeviceStore;
  /** Cooking mode is open: the bubble stays above its footer, and a tap outside the list does not turn the step. */
  cooking: boolean;
}) {
  const t = useTimers(p.api);
  const any = t.timers.length > 0;
  const bubble = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  const place = useBubblePlace(bubble, any, p.cooking, p.store);
  const list = useTimerList({ bubble, panel, open: p.open, onOpen: p.onOpen, any, cooking: p.cooking });
  if (!any) return null;
  const next = t.timers[0];
  const limits = panelLimits(place.view, place.insets);
  const at = placePanel(
    place.point,
    { w: BUBBLE_SIZE, h: BUBBLE_SIZE },
    { w: limits.width, h: list.height },
    place.view,
    place.insets,
  );
  const tap = () => {
    if (place.takeSkippedClick()) return;
    if (isRinging(next)) {
      t.stop(next.id); // a tap on the ringing bubble stops the alarm at once, then shows what is left
      p.onOpen(true);
    } else p.onOpen(!p.open);
  };
  return (
    <>
      <TimerBubble
        next={next}
        more={t.timers.length - 1}
        now={t.now}
        open={p.open}
        moving={place.moving}
        ready={place.ready}
        at={place.point}
        listId={listId}
        buttonRef={bubble}
        handlers={place.handlers}
        onClick={tap}
      />
      {p.open && (
        <TimerList
          id={listId}
          panelRef={panel}
          style={{
            left: `${at.x}px`,
            top: `${at.y}px`,
            width: limits.width > 0 ? `${limits.width}px` : undefined,
            maxHeight: limits.maxHeight > 0 ? `${limits.maxHeight}px` : undefined,
            visibility: place.ready ? undefined : "hidden",
          }}
          moving={place.moving}
          focus={list.focus}
          timers={t.timers}
          now={t.now}
          onClose={() => p.onOpen(false)}
          onToggle={t.toggle}
          onPlusMinute={t.plusMinute}
          onStop={t.stop}
        />
      )}
    </>
  );
}
