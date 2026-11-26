// "Made today" button with the date of the last time as second text and a short window to undo a mistaken click (issue #45).
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useEffect, useState } from "preact/hooks";
import { todayIso } from "../parse";
import { Icon } from "./icons";
import { formatDate, tr } from "../i18n";

/** How long the button offers "Undo" after a click. */
export const UNDO_MS = 10_000;

/**
 * `onMade(date)` writes `lastMade`: today's date on a click, the previous date (or `null` = remove the field,
 * if there was none) on "Undo". The previous value is kept here, so it survives the note being re-read.
 */
export function MadeButton({
  path,
  lastMade,
  onMade,
}: {
  path: string;
  lastMade?: string;
  onMade: (date: string | null) => void;
}) {
  const [undo, setUndo] = useState<{ path: string; previous: string | null } | null>(null);
  const undoable = undo?.path === path ? undo : null;
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [undo]);
  const today = todayIso();
  if (undoable) {
    return (
      <button
        type="button"
        class="rz-knopf rz-knopf-zweizeilig"
        onClick={() => {
          onMade(undoable.previous);
          setUndo(null);
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
  const alreadyToday = lastMade === today;
  return (
    <button
      type="button"
      class="rz-knopf rz-knopf-zweizeilig"
      disabled={alreadyToday}
      onClick={() => {
        setUndo({ path, previous: lastMade ?? null });
        onMade(today);
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
