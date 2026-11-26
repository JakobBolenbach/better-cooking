// Modal for writing down an attempt.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { todayIso, isoToGerman } from "../parse";
import type { RecipeView } from "../types";
import { Modal, Stars } from "./shared";
import { Icon } from "./icons";
import { tr } from "../i18n";

export interface AttemptInput {
  date: string;
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
}: {
  r: RecipeView;
  onCloseView: () => void;
  onSave: (v: AttemptInput) => Promise<void>;
}) {
  const [v, setV] = useState<AttemptInput>({
    date: isoToGerman(todayIso()),
    modified: "",
    result: "",
    asRating: !r.rating,
    made: true,
  });
  const [running, setRunning] = useState(false);
  const field = (k: "modified" | "result") => (ev: JSX.TargetedEvent<HTMLTextAreaElement>) =>
    setV({ ...v, [k]: (ev.target as HTMLTextAreaElement).value });
  return (
    <Modal title={tr("noteAttempt")} onCloseView={onCloseView} id="rz-versuch-titel">
      <p class="rz-leise">{r.title}</p>
      <label class="rz-feld">
        <span class="rz-feld-name">{tr("date")}</span>
        <input
          type="text"
          value={v.date}
          onInput={(ev) => setV({ ...v, date: (ev.target as HTMLInputElement).value })}
        />
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
      <div class="rz-fenster-fuss">
        <button type="button" class="rz-knopf" onClick={onCloseView}>
          {tr("cancel")}
        </button>
        <button
          type="button"
          class="rz-knopf rz-knopf-haupt"
          disabled={running || !/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(v.date.trim())}
          onClick={() =>
            void (async () => {
              setRunning(true);
              await onSave(v);
              setRunning(false);
            })()
          }
        >
          <Icon n="haken" large={16} />
          {tr("save")}
        </button>
      </div>
    </Modal>
  );
}
