// Shopping list page (issue #64): the list note shown as a checklist; the note stays the storage.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useMemo, useRef, useState } from "preact/hooks";
import { shoppingView, type ShoppingEdit } from "../shoppingEdit";
import { AddField, RecipeBar, ShoppingList } from "./shoppingParts";
import { PageTitle } from "./pageTitle";
import type { ShoppingUi } from "./shoppingUi";
import { useShoppingEdits } from "./useShoppingEdits";
import { tr } from "../i18n";

export function ShoppingPage(p: {
  /** Text of the list note ("" without a note). */
  text: string;
  /** Resolves to true when the note changed. */
  onEdit: (edit: ShoppingEdit) => Promise<boolean>;
  ui: ShoppingUi;
  onOpenNote: () => void;
  onBack: () => void;
}) {
  const view = useMemo(() => shoppingView(p.text), [p.text]);
  const [draft, setDraft] = useState("");
  const [showDone, setShowDone] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const edits = useShoppingEdits({ text: p.text, view, root, ui: p.ui, showDone, draft, setDraft, onEdit: p.onEdit });
  return (
    <div class="rz-uebersicht rz-einkauf" ref={root}>
      <PageTitle
        title={tr("pageShopping")}
        noteLabel={tr("shoppingOpenNote")}
        onBack={p.onBack}
        onOpenNote={p.onOpenNote}
      />
      <div class="rz-sr" role="status" aria-live="polite" aria-atomic="true">
        {edits.said}
      </div>
      <AddField draft={draft} onDraft={setDraft} onSubmit={() => void edits.add()} />
      <RecipeBar recipes={view.recipes} ask={p.ui.ask} onAsk={p.ui.setAsk} onRemove={edits.removeRecipe} />
      <ShoppingList
        view={view}
        ui={p.ui}
        showDone={showDone}
        onShowDone={setShowDone}
        onCheck={edits.check}
        onRemove={edits.remove}
        onClear={edits.clearDone}
      />
    </div>
  );
}
