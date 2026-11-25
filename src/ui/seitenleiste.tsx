// Seitenleiste (breit) mit Listen, Kategorien, Suche und Darstellung; dazu das Fenster für Listen und Ansicht (schmal).
// Teil der Oberfläche aus src/ui/App.tsx (Preact), ohne Obsidian.
import type { Auftrag, DesignModus } from "../types";
import { Fenster, type Liste } from "./gemeinsam";
import { Icon, type IconName } from "./icons";

// ---------------------------------------------------------------- Seitenleiste (breit)

export function Seitenleiste(p: {
  listen: { id: Liste; name: string; icon: IconName; anzahl: number }[];
  kategorien: [string, number][];
  verworfen: number;
  aktiv: Liste | null;
  onListe: (l: Liste) => void;
  suche: string;
  onSuche: (s: string) => void;
  sucheRef: { current: HTMLInputElement | null };
  onImport: () => void;
  modus: DesignModus;
  onModus: (m: DesignModus) => void;
  auftraege: Auftrag[];
}) {
  const laeuft = p.auftraege.filter((a) => !a.fehler).length;
  return (
    <nav class="rz-seite" aria-labelledby="rz-seite-titel">
      <div class="rz-marke-kopf">
        <span class="rz-logo">
          <Icon n="muetze" gross={20} />
        </span>
        <span id="rz-seite-titel" class="rz-seite-titel">
          Rezepte
        </span>
      </div>
      <Suchfeld wert={p.suche} onWert={p.onSuche} feldRef={p.sucheRef} />
      <button type="button" class="rz-knopf rz-knopf-haupt rz-voll" onClick={p.onImport}>
        <Icon n="plus" />
        Rezept holen
        {laeuft > 0 && <span class="rz-zahl-klein">{laeuft}</span>}
      </button>
      <ListenNav
        listen={p.listen}
        kategorien={p.kategorien}
        verworfen={p.verworfen}
        aktiv={p.aktiv}
        onListe={p.onListe}
      />
      <div class="rz-seite-fuss">
        <Darstellung modus={p.modus} onModus={p.onModus} />
      </div>
    </nav>
  );
}

/** Listen, Kategorien und Verworfen: in der Seitenleiste (breit) und im Fenster „Ansicht“ (schmal). */
export function ListenNav(p: {
  listen: { id: Liste; name: string; icon: IconName; anzahl: number }[];
  kategorien: [string, number][];
  verworfen: number;
  aktiv: Liste | null;
  onListe: (l: Liste) => void;
}) {
  return (
    <>
      <ul class="rz-nav">
        {p.listen.map((l) => (
          <li key={l.id}>
            <button
              type="button"
              class={`rz-nav-zeile${p.aktiv === l.id ? " aktiv" : ""}`}
              aria-current={p.aktiv === l.id ? "page" : undefined}
              onClick={() => p.onListe(l.id)}
            >
              <Icon n={l.icon} />
              <span class="rz-nav-name">{l.name}</span>
              <span class="rz-nav-zahl">{l.anzahl}</span>
            </button>
          </li>
        ))}
      </ul>
      {p.kategorien.length > 0 && (
        <>
          <div class="rz-nav-kopf">Kategorien</div>
          <ul class="rz-nav">
            {p.kategorien.map(([k, n]) => (
              <li key={k}>
                <button
                  type="button"
                  class={`rz-nav-zeile${p.aktiv === `kat:${k}` ? " aktiv" : ""}`}
                  onClick={() => p.onListe(`kat:${k}`)}
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
      {p.verworfen > 0 && (
        <ul class="rz-nav rz-nav-unten">
          <li>
            <button
              type="button"
              class={`rz-nav-zeile${p.aktiv === "verworfen" ? " aktiv" : ""}`}
              onClick={() => p.onListe("verworfen")}
            >
              <Icon n="daumen" />
              <span class="rz-nav-name">Verworfen</span>
              <span class="rz-nav-zahl">{p.verworfen}</span>
            </button>
          </li>
        </ul>
      )}
    </>
  );
}

export function Darstellung({
  modus,
  onModus,
  beschriftet,
}: {
  modus: DesignModus;
  onModus: (m: DesignModus) => void;
  beschriftet?: boolean;
}) {
  const opt: [DesignModus, IconName, string][] = [
    ["system", "monitor", "Automatisch"],
    ["hell", "sonne", "Hell"],
    ["dunkel", "mond", "Dunkel"],
  ];
  return (
    <div
      class={`rz-segment rz-segment-klein${beschriftet ? " rz-segment-beschriftet" : ""}`}
      role="radiogroup"
      aria-label="Darstellung"
    >
      {opt.map(([m, ic, name]) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={modus === m}
          aria-label={name}
          class={modus === m ? "an" : ""}
          onClick={() => onModus(m)}
        >
          <Icon n={ic} gross={16} />
          {beschriftet && <span>{name}</span>}
        </button>
      ))}
    </div>
  );
}

export function Suchfeld({
  wert,
  onWert,
  feldRef,
  gross,
}: {
  wert: string;
  onWert: (s: string) => void;
  feldRef: { current: HTMLInputElement | null };
  gross?: boolean;
}) {
  return (
    <label class={`rz-suche${gross ? " gross" : ""}`}>
      <Icon n="suche" />
      <span class="rz-sr">Rezepte durchsuchen</span>
      <input
        ref={feldRef}
        type="search"
        enterkeyhint="search"
        autocomplete="off"
        spellcheck={false}
        placeholder="Rezept, Zutat oder Kategorie"
        value={wert}
        onInput={(e) => onWert((e.target as HTMLInputElement).value)}
      />
      {wert && (
        <button
          type="button"
          class="rz-suche-weg"
          aria-label="Suche leeren"
          onClick={() => {
            onWert("");
            feldRef.current?.focus();
          }}
        >
          <Icon n="x" gross={14} />
        </button>
      )}
    </label>
  );
}

/** Schmale Ansicht: alles, was breit in der Seitenleiste steht (Listen mit Anzahl, Kategorien, Verworfen, Darstellung). */
export function AnsichtFenster(p: {
  listen: { id: Liste; name: string; icon: IconName; anzahl: number }[];
  kategorien: [string, number][];
  verworfen: number;
  aktiv: Liste | null;
  onListe: (l: Liste) => void;
  modus: DesignModus;
  onModus: (m: DesignModus) => void;
  onImport: () => void;
  laufend: number;
  onZu: () => void;
}) {
  return (
    <Fenster titel="Listen und Ansicht" onZu={p.onZu} id="rz-ansicht-titel">
      <div class="rz-ansicht-listen">
        <ListenNav
          listen={p.listen}
          kategorien={p.kategorien}
          verworfen={p.verworfen}
          aktiv={p.aktiv}
          onListe={p.onListe}
        />
      </div>
      <div class="rz-feld">
        <span class="rz-feld-name">Darstellung</span>
        <Darstellung modus={p.modus} onModus={p.onModus} beschriftet />
      </div>
      <button type="button" class="rz-knopf rz-knopf-haupt rz-voll" onClick={p.onImport}>
        <Icon n="plus" />
        Rezept holen
        {p.laufend > 0 && <span class="rz-zahl-klein">{p.laufend} läuft</span>}
      </button>
    </Fenster>
  );
}
