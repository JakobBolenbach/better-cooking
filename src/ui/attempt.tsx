// Modal for writing down an attempt.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";
import { todayIso, isoToGerman, parseDateInput } from "../parse";
import type { RecipeView } from "../types";
import { Modal, Stars } from "./shared";
import { Icon } from "./icons";
import { formatDate, tr } from "../i18n";

export interface AttemptInput {
  /** The date as the note writes it (DD.MM.YYYY). */
  date: string;
  /** The same date as YYYY-MM-DD, for `lastMade`. */
  iso: string;
  modified: string;
  result: string;
  rating?: number;
  asRating: boolean;
  made: boolean;
}

export function AttemptModal({
  r,
  onCloseView,
  onSave,
  onDirty,
}: {
  r: RecipeView;
  /** Reports whether the user has typed something (the page does not change over it without a word). */
  onDirty?: (dirty: boolean) => void;
  onCloseView: () => void;
  onSave: (v: AttemptInput) => Promise<void>;
}) {
  const [v, setV] = useState<Omit<AttemptInput, "iso">>({
    date: formatDate(todayIso()), // shown in the interface language; saved as DD.MM.YYYY (see onSave below)
    modified: "",
    result: "",
    asRating: !r.rating,
    made: true,
  });
  const [running, setRunning] = useState(false);
  useEffect(() => {
    onDirty?.(!!v.modified.trim() || !!v.result.trim() || v.rating !== undefined);
  }, [v]);
  useEffect(() => () => onDirty?.(false), []);
  const iso = parseDateInput(v.date);
  const field = (k: "modified" | "result") => (ev: JSX.TargetedEvent<HTMLTextAreaElement>) =>
    setV({ ...v, [k]: (ev.target as HTMLTextAreaElement).value });
  return (
    <Modal
      title={tr("noteAttempt")}
      onCloseView={onCloseView}
      id="rz-versuch-titel"
      footer={
        <>
          <button type="button" class="rz-knopf" onClick={onCloseView}>
            {tr("cancel")}
          </button>
          <button
            type="button"
            class="rz-knopf rz-knopf-haupt"
            disabled={running || !iso}
            onClick={() =>
              void (async () => {
                if (!iso) return;
                setRunning(true);
                await onSave({ ...v, iso, date: isoToGerman(iso) });
                setRunning(false);
              })()
            }
          >
            <Icon n="haken" large={16} />
            {tr("save")}
          </button>
        </>
      }
    >
      <p class="rz-leise">{r.title}</p>
      <label class="rz-feld">
        <span class="rz-feld-name">{tr("date")}</span>
        <input
          type="text"
          value={v.date}
          aria-invalid={!iso}
          aria-describedby={iso ? undefined : "rz-versuch-datum-hinweis"}
          onInput={(ev) => setV({ ...v, date: (ev.target as HTMLInputElement).value })}
        />
        {!iso && (
          <span id="rz-versuch-datum-hinweis" class="rz-leise" role="alert">
            {tr("dateInvalid")}
          </span>
        )}
      </label>
      <label class="rz-feld">
        <span class="rz-feld-name">{tr("whatChanged")}</span>
        <textarea rows={2} placeholder={tr("whatChangedPlaceholder")} value={v.modified} onInput={field("modified")} />
      </label>
      <label class="rz-feld">
        <span class="rz-feld-name">{tr("howWas")}</span>
        <textarea rows={2} placeholder={tr("howWasPlaceholder")} value={v.result} onInput={field("result")} />
      </label>
      <div class="rz-feld">
        <span class="rz-feld-name">{tr("attemptRating")}</span>
        <Stars value={v.rating} onValue={(n) => setV({ ...v, rating: n ?? undefined })} large />
      </div>
      <label class="rz-haken-zeile">
        <input
          type="checkbox"
          checked={v.asRating}
          onChange={(ev) => setV({ ...v, asRating: (ev.target as HTMLInputElement).checked })}
        />
        {tr("useAsRecipeRating")}
      </label>
      <label class="rz-haken-zeile">
        <input
          type="checkbox"
          checked={v.made}
          onChange={(ev) => setV({ ...v, made: (ev.target as HTMLInputElement).checked })}
        />
        {tr("setLastMade")}
      </label>
    </Modal>
  );
}
