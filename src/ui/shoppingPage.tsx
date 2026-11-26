// Shopping list page (issue #64): the list note shown as a checklist; the note stays the storage.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { shoppingView, type ShoppingEdit, type ShoppingRow } from "../shoppingEdit";
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
    p.onEdit({ kind: "check", raw: r.raw, checked: !r.checked });
  };
  const row = (r: ShoppingRow) => (
    <Row
      key={r.raw}
      r={r}
      open={openRow === r.raw}
      onOpen={() => setOpenRow(openRow === r.raw ? null : r.raw)}
      onCheck={() => check(r)}
      onRemove={() => p.onEdit({ kind: "remove", raw: r.raw })}
    />
  );
  const named = view.groups.some((g) => g.name !== undefined);
  const empty = view.open === 0 && view.done.length === 0;

  return (
    <div class="rz-uebersicht rz-einkauf">
      <header class="rz-ue-kopf">
        <div class="rz-ue-titelzeile">
          <button type="button" class="rz-symbol rz-nur-schmal" aria-label={tr("back")} onClick={p.onBack}>
            <Icon n="links" large={22} />
          </button>
          <h1 id="rz-titel" class="rz-ue-titel rz-ek-titel">
            {tr("pageShopping")}
          </h1>
          <button
            type="button"
            class="rz-knopf rz-knopf-klein rz-ek-notiz"
            aria-label={tr("shoppingOpenNote")}
            onClick={p.onOpenNote}
          >
            <Icon n="notiz" large={15} />
            <span class="rz-ek-notiz-text">{tr("shoppingOpenNote")}</span>
          </button>
        </div>
      </header>
      <form
        class="rz-ek-neu"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          p.onEdit({ kind: "add", text: draft });
          setDraft("");
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
            value={draft}
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          />
        </label>
        <button type="submit" class="rz-rund" aria-label={tr("shoppingAddButton")} disabled={!draft.trim()}>
          <Icon n="plus" large={22} />
        </button>
      </form>
      <div class="rz-ek-oben">
        {view.recipes.length > 0 && (
          <div class="rz-ek-rezepte">
            <span class="rz-ek-fuer">{tr("shoppingFor")}</span>
            <ul class="rz-ek-chips">
              {view.recipes.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    class={`rz-chip rz-ek-chip${askRecipe === name ? " an" : ""}`}
                    aria-pressed={askRecipe === name}
                    onClick={() => setAskRecipe(askRecipe === name ? null : name)}
                  >
                    {name}
                    <Icon n="x" large={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {askRecipe && (
          <div class="rz-ek-frage" role="alert">
            <p>{tr("shoppingRemoveRecipeAsk", { recipe: askRecipe })}</p>
            <div class="rz-ek-frage-knoepfe">
              <button
                type="button"
                class="rz-knopf rz-knopf-haupt rz-knopf-klein"
                onClick={() => {
                  p.onEdit({ kind: "removeRecipe", recipe: askRecipe });
                  setAskRecipe(null);
                }}
              >
                {tr("shoppingRemove")}
              </button>
              <button type="button" class="rz-knopf rz-knopf-klein" onClick={() => setAskRecipe(null)}>
                {tr("cancel")}
              </button>
            </div>
          </div>
        )}
      </div>

      <div ref={listRef}>
        {empty && (
          <div class="rz-leer rz-ek-leer">
            <span class="rz-leer-icon">
              <Icon n="wagen" large={30} />
            </span>
            <span class="rz-leer-titel">{tr("shoppingEmptyTitle")}</span>
            <p>{tr("shoppingEmptyHint")}</p>
          </div>
        )}
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
          <section class="rz-ek-gruppe rz-ek-erledigt">
            <div class="rz-ek-erledigt-kopf">
              <button
                type="button"
                class="rz-ek-erledigt-knopf"
                aria-expanded={showDone}
                onClick={() => setShowDone(!showDone)}
              >
                <Icon n="unten" large={18} className={showDone ? "auf" : ""} />
                {tr("shoppingDone", { n: view.done.length })}
              </button>
              <button type="button" class="rz-knopf rz-knopf-klein" onClick={() => p.onEdit({ kind: "clearDone" })}>
                <Icon n="papierkorb" large={15} />
                {tr("shoppingClearDone")}
              </button>
            </div>
            {showDone && <ul class="rz-ek-liste">{view.done.map(row)}</ul>}
          </section>
        )}
      </div>
    </div>
  );
}

function Row(p: { r: ShoppingRow; open: boolean; onOpen: () => void; onCheck: () => void; onRemove: () => void }) {
  const { r } = p;
  const label = [r.amount, r.name].filter(Boolean).join(" ");
  return (
    <li class={`rz-ek-zeile${r.checked ? " erledigt" : ""}${p.open ? " offen" : ""}`} data-raw={r.raw}>
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
          <button type="button" class="rz-knopf rz-knopf-klein" onClick={p.onRemove}>
            <Icon n="papierkorb" large={15} />
            {tr("shoppingRemoveItem")}
          </button>
        </div>
      )}
    </li>
  );
}
