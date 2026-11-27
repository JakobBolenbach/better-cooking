// The timer bubble (issue #154): a small round button with the remaining time of the next timer, a ring for the
// progress, a badge for the further timers and an alarm look when one is over. It opens the list (src/ui/timerBar.tsx).
import type { Ref } from "preact";
import { isPaused, isRinging, leftShare, remaining, type Timer } from "../timers";
import { bubbleTime } from "../timerBubble";
import { tr } from "../i18n";

/** Name for screen readers: the next timer with its time, and how many more there are. */
export function bubbleLabel(next: Timer, more: number, now: number): string {
  const text = isRinging(next)
    ? tr("timerBubbleOver", { label: next.label })
    : tr("timerBubble", { time: bubbleTime(remaining(next, now)), label: next.label });
  return more > 0 ? tr("timerBubbleMore", { text, n: more }) : text;
}

export function TimerBubble({
  next,
  more,
  now,
  open,
  moving,
  at,
  buttonRef,
  handlers,
  onClick,
}: {
  /** The timer shown: the first of the sorted list. */
  next: Timer;
  /** How many timers there are besides it. */
  more: number;
  now: number;
  open: boolean;
  moving: boolean;
  at: { x: number; y: number };
  buttonRef: Ref<HTMLButtonElement>;
  handlers: Record<string, (e: PointerEvent) => void>;
  onClick: () => void;
}) {
  const over = isRinging(next);
  const share = leftShare(next, now);
  return (
    <button
      type="button"
      ref={buttonRef}
      class={`rz-kugel${over ? " fertig" : ""}${isPaused(next) ? " pause" : ""}${moving ? " bewegt" : ""}`}
      style={{ left: `${at.x}px`, top: `${at.y}px` }}
      aria-label={bubbleLabel(next, more, now)}
      aria-expanded={open}
      aria-controls="rz-uhren-liste"
      onClick={onClick}
      {...handlers}
    >
      <svg class="rz-kugel-ring" viewBox="0 0 56 56" aria-hidden="true">
        <circle class="rz-kugel-spur" cx="28" cy="28" r="24" pathLength="100" />
        <circle
          class="rz-kugel-fortschritt"
          cx="28"
          cy="28"
          r="24"
          pathLength="100"
          stroke-dasharray={`${(share ?? 1) * 100} 100`}
        />
      </svg>
      <span class="rz-kugel-zeit">{over ? tr("done") : bubbleTime(remaining(next, now))}</span>
      {more > 0 && (
        <span class="rz-kugel-zahl" aria-hidden="true">
          +{more}
        </span>
      )}
    </button>
  );
}
