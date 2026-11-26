// "Translate recipe" (issue #10): the own AI writes a translation as a new note linked to the original.
import { useState } from "preact/hooks";
import { Modal } from "./shared";
import { Icon } from "./icons";
import { tr } from "../i18n";
import type { RecipeView } from "../types";

const SUGGESTIONS = ["English", "Deutsch", "Español", "Français", "Italiano", "Português", "Nederlands", "Polski"];

export function TranslateModal(p: {
  r: RecipeView;
  onTranslate: (language: string) => Promise<{ ok: boolean; message?: string }>;
  onCloseView: () => void;
}) {
  const [language, setLanguage] = useState("");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string>();
  return (
    <Modal
      title={tr("translateTitle")}
      onCloseView={p.onCloseView}
      id="rz-uebersetzen-titel"
      footer={
        <>
          <button type="button" class="rz-knopf" onClick={p.onCloseView}>
            {tr("cancel")}
          </button>
          <button
            type="button"
            class="rz-knopf rz-knopf-haupt"
            disabled={running || !language.trim()}
            onClick={() =>
              void (async () => {
                setRunning(true);
                setMessage(undefined);
                const r = await p.onTranslate(language.trim());
                setRunning(false);
                if (!r.ok) setMessage(r.message);
              })()
            }
          >
            {running ? <Icon n="lader" large={16} /> : <Icon n="funken" large={16} />}
            {running ? tr("translateRunning") : tr("translateRun")}
          </button>
        </>
      }
    >
      <p class="rz-leise">{tr("translateIntro", { title: p.r.title })}</p>
      <label class="rz-feld">
        <span class="rz-feld-name">{tr("translateLanguage")}</span>
        <input
          type="text"
          list="rz-sprachen"
          value={language}
          placeholder="English"
          onInput={(ev) => setLanguage((ev.target as HTMLInputElement).value)}
        />
        <datalist id="rz-sprachen">
          {SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      {message && (
        <p class="rz-hinweis rz-hinweis-warn">
          <Icon n="warnung" large={16} />
          {message}
        </p>
      )}
    </Modal>
  );
}
