// Shopping list page (issue #64): the list note shown as a checklist; the note stays the storage.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import type { ComponentChildren } from "preact";
import { useMemo, useRef, useState } from "preact/hooks";
import { shoppingView, type ShoppingEdit } from "../shoppingEdit";
import { AddField, RecipeBar, ShoppingList } from "./shoppingParts";
import { PageTitle } from "./pageTitle";
import type { ShoppingUi } from "./shoppingUi";
import { useShoppingEdits } from "./useShoppingEdits";
import { language, tr } from "../i18n";
import type { Contributions } from "../listRecipes";

export function ShoppingPage(p: {
  /** Text of the list note ("" without a note). */
  text: string;
  /** What the recipes bring to the list: amounts per recipe on a shared line, and the exact amount when a recipe is removed. */
  known?: Contributions;
  /** Resolves to true when the note changed. */
  onEdit: (edit: ShoppingEdit) => Promise<boolean>;
  ui: ShoppingUi;
  onOpenNote: () => void;
  /** A notice about two notes for the list, shown under the title. */
  conflict?: ComponentChildren;
  onBack: () => void;
}) {
  const view = useMemo(() => shoppingView(p.text, p.known), [p.text, p.known, language()]);
  const [draft, setDraft] = useState("");
  const [showDone, setShowDone] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const edits = useShoppingEdits({
    text: p.text,
    view,
    root,
    ui: p.ui,
    showDone,
    draft,
    setDraft,
    onEdit: p.onEdit,
    known: p.known,
  });
  return (
    <div class="rz-uebersicht rz-einkauf" ref={root}>
      <PageTitle
        title={tr("pageShopping")}
        noteLabel={tr("shoppingOpenNote")}
        onBack={p.onBack}
        onOpenNote={p.onOpenNote}
      />
      {p.conflict}
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
