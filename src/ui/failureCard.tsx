// A failure note without an open import (src/importFailure.ts) as a card: reason, open the note, remove it.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import type { RecipeView } from "../types";
import { failureReason } from "../importFailure";
import { tr } from "../i18n";
import { Icon } from "./icons";
import { noteName } from "../parse";
import { RemoveButton } from "./removeButton";

export function FailureCard(p: { r: RecipeView; onOpen: () => void; onRemove: () => void | Promise<void> }) {
  const { r } = p;
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
          <RemoveButton names={[noteName(r.path)]} onRemove={p.onRemove} />
        </span>
      </span>
    </div>
  );
}
