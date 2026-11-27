// The list of what a fresh reading changes, with the choice per hand edit (ADR 0006): shared by "Fetch again", the
// review of an improvement proposal (ADR 0007) and feedback (#120).
import { Icon } from "./icons";
import { tr, type Key } from "../i18n";
import { isEditablePart, type Change, type ChangePart, type Preview } from "../refetch";
import type { Part } from "../fingerprint";

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

/** Everything that differs is an edit of the user and nothing is ticked: there is nothing to write. */
export const allKept = (changes: Change[], edited: Part[], replace: Part[]) =>
  changes.length > 0 &&
  changes.every((c) => isEditablePart(c.part) && edited.includes(c.part) && !replace.includes(c.part));

type Read = Extract<Preview, { ok: true }>;

function viaText(preview: Read): string {
  if (preview.feedback) return tr(VIA_FEEDBACK[preview.feedback]);
  return tr(preview.via === "proposal" ? "improveVia" : preview.via === "ai" ? "refetchViaAi" : "refetchViaPage");
}

function Item(p: { change: Change; mine: boolean; detail?: string; ticked: boolean; onTick: (on: boolean) => void }) {
  return (
    <li>
      {changeText(p.change)}
      {p.mine && <span class="rz-bearbeitet">{tr("refetchEdited")}</span>}
      {p.detail && (
        <details class="rz-neu-text">
          <summary>{tr("improveNewText")}</summary>
          {/* Plain text only: what the processor or the AI wrote is shown, never run. */}
          <pre>{p.detail}</pre>
        </details>
      )}
      {p.mine && (
        <label class="rz-haken-zeile">
          <input
            type="checkbox"
            checked={p.ticked}
            onChange={(ev) => p.onTick((ev.target as HTMLInputElement).checked)}
          />
          {tr("refetchReplaceEdit")}
        </label>
      )}
    </li>
  );
}

export function ChangeList(p: {
  preview: Read;
  replace: Part[];
  onReplace: (next: Part[]) => void;
  /** Proposal dialog: no hint on the cover image. */
  improve?: boolean;
}) {
  const { preview, replace } = p;
  const { changes, edited } = preview;
  const kept = allKept(changes, edited, replace);
  return (
    <>
      <p class="rz-leise">{viaText(preview)}</p>
      {changes.length ? (
        <>
          <h3 class="rz-gruppe-titel">{tr("refetchChanges")}</h3>
          <ul class="rz-aenderungen">
            {changes.map((c) => {
              const mine = isEditablePart(c.part) && edited.includes(c.part);
              return (
                <Item
                  key={c.part}
                  change={c}
                  mine={mine}
                  detail={preview.details?.[c.part]}
                  ticked={replace.includes(c.part as Part)}
                  onTick={(on) =>
                    p.onReplace([...replace.filter((x) => x !== c.part), ...(on ? [c.part as Part] : [])])
                  }
                />
              );
            })}
          </ul>
          {kept ? (
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
  );
}

/** A warning line (role alert, so it is announced). */
export function Warning({ text }: { text: string }) {
  return (
    <p class="rz-hinweis rz-hinweis-warn" role="alert">
      <Icon n="warnung" large={16} />
      {text}
    </p>
  );
}

/** "Reading …" with the spinner, for the live region. */
export function Loading() {
  return (
    <p class="rz-hinweis">
      <Icon n="lader" large={16} className="rz-dreht" />
      {tr("refetchLoading")}
    </p>
  );
}

/** The main button that writes what the list shows ("Update"). */
export function ApplyButton(p: {
  label: string;
  busyLabel: string;
  acting: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" class="rz-knopf rz-knopf-haupt" disabled={p.disabled} onClick={p.onClick}>
      {p.acting ? <Icon n="lader" large={16} className="rz-dreht" /> : <Icon n="nochmal" large={16} />}
      {p.acting ? p.busyLabel : p.label}
    </button>
  );
}
