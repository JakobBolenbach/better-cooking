// Sidebar (wide) with lists, categories, search and appearance; plus the modal for lists and view (narrow).
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import type { Job, ColorMode } from "../types";
import { jobFailed } from "../processor";
import { Modal, type List } from "./shared";
import { SUBPAGES, type Page } from "./pages";
import { Icon, type IconName } from "./icons";
import type { ListEntry } from "./lists";
import { tr } from "../i18n";

// ---------------------------------------------------------------- Sidebar (wide)

export function Sidebar(p: {
  lists: ListEntry[];
  categories: [string, number][];
  discarded: number;
  active: List | null;
  onList: (l: List) => void;
  search: string;
  onSearch: (s: string) => void;
  searchRef: { current: HTMLInputElement | null };
  onImport: () => void;
  mode: ColorMode;
  /** Not set when the colors follow the Obsidian theme. */
  onMode?: (m: ColorMode) => void;
  jobs: Job[];
  page: Page;
  onPage: (page: Page) => void;
  /** Open items on the shopping list. */
  shoppingOpen: number;
}) {
  const running = p.jobs.filter((a) => !jobFailed(a)).length;
  return (
    <nav class="rz-seite" aria-labelledby="rz-seite-titel">
      <div class="rz-marke-kopf">
        <span class="rz-logo">
          <Icon n="muetze" large={20} />
        </span>
        <span id="rz-seite-titel" class="rz-seite-titel">
          {tr("appName")}
        </span>
      </div>
      <SearchField value={p.search} onValue={p.onSearch} fieldRef={p.searchRef} />
      <button type="button" class="rz-knopf rz-knopf-haupt rz-voll" onClick={p.onImport}>
        <Icon n="plus" />
        {tr("fetchRecipe")}
        {running > 0 && <span class="rz-zahl-klein">{running}</span>}
      </button>
      <PageNav page={p.page} onPage={p.onPage} shoppingOpen={p.shoppingOpen} />
      <ListNav
        lists={p.lists}
        categories={p.categories}
        discarded={p.discarded}
        active={p.page === "overview" ? p.active : null}
        onList={p.onList}
      />
      <div class="rz-seite-fuss">{p.onMode && <Appearance mode={p.mode} onMode={p.onMode} />}</div>
    </nav>
  );
}

/** Shopping list and meal plan: in the sidebar (wide) and in the "Ansicht" modal (narrow). */
export function PageNav(p: { page: Page; onPage: (page: Page) => void; shoppingOpen: number }) {
  return (
    <>
      <div class="rz-nav-kopf">{tr("navPlanning")}</div>
      <ul class="rz-nav">
        {SUBPAGES.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              class={`rz-nav-zeile${p.page === s.id ? " aktiv" : ""}`}
              aria-current={p.page === s.id ? "page" : undefined}
              onClick={() => p.onPage(s.id)}
            >
              <Icon n={s.icon} />
              <span class="rz-nav-name">{tr(s.label)}</span>
              {s.id === "shopping" && p.shoppingOpen > 0 && (
                <span class="rz-nav-zahl" aria-label={tr("shoppingOpenCount", { n: p.shoppingOpen })}>
                  {p.shoppingOpen}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Lists, categories and discarded: in the sidebar (wide) and in the "Ansicht" modal (narrow). */
export function ListNav(p: {
  lists: ListEntry[];
  categories: [string, number][];
  discarded: number;
  active: List | null;
  onList: (l: List) => void;
}) {
  return (
    <>
      <ul class="rz-nav">
        {p.lists.map((l) => (
          <li key={l.id}>
            <button
              type="button"
              class={`rz-nav-zeile${p.active === l.id ? " aktiv" : ""}`}
              aria-current={p.active === l.id ? "page" : undefined}
              onClick={() => p.onList(l.id)}
            >
              <Icon n={l.icon} />
              <span class="rz-nav-name">{l.name}</span>
              <span class="rz-nav-zahl">{l.count}</span>
            </button>
          </li>
        ))}
      </ul>
      {p.categories.length > 0 && (
        <>
          <div class="rz-nav-kopf">{tr("categories")}</div>
          <ul class="rz-nav">
            {p.categories.map(([k, n]) => (
              <li key={k}>
                <button
                  type="button"
                  class={`rz-nav-zeile${p.active === `kat:${k}` ? " aktiv" : ""}`}
                  onClick={() => p.onList(`kat:${k}`)}
                >
                  <Icon n="etikett" />
                  <span class="rz-nav-name">{k}</span>
                  <span class="rz-nav-zahl">{n}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {p.discarded > 0 && (
        <ul class="rz-nav rz-nav-unten">
          <li>
            <button
              type="button"
              class={`rz-nav-zeile${p.active === "verworfen" ? " aktiv" : ""}`}
              onClick={() => p.onList("verworfen")}
            >
              <Icon n="daumen" />
              <span class="rz-nav-name">{tr("listDiscarded")}</span>
              <span class="rz-nav-zahl">{p.discarded}</span>
            </button>
          </li>
        </ul>
      )}
    </>
  );
}

export function Appearance({
  mode,
  onMode,
  labeled,
}: {
  mode: ColorMode;
  onMode: (m: ColorMode) => void;
  labeled?: boolean;
}) {
  const opt: [ColorMode, IconName, string][] = [
    ["system", "monitor", tr("modeAuto")],
    ["hell", "sonne", tr("modeLight")],
    ["dunkel", "mond", tr("modeDark")],
  ];
  return (
    <div
      class={`rz-segment rz-segment-klein${labeled ? " rz-segment-beschriftet" : ""}`}
      role="radiogroup"
      aria-label={tr("appearance")}
    >
      {opt.map(([m, ic, name]) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          aria-label={name}
          class={mode === m ? "an" : ""}
          onClick={() => onMode(m)}
        >
          <Icon n={ic} large={16} />
          {labeled && <span>{name}</span>}
        </button>
      ))}
    </div>
  );
}

export function SearchField({
  value,
  onValue,
  fieldRef,
  large,
}: {
  value: string;
  onValue: (s: string) => void;
  fieldRef: { current: HTMLInputElement | null };
  large?: boolean;
}) {
  return (
    <label class={`rz-suche${large ? " gross" : ""}`}>
      <Icon n="suche" />
      <span class="rz-sr">{tr("searchRecipes")}</span>
      <input
        ref={fieldRef}
        type="search"
        enterkeyhint="search"
        autocomplete="off"
        spellcheck={false}
        placeholder={tr("searchPlaceholder")}
        value={value}
        onInput={(e) => onValue((e.target as HTMLInputElement).value)}
      />
      {value && (
        <button
          type="button"
          class="rz-suche-weg"
          aria-label={tr("clearSearch")}
          onClick={() => {
            onValue("");
            fieldRef.current?.focus();
          }}
        >
          <Icon n="x" large={14} />
        </button>
      )}
    </label>
  );
}

/** Narrow layout: everything the wide layout has in the sidebar (lists with counts, categories, discarded, appearance). */
export function ViewModal(p: {
  lists: ListEntry[];
  categories: [string, number][];
  discarded: number;
  active: List | null;
  onList: (l: List) => void;
  mode: ColorMode;
  /** Not set when the colors follow the Obsidian theme. */
  onMode?: (m: ColorMode) => void;
  onImport: () => void;
  running: number;
  page: Page;
  onPage: (page: Page) => void;
  shoppingOpen: number;
  onCloseView: () => void;
}) {
  return (
    <Modal title={tr("listsAndView")} onCloseView={p.onCloseView} id="rz-ansicht-titel">
      <div class="rz-ansicht-listen">
        <PageNav page={p.page} onPage={p.onPage} shoppingOpen={p.shoppingOpen} />
        <ListNav
          lists={p.lists}
          categories={p.categories}
          discarded={p.discarded}
          active={p.page === "overview" ? p.active : null}
          onList={p.onList}
        />
      </div>
      {p.onMode && (
        <div class="rz-feld">
          <span class="rz-feld-name">{tr("appearance")}</span>
          <Appearance mode={p.mode} onMode={p.onMode} labeled />
        </div>
      )}
      <button type="button" class="rz-knopf rz-knopf-haupt rz-voll" onClick={p.onImport}>
        <Icon n="plus" />
        {tr("fetchRecipe")}
        {p.running > 0 && <span class="rz-zahl-klein">{tr("running", { n: p.running })}</span>}
      </button>
    </Modal>
  );
}
