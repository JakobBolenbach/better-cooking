// "Delete recipe" (issue #119): the dialog names what goes before anything is deleted, offers "Discarded" as the
// alternative that keeps the warning on a second import of the link, and moves the files to the trash on confirmation.
import { useEffect, useRef, useState } from "preact/hooks";
import { Modal } from "./shared";
import { Icon } from "./icons";
import { tr } from "../i18n";
import { shortDate, weekday } from "../mealPlan";
import type { DeletePreview } from "../deletePlan";
import type { RecipeView } from "../types";

/** What the host (the plugin, or the preview) offers for "Delete recipe". */
export interface DeleteApi {
  /** What goes with the recipe; with `translations` false the translations stay (images and plan entries follow). */
  preview: (path: string, translations: boolean) => Promise<DeletePreview | { ok: false; message: string }>;
  run: (path: string, o: { translations: boolean; title: string }) => Promise<{ ok: boolean; message?: string }>;
}

export function DeleteModal(p: {
  r: RecipeView;
  api: DeleteApi;
  /** Sets the recipe to "Discarded" and closes the dialog. */
  onDiscard: () => void;
  onDeleted: () => void;
  onCloseView: () => void;
}) {
  const { r } = p;
  const [withTranslations, setWithTranslations] = useState(true);
  const [preview, setPreview] = useState<DeletePreview>();
  const [message, setMessage] = useState<string>();
  const [running, setRunning] = useState(false);
  // An answer that arrives after the dialog was closed, or after a newer question, is dropped.
  const alive = useRef(true);
  const asked = useRef(0);
  useEffect(() => {
    alive.current = true;
    const n = ++asked.current;
    void p.api.preview(r.path, withTranslations).then((a) => {
      if (!alive.current || n !== asked.current) return;
      if (a.ok) setPreview(a);
      else setMessage(a.message);
    });
    return () => {
      alive.current = false;
    };
  }, [r.path, withTranslations]);

  const run = async () => {
    setRunning(true);
    setMessage(undefined);
    const res = await p.api.run(r.path, { translations: withTranslations, title: r.title });
    if (!alive.current) return;
    setRunning(false);
    if (res.ok) p.onDeleted();
    else setMessage(res.message);
  };

  const translations = preview?.translations ?? [];
  return (
    <Modal
      title={tr("deleteTitle")}
      onCloseView={p.onCloseView}
      id="rz-loeschen-titel"
      footer={
        <>
          <button type="button" class="rz-knopf" onClick={p.onCloseView}>
            {tr("cancel")}
          </button>
          <button
            type="button"
            class="rz-knopf rz-knopf-gefahr"
            disabled={running || !preview}
            onClick={() => void run()}
          >
            <Icon n={running ? "lader" : "papierkorb"} large={16} />
            {running ? tr("deleteRunning") : tr("deleteMove")}
          </button>
        </>
      }
    >
      <p class="rz-leise">{tr("deleteIntro")}</p>
      <ul class="rz-loeschen-liste">
        <li>{tr("deleteNoteItem", { title: r.title })}</li>
        {preview && preview.images.length > 0 && (
          <li>
            {tr("deleteImagesItem")}
            <ul>
              {preview.images.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </li>
        )}
        {preview && preview.backups > 0 && (
          <li>{tr(preview.backups === 1 ? "deleteBackupsOne" : "deleteBackupsMany", { n: preview.backups })}</li>
        )}
        {preview && preview.plan.length > 0 && (
          <li>
            {tr("deletePlanItem")}
            <ul>
              {preview.plan.map((d) => (
                <li key={d.date}>
                  {weekday(d.date)}, {shortDate(d.date)}: {d.titles.join(", ")}
                </li>
              ))}
            </ul>
          </li>
        )}
      </ul>
      {translations.length > 0 && (
        <label class="rz-loeschen-wahl">
          <input
            type="checkbox"
            checked={withTranslations}
            disabled={running}
            onChange={(e) => setWithTranslations((e.target as HTMLInputElement).checked)}
          />
          <span>
            {tr("deleteTranslations")}
            <span class="rz-leise">
              {" "}
              {translations.map((t) => (t.language ? `${t.title} (${t.language})` : t.title)).join(", ")}
            </span>
          </span>
        </label>
      )}
      <p class="rz-leise">{tr("deleteShopping")}</p>
      {r.status !== "verworfen" && (
        <div class="rz-hinweis rz-loeschen-alternative">
          <p>{tr("deleteDiscardedHint")}</p>
          <button type="button" class="rz-knopf rz-knopf-klein" disabled={running} onClick={p.onDiscard}>
            {tr("deleteDiscardInstead")}
          </button>
        </div>
      )}
      <p class="rz-leise">{tr("deleteTrashHint")}</p>
      {message && (
        <p class="rz-hinweis rz-hinweis-warn" role="alert">
          <Icon n="warnung" large={16} />
          {message}
        </p>
      )}
    </Modal>
  );
}
