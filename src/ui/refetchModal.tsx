// "Fetch again" (issue #63): reads the source, shows what would change, and only writes after confirmation.
import { useEffect, useRef, useState } from "preact/hooks";
import { Modal } from "./shared";
import { Icon } from "./icons";
import { tr, type Key } from "../i18n";
import { hostOf } from "../source";
import { canRefetch, isEditablePart, type Change, type ChangePart, type Preview } from "../refetch";
import { FeedbackPanel, hasFeedback, type FeedbackApi } from "./feedbackPanel";
import type { Part } from "../fingerprint";
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
  state: "refetchPartState",
  timeline: "refetchPartTimeline",
};

const VIA_FEEDBACK = { page: "feedbackViaPage", caption: "feedbackViaCaption", note: "feedbackViaNote" } as const;

/** "Steps: 3 → 11" for lists, the plain name for other parts. */
export const changeText = (c: Change) =>
  c.from === undefined || c.to === undefined
    ? tr(PART[c.part])
    : `${tr(PART[c.part])}: ${c.from === c.to ? tr("refetchChanged") : `${c.from} → ${c.to}`}`;

/** What the host (the plugin, or the preview) offers for "Fetch again". */
export interface RefetchApi {
  preview: (path: string, useAi?: boolean) => Promise<Preview>;
  cancel: (path: string) => void;
  apply: (path: string, replace: Part[]) => Promise<{ ok: boolean; message?: string; stale?: boolean }>;
}

/** The toolbar action: only where `canRefetch` allows it (imported note, source is a recipe page, no translation). */
export const refetchAction = (r: RecipeView, available: boolean, open: () => void) =>
  available && canRefetch(r).ok ? { onClick: open } : undefined;

export function RefetchModal(p: {
  r: RecipeView;
  /** The dialog for an improvement proposal (ADR 0007): the same changes and hand-edit choices, other texts. */
  improve?: boolean;
  /** Feedback mode (#120): the user says what is wrong first; nothing is read before the user confirms. `onEdit` opens the editor. */
  feedback?: { api: FeedbackApi; onEdit?: () => void };
  /** Proposal dialog: "Discard" deletes the proposal and closes the job. */
  onDiscard?: () => Promise<{ ok: boolean; message?: string }>;
  onPreview: (useAi?: boolean) => Promise<Preview>;
  onApply: (replace: Part[]) => Promise<{ ok: boolean; message?: string; stale?: boolean }>;
  onCancel: () => void;
  onCloseView: () => void;
}) {
  const fb = p.feedback;
  const way = fb?.api.way(p.r);
  const can = p.improve
    ? ({ ok: true } as const)
    : fb
      ? way?.via === "off"
        ? ({ ok: false, reason: "feedbackOff" } as const)
        : ({ ok: true } as const)
      : canRefetch(p.r);
  const [text, setText] = useState("");
  // Feedback mode reads only on the user's click.
  const [idle, setIdle] = useState(!!fb);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<string>();
  // Parts edited by hand that the user wants replaced anyway; the default is to keep them.
  const [replace, setReplace] = useState<Part[]>([]);
  // The page can answer after the dialog was closed: then nothing is shown or written.
  const alive = useRef(true);
  const read = (useAi?: boolean) => {
    setPreview(null);
    setReplace([]);
    setIdle(false);
    void (fb ? fb.api.preview(p.r.path, text) : p.onPreview(useAi)).then((r) => alive.current && setPreview(r));
  };
  const send = async () => {
    setApplying(true);
    setMessage(undefined);
    const r = await fb!.api.send(p.r.path, text);
    if (!alive.current) return;
    setApplying(false);
    if (r.ok) p.onCloseView();
    else setMessage(r.message);
  };
  useEffect(() => {
    alive.current = true;
    if (can.ok && !fb) read();
    return () => {
      alive.current = false;
      p.onCancel();
    };
  }, [p.r.path]);
  const host = hostOf(p.r.source ?? "", p.r.source ?? "");
  const changes = preview?.ok ? preview.changes : [];
  const edited = preview?.ok ? preview.edited : [];
  // Everything that differs is an edit of the user and nothing is ticked: there is nothing to write.
  const keptAll =
    changes.length > 0 &&
    changes.every((c) => isEditablePart(c.part) && edited.includes(c.part) && !replace.includes(c.part));
  const blocked = !can.ok ? tr(can.reason) : preview && !preview.ok ? preview.message : undefined;
  return (
    <Modal
      title={tr(p.improve ? "improveTitle" : fb ? "feedbackTitle" : "refetchTitle")}
      onCloseView={p.onCloseView}
      id="rz-neu-holen-titel"
      footer={
        <>
          <button type="button" class="rz-knopf" onClick={p.onCloseView}>
            {tr("cancel")}
          </button>
          {p.onDiscard && (
            <button
              type="button"
              class="rz-knopf"
              disabled={applying}
              onClick={() =>
                void (async () => {
                  setApplying(true);
                  const r = await p.onDiscard!();
                  if (!alive.current) return;
                  setApplying(false);
                  if (r.ok) p.onCloseView();
                  else setMessage(r.message);
                })()
              }
            >
              <Icon n="x" large={16} />
              {tr("improveDiscard")}
            </button>
          )}
          {way?.via === "processor" && (
            <button
              type="button"
              class="rz-knopf rz-knopf-haupt"
              disabled={!hasFeedback(text) || applying}
              onClick={() => void send()}
            >
              {applying ? <Icon n="lader" large={16} className="rz-dreht" /> : <Icon n="rechts" large={16} />}
              {applying
                ? tr("feedbackSending")
                : tr("feedbackSend", { name: way.processor === "claude" ? "Claude" : tr("setGithubAction") })}
            </button>
          )}
          {way?.via !== "processor" && way?.via !== "none" && (
            <button
              type="button"
              class="rz-knopf rz-knopf-haupt"
              disabled={!changes.length || keptAll || applying}
              onClick={() =>
                void (async () => {
                  setApplying(true);
                  setMessage(undefined);
                  const r = await p.onApply(replace);
                  if (!alive.current) return;
                  setApplying(false);
                  if (r.ok) p.onCloseView();
                  else {
                    setMessage(r.message);
                    // The note changed since it was read: read it again; the button stays locked until then.
                    if (r.stale) read();
                  }
                })()
              }
            >
              {applying ? <Icon n="lader" large={16} className="rz-dreht" /> : <Icon n="nochmal" large={16} />}
              {applying
                ? tr(p.improve ? "improveApplying" : "refetchApplying")
                : tr(p.improve ? "improveApply" : "refetchApply")}
            </button>
          )}
        </>
      }
    >
      {fb && way && way.via !== "off" && (
        <FeedbackPanel
          way={way}
          host={host}
          text={text}
          onText={setText}
          busy={can.ok && !preview && !idle}
          onRead={() => read()}
          onEdit={fb.onEdit}
        />
      )}
      {!fb && <p class="rz-leise">{p.improve ? tr("improveIntro") : tr("refetchIntro", { host })}</p>}
      {!p.improve && !fb && <p class="rz-leise">{tr("refetchContract")}</p>}
      {/* One live region that stays in the page, so changes of state are announced. */}
      <div aria-live="polite" class="rz-neu-holen-stand">
        {can.ok && !preview && !idle && (
          <p class="rz-hinweis">
            <Icon n="lader" large={16} className="rz-dreht" />
            {tr("refetchLoading")}
          </p>
        )}
        {preview?.ok && (
          <>
            <p class="rz-leise">
              {preview.feedback
                ? tr(VIA_FEEDBACK[preview.feedback])
                : tr(
                    preview.via === "proposal"
                      ? "improveVia"
                      : preview.via === "ai"
                        ? "refetchViaAi"
                        : "refetchViaPage",
                  )}
            </p>
            {changes.length ? (
              <>
                <h3 class="rz-gruppe-titel">{tr("refetchChanges")}</h3>
                <ul class="rz-aenderungen">
                  {changes.map((c) => {
                    const mine = isEditablePart(c.part) && edited.includes(c.part);
                    const detail = preview.details?.[c.part];
                    return (
                      <li key={c.part}>
                        {changeText(c)}
                        {mine && <span class="rz-bearbeitet">{tr("refetchEdited")}</span>}
                        {detail && (
                          <details class="rz-neu-text">
                            <summary>{tr("improveNewText")}</summary>
                            {/* Plain text only: what the processor wrote is shown, never run. */}
                            <pre>{detail}</pre>
                          </details>
                        )}
                        {mine && (
                          <label class="rz-haken-zeile">
                            <input
                              type="checkbox"
                              checked={replace.includes(c.part as Part)}
                              onChange={(ev) => {
                                const on = (ev.target as HTMLInputElement).checked;
                                setReplace((cur) => [
                                  ...cur.filter((x) => x !== c.part),
                                  ...(on ? [c.part as Part] : []),
                                ]);
                              }}
                            />
                            {tr("refetchReplaceEdit")}
                          </label>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {keptAll ? (
                  <p class="rz-hinweis" role="status">
                    {tr("refetchAllKept")}
                  </p>
                ) : (
                  edited.length > 0 && <p class="rz-leise">{tr("refetchKeepHint")}</p>
                )}
                {!p.improve && <p class="rz-leise">{tr("refetchCoverHint")}</p>}
              </>
            ) : (
              <p class="rz-hinweis rz-hinweis-ok">{tr("refetchNothing")}</p>
            )}
          </>
        )}
      </div>
      {blocked && (
        <p class="rz-hinweis rz-hinweis-warn" role="alert">
          <Icon n="warnung" large={16} />
          {blocked}
        </p>
      )}
      {preview && !preview.ok && preview.canUseAi && (
        <>
          <p class="rz-leise">{tr("refetchAiNote")}</p>
          <button type="button" class="rz-knopf" onClick={() => read(true)}>
            <Icon n="funken" large={16} />
            {tr("refetchUseAi")}
          </button>
        </>
      )}
      {message && (
        <p class="rz-hinweis rz-hinweis-warn" role="alert">
          <Icon n="warnung" large={16} />
          {message}
        </p>
      )}
    </Modal>
  );
}
