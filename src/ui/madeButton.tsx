// "Made today" button with the date of the last time as second text and a short window to undo a mistaken click (issue #45).
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useEffect, useState } from "preact/hooks";
import { todayIso } from "../parse";
import { Icon } from "./icons";
import { formatDate, tr } from "../i18n";

/** How long the button offers "Undo" after a click. */
export const UNDO_MS = 10_000;
/** Clicks on "Undo" this soon after the first click are a double click and ignored. */
export const DOUBLE_CLICK_MS = 600;

/**
 * `onMade` writes today's date, `onUndo` takes that click back (the view keeps what was there before, see
 * src/madeUndo.ts). Give the button a `key` per recipe, so the Undo offer does not move to another recipe.
 */
export function MadeButton({
  lastMade,
  onMade,
  onUndo,
}: {
  lastMade?: string;
  onMade: () => void;
  onUndo: () => void;
}) {
  const [clickedAt, setClickedAt] = useState<number | null>(null);
  useEffect(() => {
    if (clickedAt === null) return;
    const timer = window.setTimeout(() => setClickedAt(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [clickedAt]);
  if (clickedAt !== null) {
    return (
      <button
        type="button"
        class="rz-knopf"
        onClick={(ev) => {
          if (ev.detail > 1 || Date.now() - clickedAt < DOUBLE_CLICK_MS) return;
          setClickedAt(null);
          onUndo();
        }}
      >
        <Icon n="zurueck" large={16} />
        <span class="rz-knopf-text">
          {tr("undo")}
          <small>{tr("madeToday")}</small>
        </span>
      </button>
    );
  }
  const alreadyToday = lastMade === todayIso();
  return (
    <button
      type="button"
      class="rz-knopf"
      disabled={alreadyToday}
      onClick={() => {
        setClickedAt(Date.now());
        onMade();
      }}
    >
      <Icon n="gemacht" large={16} />
      <span class="rz-knopf-text">
        {tr("madeToday")}
        {lastMade && !alreadyToday && <small>{tr("lastMadeOn", { date: formatDate(lastMade) })}</small>}
      </span>
    </button>
  );
}
