// Shopping list page (issue #64): the list note shown as a checklist; the note stays the storage.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useMemo, useRef, useState } from "preact/hooks";
import { rowKey, shoppingView, type ShoppingEdit, type ShoppingRow } from "../shoppingEdit";
import { AddField, RecipeBar, ShoppingList } from "./shoppingParts";
import { PageTitle } from "./pageTitle";
import { useEditFollow, type Follow } from "./useEditFollow";
import type { ShoppingUi } from "./shoppingUi";
import { tr } from "../i18n";

/** The row after `row` in `rows` (the next one to look at when `row` leaves its place), as it is keyed after the edit. */
function nextKey(rows: ShoppingRow[], row: ShoppingRow): string | undefined {
  const next = rows[rows.indexOf(row) + 1];
  if (!next) return undefined;
  // An identical line before it that goes away (or changes) moves its number up by one.
  const shift = next.raw === row.raw && next.nth > row.nth ? 1 : 0;
  return rowKey({ raw: next.raw, nth: next.nth - shift });
}

/** Focus target: the row, or the page title when there is none. */
const nextRow = (key?: string): Follow["focus"] => (key ? { key } : "title");

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
  const { ask, setAsk, setOpenRow } = p.ui;
  const [draft, setDraft] = useState("");
  const draftNow = useRef(draft);
  draftNow.current = draft;
  const [showDone, setShowDone] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const { said, run } = useEditFollow<ShoppingEdit>({
    text: p.text,
    count: view.open,
    root,
    target: ".rz-ek-haken",
    onEdit: p.onEdit,
  });

  const add = async () => {
    const sent = draft;
    const changed = await run(
      { kind: "add", text: sent },
      { focus: "field", say: (n) => tr("shoppingAnnounceAdded", { name: sent.trim(), n }) },
    );
    // The text stays when writing failed, and when the user has typed on in the meantime.
    if (changed && draftNow.current === sent) setDraft("");
  };
  const check = (r: ShoppingRow) => {
    const list = r.checked ? view.done : view.groups.flatMap((g) => g.rows);
    const name = [r.amount, r.name].filter(Boolean).join(" ");
    setOpenRow(null);
    void run(
      { kind: "check", raw: r.raw, nth: r.nth, checked: !r.checked },
      {
        focus: nextRow(showDone || !r.checked ? nextKey(list, r) : undefined),
        say: (n) => tr(r.checked ? "shoppingAnnounceOpen" : "shoppingAnnounceDone", { name, n }),
      },
    );
  };
  const remove = (r: ShoppingRow) => {
    const list = r.checked ? view.done : view.groups.flatMap((g) => g.rows);
    setOpenRow(null);
    void run(
      { kind: "remove", raw: r.raw, nth: r.nth },
      { focus: nextRow(nextKey(list, r)), say: (n) => tr("shoppingAnnounceRemoved", { name: r.name, n }) },
    );
  };

  return (
    <div class="rz-uebersicht rz-einkauf" ref={root}>
      <PageTitle
        title={tr("pageShopping")}
        noteLabel={tr("shoppingOpenNote")}
        onBack={p.onBack}
        onOpenNote={p.onOpenNote}
      />
      <div class="rz-sr" role="status" aria-live="polite" aria-atomic="true">
        {said}
      </div>
      <AddField draft={draft} onDraft={setDraft} onSubmit={() => void add()} />
      <RecipeBar
        recipes={view.recipes}
        ask={ask}
        onAsk={setAsk}
        onRemove={(recipe) => {
          setAsk(null);
          void run(
            { kind: "removeRecipe", recipe },
            { focus: "title", say: (n) => tr("shoppingAnnounceRecipe", { recipe, n }) },
          );
        }}
      />
      <ShoppingList
        view={view}
        ui={p.ui}
        showDone={showDone}
        onShowDone={setShowDone}
        onCheck={check}
        onRemove={remove}
        onClear={() =>
          void run({ kind: "clearDone" }, { focus: "title", say: (n) => tr("shoppingAnnounceCleared", { n }) })
        }
      />
    </div>
  );
}
