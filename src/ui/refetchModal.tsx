// "Fetch again" (issue #63): reads the source, shows what would change, and only writes after confirmation.
import { useEffect, useRef, useState } from "preact/hooks";
import { Modal } from "./shared";
import { Icon } from "./icons";
import { tr, type Key } from "../i18n";
import type { Change, ChangePart, Preview } from "../refetch";
import type { RecipeView } from "../types";

const PART: Record<ChangePart, Key> = {
  title: "refetchPartTitle",
  description: "refetchPartDescription",
  yield: "refetchPartYield",
  times: "refetchPartTimes",
  ingredients: "refetchPartIngredients",
  steps: "refetchPartSteps",
  tips: "refetchPartTips",
  image: "refetchPartImage",
};

/** "Steps: 3 → 11" for lists, the plain name for other parts. */
export const changeText = (c: Change) =>
  c.from !== undefined && c.to !== undefined ? `${tr(PART[c.part])}: ${c.from} → ${c.to}` : tr(PART[c.part]);

export function RefetchModal(p: {
  r: RecipeView;
  onPreview: () => Promise<Preview>;
  onApply: () => Promise<{ ok: boolean; message?: string }>;
  onCloseView: () => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<string>();
  // The page can answer after the dialog was closed: then nothing is shown or written.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    void p.onPreview().then((r) => alive.current && setPreview(r));
    return () => {
      alive.current = false;
    };
  }, [p.r.path]);
  const host = (() => {
    try {
      return new URL(p.r.source ?? "").hostname.replace(/^www\./, "");
    } catch {
      return p.r.source ?? "";
    }
  })();
  const changes = preview?.ok ? preview.changes : [];
  return (
    <Modal
      title={tr("refetchTitle")}
      onCloseView={p.onCloseView}
      id="rz-neu-holen-titel"
      footer={
        <>
          <button type="button" class="rz-knopf" onClick={p.onCloseView}>
            {tr("cancel")}
          </button>
          <button
            type="button"
            class="rz-knopf rz-knopf-haupt"
            disabled={!changes.length || applying}
            onClick={() =>
              void (async () => {
                setApplying(true);
                setMessage(undefined);
                const r = await p.onApply();
                if (!alive.current) return;
                setApplying(false);
                if (r.ok) p.onCloseView();
                else setMessage(r.message);
              })()
            }
          >
            {applying ? <Icon n="lader" large={16} className="rz-dreht" /> : <Icon n="nochmal" large={16} />}
            {applying ? tr("refetchApplying") : tr("refetchApply")}
          </button>
        </>
      }
    >
      <p class="rz-leise">{tr("refetchIntro", { host })}</p>
      <p class="rz-leise">{tr("refetchContract")}</p>
      {!preview && (
        <p class="rz-hinweis" role="status">
          <Icon n="lader" large={16} className="rz-dreht" />
          {tr("refetchLoading")}
        </p>
      )}
      {preview && !preview.ok && (
        <p class="rz-hinweis rz-hinweis-warn">
          <Icon n="warnung" large={16} />
          {preview.message}
        </p>
      )}
      {preview?.ok && (
        <div aria-live="polite">
          <p class="rz-leise">{tr(preview.via === "ai" ? "refetchViaAi" : "refetchViaPage")}</p>
          {changes.length ? (
            <>
              <h3 class="rz-gruppe-titel">{tr("refetchChanges")}</h3>
              <ul class="rz-aenderungen">
                {changes.map((c) => (
                  <li key={c.part}>{changeText(c)}</li>
                ))}
              </ul>
              <p class="rz-leise">{tr("refetchCoverHint")}</p>
            </>
          ) : (
            <p class="rz-hinweis rz-hinweis-ok">{tr("refetchNothing")}</p>
          )}
        </div>
      )}
      {message && (
        <p class="rz-hinweis rz-hinweis-warn">
          <Icon n="warnung" large={16} />
          {message}
        </p>
      )}
    </Modal>
  );
}
