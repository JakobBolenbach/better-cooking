// Building blocks of the shopping list page (issue #64): title row, field for own items, recipe chips with their
// question, the list rows and the "Done" part. Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useEffect, useRef } from "preact/hooks";
import { rowKey, type ShoppingRow, type ShoppingView } from "../shoppingEdit";
import type { ShoppingUi } from "./shoppingUi";
import { Icon } from "./icons";
import { tr } from "../i18n";

export function AddField(p: { draft: string; onDraft: (s: string) => void; onSubmit: () => void }) {
  return (
    <form
      class="rz-ek-neu"
      onSubmit={(e) => {
        e.preventDefault();
        if (p.draft.trim()) p.onSubmit();
      }}
    >
      <label class="rz-ek-feld">
        <span class="rz-sr">{tr("shoppingAddLabel")}</span>
        <input
          type="text"
          enterkeyhint="enter"
          autocomplete="off"
          autocapitalize="sentences"
          placeholder={tr("shoppingAddPlaceholder")}
          value={p.draft}
          onInput={(e) => p.onDraft((e.target as HTMLInputElement).value)}
        />
      </label>
      <button type="submit" class="rz-rund" aria-label={tr("shoppingAddButton")} disabled={!p.draft.trim()}>
        <Icon n="plus" large={22} />
      </button>
    </form>
  );
}

export function RecipeBar(p: {
  recipes: string[];
  ask: string | null;
  onAsk: (recipe: string | null) => void;
  onRemove: (recipe: string) => void;
}) {
  // The question opens below the chips: the focus goes into it, so keyboard and screen reader land on it.
  const askRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const was = useRef<string | null>(null);
  useEffect(() => {
    if (p.ask) askRef.current?.focus({ preventScroll: false });
    // Cancelled or closed with Esc: back to the chip it came from (after removing, the page takes the focus).
    else if (was.current)
      Array.from(barRef.current?.querySelectorAll<HTMLElement>("[data-recipe]") ?? [])
        .find((c) => c.dataset.recipe === was.current)
        ?.focus({ preventScroll: true });
    was.current = p.ask;
  }, [p.ask]);
  return (
    <div class="rz-ek-oben" ref={barRef}>
      {p.recipes.length > 0 && (
        <div class="rz-ek-rezepte">
          <span class="rz-ek-fuer">{tr("shoppingFor")}</span>
          <ul class="rz-ek-chips">
            {p.recipes.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  class={`rz-chip rz-ek-chip${p.ask === name ? " an" : ""}`}
                  aria-label={tr("shoppingChipLabel", { recipe: name })}
                  aria-expanded={p.ask === name}
                  aria-controls="rz-ek-frage"
                  data-recipe={name}
                  onClick={() => p.onAsk(p.ask === name ? null : name)}
                >
                  {name}
                  <Icon n="x" large={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.ask && (
        <div class="rz-ek-frage" id="rz-ek-frage" role="group" tabIndex={-1} ref={askRef}>
          <p>{tr("shoppingRemoveRecipeAsk", { recipe: p.ask })}</p>
          <div class="rz-ek-frage-knoepfe">
            <button
              type="button"
              class="rz-knopf rz-knopf-haupt rz-knopf-klein"
              onClick={() => p.onRemove(p.ask as string)}
            >
              {tr("shoppingRemove")}
            </button>
            <button type="button" class="rz-knopf rz-knopf-klein" onClick={() => p.onAsk(null)}>
              {tr("cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function EmptyState() {
  return (
    <div class="rz-leer rz-ek-leer">
      <span class="rz-leer-icon">
        <Icon n="wagen" large={30} />
      </span>
      <span class="rz-leer-titel">{tr("shoppingEmptyTitle")}</span>
      <p>{tr("shoppingEmptyHint")}</p>
    </div>
  );
}

export function DoneSection(p: {
  rows: ShoppingRow[];
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
  row: (r: ShoppingRow) => preact.JSX.Element;
}) {
  return (
    <section class="rz-ek-gruppe rz-ek-erledigt">
      <div class="rz-ek-erledigt-kopf">
        <button type="button" class="rz-ek-erledigt-knopf" aria-expanded={p.open} onClick={p.onToggle}>
          <Icon n="unten" large={18} className={p.open ? "auf" : ""} />
          {tr("shoppingDone", { n: p.rows.length })}
        </button>
        <button type="button" class="rz-knopf rz-knopf-klein" onClick={p.onClear}>
          <Icon n="papierkorb" large={15} />
          {tr("shoppingClearDone")}
        </button>
      </div>
      {p.open && <ul class="rz-ek-liste">{p.rows.map(p.row)}</ul>}
    </section>
  );
}

export function Row(p: {
  r: ShoppingRow;
  open: boolean;
  onOpen: () => void;
  onCheck: () => void;
  onRemove: () => void;
}) {
  const { r } = p;
  const label = [r.amount, r.name].filter(Boolean).join(" ");
  return (
    <li class={`rz-ek-zeile${r.checked ? " erledigt" : ""}${p.open ? " offen" : ""}`} data-key={rowKey(r)}>
      <div class="rz-ek-kopf">
        <button
          type="button"
          role="checkbox"
          aria-checked={r.checked}
          aria-label={label}
          class="rz-ek-haken"
          onClick={p.onCheck}
        >
          <span class="rz-ek-kasten">
            <Icon n="haken" large={18} />
          </span>
        </button>
        <button type="button" class="rz-ek-text" aria-expanded={p.open} onClick={p.onOpen}>
          {r.amount && <b class="rz-ek-menge">{r.amount}</b>}
          <span class="rz-ek-name">{r.name}</span>
        </button>
      </div>
      {p.open && (
        <div class="rz-ek-detail">
          <div class="rz-ek-quellen">
            <span class="rz-ek-fuer">{tr("shoppingNeededFor")}</span>
            {r.sources.length ? (
              <ul>
                {r.sources.map((s) => (
                  <li key={s.recipe}>
                    {s.recipe}
                    {s.amount && <b>{s.amount}</b>}
                  </li>
                ))}
              </ul>
            ) : (
              <span class="rz-leise">{tr("shoppingOwnItem")}</span>
            )}
          </div>
          {r.notes.length > 0 && (
            <ul class="rz-ek-notizen">
              {r.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          <button type="button" class="rz-knopf rz-knopf-klein" onClick={p.onRemove}>
            <Icon n="papierkorb" large={15} />
            {tr("shoppingRemoveItem")}
          </button>
        </div>
      )}
    </li>
  );
}

/** Open items by store, the "all done" note, the empty state and the done part. */
export function ShoppingList(p: {
  view: ShoppingView;
  ui: ShoppingUi;
  showDone: boolean;
  onShowDone: (open: boolean) => void;
  onCheck: (r: ShoppingRow) => void;
  onRemove: (r: ShoppingRow) => void;
  onClear: () => void;
}) {
  const { view, ui } = p;
  const row = (r: ShoppingRow) => (
    <Row
      key={rowKey(r)}
      r={r}
      open={ui.openRow === rowKey(r)}
      onOpen={() => ui.setOpenRow(ui.openRow === rowKey(r) ? null : rowKey(r))}
      onCheck={() => p.onCheck(r)}
      onRemove={() => p.onRemove(r)}
    />
  );
  const named = view.groups.some((g) => g.name !== undefined);
  const empty = view.open === 0 && view.done.length === 0;
  return (
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
          open={p.showDone}
          onToggle={() => p.onShowDone(!p.showDone)}
          onClear={p.onClear}
          row={row}
        />
      )}
    </div>
  );
}
