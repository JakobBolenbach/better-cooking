// "Remove" for a failed import: a button, then a question that names the notes that will be deleted.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useState } from "preact/hooks";
import { tr } from "../i18n";
import { Icon } from "./icons";

export function RemoveButton(p: { names: string[]; onRemove: () => void; onAsk?: (open: boolean) => void }) {
  const [asking, setAsking] = useState(false);
  const set = (v: boolean) => {
    setAsking(v);
    p.onAsk?.(v);
  };
  if (!asking)
    return (
      <button type="button" class="rz-knopf rz-knopf-klein" onClick={() => set(true)}>
        <Icon n="x" large={14} />
        {tr("removeFailed")}
      </button>
    );
  return (
    <span class="rz-auftrag-frage" role="alertdialog" aria-label={tr("removeFailed")}>
      <span class="rz-leise">{tr("removeFailedAsk", { name: p.names.join(", ") })}</span>
      <button type="button" class="rz-knopf rz-knopf-klein" onClick={p.onRemove}>
        {tr("removeFailedYes")}
      </button>
      <button type="button" class="rz-knopf rz-knopf-klein" onClick={() => set(false)}>
        {tr("cancel")}
      </button>
    </span>
  );
}
