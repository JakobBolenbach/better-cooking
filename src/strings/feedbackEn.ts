// English interface strings of feedback on a recipe (issue #120): every key of the German ones, checked by the type.
import type { feedbackDe } from "./feedbackDe";

export const feedbackEn: Record<keyof typeof feedbackDe, string> = {
  feedbackMenu: "Something wrong? Fetch again with feedback",
  feedbackTitle: "Fetch again with feedback",
  feedbackLabel: "What is wrong?",
  feedbackPlaceholder: "e.g. “The oven must be at 200 °C, not 180 °C.”",
  feedbackCounter: "{n} of {max} characters",
  feedbackAi: "Read again with my AI",
  feedbackAiReading: "Reading …",
  feedbackIntroPage:
    "Your feedback goes to your own AI together with the text of {host} and the recipe as it is now. It may take facts from your feedback, such as a temperature. Then you see what would change. Nothing is written until you tap “Update”, and the old version is backed up.",
  feedbackIntroCaption:
    "Your feedback goes to your own AI together with the post’s caption (read again) and the recipe as it is now. It may take facts from your feedback. Nothing is written until you tap “Update”, and the old version is backed up.",
  feedbackIntroNote:
    "Your AI revises the text of the note. Your feedback goes to it together with the recipe as it is now, and it may take facts from it. Nothing is written until you tap “Update”, and the old version is backed up.",
  feedbackViaPage: "Read again from the text of the page, with your feedback.",
  feedbackViaCaption: "Read again from the post’s caption, with your feedback.",
  feedbackViaNote: "The source could not be read or there is none: your AI revised the text of the note.",
  feedbackSend: "Send to {name}",
  feedbackSending: "Sending …",
  feedbackProcessorLink:
    "Your feedback goes to {name} with the link to the recipe, without the text of the note. The improvement arrives later as a proposal and is merged or shown for review like other improvements. What you changed by hand stays. Until it arrives, the recipe says “open”.",
  feedbackProcessorText:
    "Your feedback goes to {name} with the recipe text of the note, because there is no link. The improvement arrives later as a proposal and is merged or shown for review like other improvements. What you changed by hand stays. Until it arrives, the recipe says “open”.",
  feedbackIntroFacebook:
    "Facebook is not read. Your AI revises the text of the note. Your feedback goes to it together with the recipe as it is now, and it may take facts from it. Nothing is written until you tap “Update”, and the old version is backed up.",
  feedbackSent: "Feedback sent to {name}. The improvement arrives later.",
  feedbackNone: "Feedback needs your own AI or a processor.",
  feedbackNoneHint:
    "Set up your own AI, Claude or the GitHub action in the settings. Until then you can edit the recipe by hand.",
  feedbackEditByHand: "Edit by hand",
  feedbackEmpty: "Write what is wrong first.",
  feedbackOff: "Translations and old versions take no feedback. Fetch the original again.",
  feedbackRunning: "An improvement is already running for this recipe. Wait until it has arrived.",
  feedbackWaiting:
    "An improvement for this recipe is waiting for your review. Review or discard it first (banner on the recipe page).",
  retryNoNote: "The note no longer belongs to this job. Send the feedback or the improvement again.",
  feedbackChanged: "The note changed in the meantime. Please try again.",
};
