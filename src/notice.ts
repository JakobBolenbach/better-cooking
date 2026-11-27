// A notice with an optional action button (the hints of the view, the alert of a timer).
import { Notice } from "obsidian";

/** `duration` 0: stays until it is clicked away. The button hides the notice, then runs the action. */
export function noticeWithAction(
  text: string,
  action: { label: string; run: () => void } | undefined,
  duration: number,
) {
  const notice = new Notice(action ? "" : text, duration);
  if (!action) return notice;
  notice.messageEl.createSpan({ text: `${text} ` });
  notice.messageEl.createEl("button", { text: action.label }).addEventListener("click", () => {
    notice.hide();
    action.run();
  });
  return notice;
}
