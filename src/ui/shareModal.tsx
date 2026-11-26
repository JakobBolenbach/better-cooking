// "Share recipe" (issue #9): copy as text, print or save as PDF (desktop), or the device's share menu.
import { Modal } from "./shared";
import { Icon } from "./icons";
import { recipeHtml, recipeText } from "../share";
import { servingsText } from "../quantities";
import { tr } from "../i18n";
import type { RecipeView } from "../types";

/** Prints a page in a hidden frame, so only the recipe is printed and not the app around it. */
function printPage(html: string) {
  const frame = activeDocument.createElement("iframe");
  frame.className = "rz-druckrahmen";
  activeDocument.body.appendChild(frame);
  frame.setAttribute("aria-hidden", "true");
  frame.addEventListener("load", () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    // Leave the frame until the dialog is closed; printing is synchronous in Electron.
    window.setTimeout(() => frame.remove(), 1000);
  });
  frame.srcdoc = html;
}

export function ShareModal(p: {
  r: RecipeView;
  factor: number;
  canPrint: boolean;
  onHint: (text: string) => void;
  onCloseView: () => void;
}) {
  const text = () => recipeText(p.r, p.factor);
  const share = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const servings = p.r.servings ? servingsText(p.r.servings, p.factor) : undefined;
  const option = (icon: Parameters<typeof Icon>[0]["n"], title: string, desc: string, run: () => void) => (
    <button type="button" class="rz-teilen-option" onClick={run}>
      <Icon n={icon} large={18} />
      <span>
        <b>{title}</b>
        <span class="rz-leise">{desc}</span>
      </span>
    </button>
  );
  return (
    <Modal title={tr("shareTitle")} onCloseView={p.onCloseView} id="rz-teilen-titel">
      <p class="rz-leise">{servings ? tr("shareIntro", { servings }) : tr("shareIntroOriginal")}</p>
      <div class="rz-teilen-optionen">
        {option("notiz", tr("shareCopy"), tr("shareCopyDesc"), () => {
          navigator.clipboard
            .writeText(text())
            .then(() => {
              p.onHint(tr("copied"));
              p.onCloseView();
            })
            .catch(() => p.onHint(tr("copyFailed")));
        })}
        {p.canPrint &&
          option("drucker", tr("sharePrint"), tr("sharePrintDesc"), () => {
            printPage(recipeHtml(p.r, p.factor));
            p.onCloseView();
          })}
        {share &&
          option("teilen", tr("shareSystem"), tr("shareSystemDesc"), () => {
            void navigator.share({ title: p.r.title, text: text() }).catch(() => undefined);
          })}
      </div>
    </Modal>
  );
}
