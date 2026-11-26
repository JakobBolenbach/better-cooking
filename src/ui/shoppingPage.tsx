// Shopping list page (issue #64): the list note shown as a checklist; the note stays the storage.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { rowKey, shoppingView, type ShoppingEdit, type ShoppingRow } from "../shoppingEdit";
import { AddField, DoneSection, EmptyState, PageTitle, RecipeBar, Row } from "./shoppingParts";
import { Icon } from "./icons";
import { tr } from "../i18n";

export function ShoppingPage(p: {
  /** Text of the list note ("" without a note). */
  text: string;
  onEdit: (edit: ShoppingEdit) => void;
  onOpenNote: () => void;
  onBack: () => void;
}) {
  const view = useMemo(() => shoppingView(p.text), [p.text]);
  const [draft, setDraft] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [askRecipe, setAskRecipe] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const refocus = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Ticking an item moves it to the other part of the page: keep the focus on it (keyboard).
  useEffect(() => {
    const want = refocus.current;
    refocus.current = null;
    if (!want) return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-raw]") ?? []);
    rows
      .find((r) => r.dataset.raw === want)
      ?.querySelector<HTMLElement>(".rz-ek-haken")
      ?.focus({ preventScroll: true });
  }, [p.text]);

  const check = (r: ShoppingRow) => {
    refocus.current = r.raw.replace(/\[[ xX]\]/, r.checked ? "[ ]" : "[x]");
    p.onEdit({ kind: "check", raw: r.raw, nth: r.nth, checked: !r.checked });
  };
  const row = (r: ShoppingRow) => (
    <Row
      key={rowKey(r)}
      r={r}
      open={openRow === rowKey(r)}
      onOpen={() => setOpenRow(openRow === rowKey(r) ? null : rowKey(r))}
      onCheck={() => check(r)}
      onRemove={() => p.onEdit({ kind: "remove", raw: r.raw, nth: r.nth })}
    />
  );
  const named = view.groups.some((g) => g.name !== undefined);
  const empty = view.open === 0 && view.done.length === 0;

  return (
    <div class="rz-uebersicht rz-einkauf">
      <PageTitle onBack={p.onBack} onOpenNote={p.onOpenNote} />
      <AddField
        draft={draft}
        onDraft={setDraft}
        onSubmit={() => {
          p.onEdit({ kind: "add", text: draft });
          setDraft("");
        }}
      />
      <RecipeBar
        recipes={view.recipes}
        ask={askRecipe}
        onAsk={setAskRecipe}
        onRemove={(recipe) => {
          p.onEdit({ kind: "removeRecipe", recipe });
          setAskRecipe(null);
        }}
      />
      <div ref={listRef}>
        {empty && <EmptyState />}
        {!empty && view.open === 0 && (
          <p class="rz-ek-fertig" role="status">
            <Icon n="haken" large={18} />
            {tr("shoppingAllDone")}
          </p>
        )}
        {view.groups.map((g) => (
          <section key={g.name ?? ""} class="rz-ek-gruppe">
            {(g.name !== undefined || named) && <h2 class="rz-raster-titel">{g.name ?? tr("shoppingOther")}</h2>}
            <ul class="rz-ek-liste">{g.rows.map(row)}</ul>
          </section>
        ))}
        {view.done.length > 0 && (
          <DoneSection
            rows={view.done}
            open={showDone}
            onToggle={() => setShowDone(!showDone)}
            onClear={() => p.onEdit({ kind: "clearDone" })}
            row={row}
          />
        )}
      </div>
    </div>
  );
}
