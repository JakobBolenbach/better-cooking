// Shopping list page (issue #64): the list note shown as a checklist; the note stays the storage.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { rowKey, shoppingView, type ShoppingEdit, type ShoppingRow, type ShoppingView } from "../shoppingEdit";
import { AddField, DoneSection, EmptyState, PageTitle, RecipeBar, Row } from "./shoppingParts";
import type { ShoppingUi } from "./shoppingUi";
import { Icon } from "./icons";
import { tr } from "../i18n";

/** After an edit: where the focus goes, and what the live region says once the new text is there. */
interface Follow {
  /** The row to focus (its key), the page title, or the field (which keeps the focus it has). */
  focus: { row: string } | "title" | "field";
  say: (open: number) => string;
}

/** The row after `row` in `rows` (the next one to look at when `row` leaves its place), as it is keyed after the edit. */
function nextKey(rows: ShoppingRow[], row: ShoppingRow): string | undefined {
  const next = rows[rows.indexOf(row) + 1];
  if (!next) return undefined;
  // An identical line before it that goes away (or changes) moves its number up by one.
  const shift = next.raw === row.raw && next.nth > row.nth ? 1 : 0;
  return rowKey({ raw: next.raw, nth: next.nth - shift });
}

/** Focus target: the row, or the page title when there is none. */
const nextRow = (key?: string): Follow["focus"] => (key ? { row: key } : "title");

const flat = (v: ShoppingView) => v.groups.flatMap((g) => g.rows);

export function ShoppingPage(p: {
  /** Text of the list note ("" without a note). */
  text: string;
  /** Resolves to false when the note could not be changed. */
  onEdit: (edit: ShoppingEdit) => Promise<boolean>;
  ui: ShoppingUi;
  onOpenNote: () => void;
  onBack: () => void;
}) {
  const view = useMemo(() => shoppingView(p.text), [p.text]);
  const { ask, setAsk, openRow, setOpenRow } = p.ui;
  const [draft, setDraft] = useState("");
  const draftNow = useRef(draft);
  draftNow.current = draft;
  const [showDone, setShowDone] = useState(false);
  const [said, setSaid] = useState("");
  const follow = useRef<Follow | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const say = useRef(0);

  // The edit arrived: move the focus (the element it was on is gone or moved) and tell screen readers.
  useEffect(() => {
    const f = follow.current;
    follow.current = null;
    if (!f) return;
    const target = f.focus;
    if (target !== "field") {
      const found =
        target === "title"
          ? null
          : Array.from(root.current?.querySelectorAll<HTMLElement>("[data-key]") ?? [])
              .find((r) => r.dataset.key === target.row)
              ?.querySelector<HTMLElement>(".rz-ek-haken");
      (found ?? root.current?.querySelector<HTMLElement>("h1"))?.focus({ preventScroll: true });
    }
    // The same words twice in a row are only read again when the text differs.
    setSaid(f.say(view.open) + (say.current++ % 2 ? "\u200b" : ""));
  }, [p.text]);

  /** Runs an edit; `how` says where the focus goes and what is announced. */
  const run = async (edit: ShoppingEdit, how: Follow) => {
    follow.current = how;
    const ok = await p.onEdit(edit);
    if (!ok) follow.current = null;
    return ok;
  };

  const add = async () => {
    const sent = draft;
    const ok = await run(
      { kind: "add", text: sent },
      { focus: "field", say: (n) => tr("shoppingAnnounceAdded", { name: sent.trim(), n }) },
    );
    // The text stays when writing failed, and when the user has typed on in the meantime.
    if (ok && draftNow.current === sent) setDraft("");
  };
  const check = (r: ShoppingRow) => {
    const list = r.checked ? view.done : flat(view);
    const name = [r.amount, r.name].filter(Boolean).join(" ");
    void run(
      { kind: "check", raw: r.raw, nth: r.nth, checked: !r.checked },
      {
        focus: nextRow(showDone || !r.checked ? nextKey(list, r) : undefined),
        say: (n) => tr(r.checked ? "shoppingAnnounceOpen" : "shoppingAnnounceDone", { name, n }),
      },
    );
  };
  const remove = (r: ShoppingRow) => {
    const list = r.checked ? view.done : flat(view);
    void run(
      { kind: "remove", raw: r.raw, nth: r.nth },
      {
        focus: nextRow(nextKey(list, r)),
        say: (n) => tr("shoppingAnnounceRemoved", { name: r.name, n }),
      },
    );
  };
  const row = (r: ShoppingRow) => (
    <Row
      key={rowKey(r)}
      r={r}
      open={openRow === rowKey(r)}
      onOpen={() => setOpenRow(openRow === rowKey(r) ? null : rowKey(r))}
      onCheck={() => check(r)}
      onRemove={() => remove(r)}
    />
  );
  const named = view.groups.some((g) => g.name !== undefined);
  const empty = view.open === 0 && view.done.length === 0;

  return (
    <div class="rz-uebersicht rz-einkauf" ref={root}>
      <PageTitle onBack={p.onBack} onOpenNote={p.onOpenNote} />
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
      <div>
        {empty && <EmptyState />}
        {!empty && view.open === 0 && (
          <p class="rz-ek-fertig">
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
            onClear={() =>
              void run({ kind: "clearDone" }, { focus: "title", say: (n) => tr("shoppingAnnounceCleared", { n }) })
            }
            row={row}
          />
        )}
      </div>
    </div>
  );
}
