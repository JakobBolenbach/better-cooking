// The feedback part of the "Fetch again" dialog (issue #120): what is wrong, and what happens with it, by the way that
// is set up (own AI, Claude or GitHub, nothing). The dialog itself is src/ui/refetchModal.tsx; the rules are src/feedback.ts.
import { Icon } from "./icons";
import { tr } from "../i18n";
import { processorName } from "../processor";
import { cleanFeedback, FEEDBACK_MAX, type FeedbackWay } from "../feedback";
import type { Preview } from "../refetch";
import type { RecipeView } from "../types";

/** What the host offers for feedback (src/feedbackService.ts); unset without a plugin. */
export interface FeedbackApi {
  way: (r: RecipeView) => FeedbackWay;
  /** The own AI reads the recipe again with the feedback; writes nothing. */
  preview: (path: string, text: string) => Promise<Preview>;
  /** Claude or GitHub: an improvement job with the feedback. */
  send: (path: string, text: string) => Promise<{ ok: boolean; message?: string }>;
}

/** Something to send: the feedback is not empty once it is cleaned. */
export const hasFeedback = (text: string) => cleanFeedback(text) !== "";

type Offered = Exclude<FeedbackWay, { via: "off" }>;

/** What happens with the feedback, in one paragraph, honest about what is sent where. */
function introOf(way: Exclude<Offered, { via: "none" }>, host: string): string {
  if (way.via === "processor")
    return tr(way.input === "link" ? "feedbackProcessorLink" : "feedbackProcessorText", {
      name: processorName(way.processor),
    });
  if (way.unread === "facebook") return tr("feedbackIntroFacebook");
  if (way.material === "page") return tr("feedbackIntroPage", { host });
  return tr(way.material === "caption" ? "feedbackIntroCaption" : "feedbackIntroNote");
}

export function FeedbackPanel(p: {
  way: Offered;
  host: string;
  text: string;
  onText: (text: string) => void;
  busy: boolean;
  /** Own AI: read again with the text. */
  onRead: () => void;
  /** Nothing set up: to the editor. */
  onEdit?: () => void;
}) {
  const { way } = p;
  if (way.via === "none")
    return (
      <>
        <p class="rz-hinweis rz-hinweis-warn" role="status">
          <Icon n="warnung" large={16} />
          {tr("feedbackNone")}
        </p>
        <p class="rz-leise">{tr("feedbackNoneHint")}</p>
        {p.onEdit && (
          <button type="button" class="rz-knopf" onClick={p.onEdit}>
            <Icon n="stift" large={16} />
            {tr("feedbackEditByHand")}
          </button>
        )}
      </>
    );
  return (
    <>
      <p class="rz-leise">{introOf(way, p.host)}</p>
      <div class="rz-feld">
        <label class="rz-feld-name" for="rz-hinweis-feld">
          {tr("feedbackLabel")}
        </label>
        <textarea
          id="rz-hinweis-feld"
          rows={4}
          maxLength={FEEDBACK_MAX}
          value={p.text}
          placeholder={tr("feedbackPlaceholder")}
          aria-describedby="rz-hinweis-zaehler"
          onInput={(ev) => p.onText((ev.target as HTMLTextAreaElement).value)}
        />
        {/* Read when the field is focused, not at every key press. */}
        <span id="rz-hinweis-zaehler" class="rz-leise rz-zaehler" aria-live="off">
          {tr("feedbackCounter", { n: p.text.length, max: FEEDBACK_MAX })}
        </span>
      </div>
      {way.via === "ai" && (
        <button
          type="button"
          class="rz-knopf rz-knopf-haupt"
          disabled={p.busy || !hasFeedback(p.text)}
          onClick={p.onRead}
        >
          {p.busy ? <Icon n="lader" large={16} className="rz-dreht" /> : <Icon n="funken" large={16} />}
          {p.busy ? tr("feedbackAiReading") : tr("feedbackAi")}
        </button>
      )}
    </>
  );
}
