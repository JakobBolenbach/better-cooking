// Seitenleiste (breit) mit Listen, Kategorien, Suche und Darstellung; dazu das Fenster für Listen und Ansicht (schmal).
// Teil der Oberfläche aus src/ui/App.tsx (Preact), ohne Obsidian.
import type { Job, ColorMode } from "../types";
import { Modal, type List } from "./shared";
import { Icon, type IconName } from "./icons";

// ---------------------------------------------------------------- Seitenleiste (breit)

export function Sidebar(p: {
  lists: { id: List; name: string; icon: IconName; count: number }[];
  categories: [string, number][];
  discarded: number;
  active: List | null;
  onList: (l: List) => void;
  search: string;
  onSearch: (s: string) => void;
  searchRef: { current: HTMLInputElement | null };
  onImport: () => void;
  mode: ColorMode;
  onMode: (m: ColorMode) => void;
  jobs: Job[];
}) {
  const running = p.jobs.filter((a) => !a.error).length;
  return (
    <nav class="rz-seite" aria-labelledby="rz-seite-titel">
      <div class="rz-marke-kopf">
        <span class="rz-logo">
          <Icon n="muetze" large={20} />
        </span>
        <span id="rz-seite-titel" class="rz-seite-titel">
          Rezepte
        </span>
      </div>
      <SearchField value={p.search} onValue={p.onSearch} fieldRef={p.searchRef} />
      <button type="button" class="rz-knopf rz-knopf-haupt rz-voll" onClick={p.onImport}>
        <Icon n="plus" />
        Rezept holen
        {running > 0 && <span class="rz-zahl-klein">{running}</span>}
      </button>
      <ListNav lists={p.lists} categories={p.categories} discarded={p.discarded} active={p.active} onList={p.onList} />
      <div class="rz-seite-fuss">
        <Appearance mode={p.mode} onMode={p.onMode} />
      </div>
    </nav>
  );
}

/** Listen, Kategorien und Verworfen: in der Seitenleiste (breit) und im Fenster „Ansicht“ (schmal). */
export function ListNav(p: {
  lists: { id: List; name: string; icon: IconName; count: number }[];
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
          <div class="rz-nav-kopf">Kategorien</div>
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
              <span class="rz-nav-name">Verworfen</span>
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
    ["system", "monitor", "Automatisch"],
    ["hell", "sonne", "Hell"],
    ["dunkel", "mond", "Dunkel"],
  ];
  return (
    <div
      class={`rz-segment rz-segment-klein${labeled ? " rz-segment-beschriftet" : ""}`}
      role="radiogroup"
      aria-label="Darstellung"
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
      <span class="rz-sr">Rezepte durchsuchen</span>
      <input
        ref={fieldRef}
        type="search"
        enterkeyhint="search"
        autocomplete="off"
        spellcheck={false}
        placeholder="Rezept, Zutat oder Kategorie"
        value={value}
        onInput={(e) => onValue((e.target as HTMLInputElement).value)}
      />
      {value && (
        <button
          type="button"
          class="rz-suche-weg"
          aria-label="Suche leeren"
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

/** Schmale Ansicht: alles, was breit in der Seitenleiste steht (Listen mit Anzahl, Kategorien, Verworfen, Darstellung). */
export function ViewModal(p: {
  lists: { id: List; name: string; icon: IconName; count: number }[];
  categories: [string, number][];
  discarded: number;
  active: List | null;
  onList: (l: List) => void;
  mode: ColorMode;
  onMode: (m: ColorMode) => void;
  onImport: () => void;
  running: number;
  onCloseView: () => void;
}) {
  return (
    <Modal title="Listen und Ansicht" onCloseView={p.onCloseView} id="rz-ansicht-titel">
      <div class="rz-ansicht-listen">
        <ListNav
          lists={p.lists}
          categories={p.categories}
          discarded={p.discarded}
          active={p.active}
          onList={p.onList}
        />
      </div>
      <div class="rz-feld">
        <span class="rz-feld-name">Darstellung</span>
        <Appearance mode={p.mode} onMode={p.onMode} labeled />
      </div>
      <button type="button" class="rz-knopf rz-knopf-haupt rz-voll" onClick={p.onImport}>
        <Icon n="plus" />
        Rezept holen
        {p.running > 0 && <span class="rz-zahl-klein">{p.running} läuft</span>}
      </button>
    </Modal>
  );
}
