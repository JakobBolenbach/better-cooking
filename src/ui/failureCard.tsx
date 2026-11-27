// A failure note without an open import (src/importFailure.ts) as a card: reason, open the note, remove it.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useState } from "preact/hooks";
import type { RecipeView } from "../types";
import { canDeleteFailure, failureReason } from "../importFailure";
import { tr } from "../i18n";
import { Icon } from "./icons";
import { noteName } from "./jobs";

export function FailureCard(p: { r: RecipeView; onOpen: () => void; onRemove: () => void }) {
  const { r } = p;
  const [asking, setAsking] = useState(false);
  return (
    <div class="rz-karte rz-karte-auftrag fehler" role="status">
      <span class="rz-karte-bild rz-auftrag-bild">
        <Icon n="warnung" large={28} />
      </span>
      <span class="rz-karte-text">
        <span class="rz-karte-titel">{tr("jobFailed")}</span>
        <span class="rz-karte-meta">
          <span>{noteName(r.path)}</span>
        </span>
        <span class="rz-karte-grund">{failureReason(r) ?? tr("importFailedNoReason")}</span>
        <span class="rz-auftrag-knoepfe">
          <button type="button" class="rz-knopf rz-knopf-klein" onClick={p.onOpen}>
            {tr("open")}
          </button>
          {canDeleteFailure(r) && !asking && (
            <button type="button" class="rz-knopf rz-knopf-klein" onClick={() => setAsking(true)}>
              <Icon n="x" large={14} />
              {tr("removeFailed")}
            </button>
          )}
          {asking && (
            <span class="rz-auftrag-frage" role="alertdialog" aria-label={tr("removeFailed")}>
              <span class="rz-leise">{tr("removeFailedAsk", { name: noteName(r.path) })}</span>
              <button type="button" class="rz-knopf rz-knopf-klein" onClick={p.onRemove}>
                {tr("removeFailedYes")}
              </button>
              <button type="button" class="rz-knopf rz-knopf-klein" onClick={() => setAsking(false)}>
                {tr("cancel")}
              </button>
            </span>
          )}
        </span>
      </span>
    </div>
  );
}
