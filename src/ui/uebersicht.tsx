// Übersicht: Kopf mit Listen-Chips und Suche, Raster der Rezeptkarten, leerer Zustand.
// Teil der Oberfläche aus src/ui/App.tsx (Preact), ohne Obsidian.
import { useEffect, useMemo, useRef } from "preact/hooks";
import { FELDNAMEN, type Treffer } from "../suche";
import type { Auftrag, RezeptAnsicht } from "../types";
import { AuftragsKarte } from "./auftraege";
import { Bild, type Liste, StatusMarke, Sterne, zeitKurz } from "./gemeinsam";
import { Icon, type IconName } from "./icons";
import { Suchfeld } from "./seitenleiste";

// ---------------------------------------------------------------- Übersicht

export function Uebersicht(p: {
  titel: string;
  liste: Liste;
  listen: { id: Liste; name: string; icon: IconName; anzahl: number }[];
  kategorien: [string, number][];
  verworfen: number;
  rezepte: RezeptAnsicht[];
  treffer: Treffer[] | null;
  suche: string;
  onSuche: (s: string) => void;
  sucheRef: { current: HTMLInputElement | null };
  onListe: (l: Liste) => void;
  onRezept: (pfad: string) => void;
  onImport: () => void;
  auftraege: Auftrag[];
  laufend: number;
  onAuftragWeg: (id: string) => void;
  onNochmal: (id: string) => Promise<void>;
  onAnsicht: () => void;
  gesamt: number;
  ordner?: string;
}) {
  const trefferNach = useMemo(() => new Map((p.treffer ?? []).map((t) => [t.pfad, t])), [p.treffer]);
  const chipsRef = useRef<HTMLDivElement>(null);
  // Gewählte Liste sichtbar halten, auch wenn sie über „Listen und Ansicht“ gewählt wurde und rechts außerhalb liegt.
  useEffect(() => {
    chipsRef.current
      ?.querySelector<HTMLElement>(".rz-chip.an")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [p.liste]);
  const ungefaehr = p.treffer?.[0]?.ungefaehr;
  const chips: { id: Liste; name: string }[] = [
    ...p.listen.map((l) => ({ id: l.id, name: l.id === "alle" ? "Alle" : l.name })),
    ...p.kategorien.map(([k]) => ({ id: `kat:${k}` as Liste, name: k })),
    ...(p.verworfen ? [{ id: "verworfen" as Liste, name: "Verworfen" }] : []),
  ];
  return (
    <div class="rz-uebersicht">
      <header class="rz-ue-kopf">
        <div class="rz-ue-titelzeile">
          <h1 id="rz-titel" class="rz-ue-titel">
            {p.titel}
          </h1>
          <span class="rz-titel-knoepfe rz-nur-schmal">
            <button type="button" class="rz-rund rz-rund-leise" aria-label="Listen und Ansicht" onClick={p.onAnsicht}>
              <Icon n="regler" gross={19} />
            </button>
            <button
              type="button"
              class="rz-rund"
              aria-label={p.laufend ? `Rezept holen, ${p.laufend} läuft` : "Rezept holen"}
              onClick={p.onImport}
            >
              <Icon n="plus" gross={20} />
              {p.laufend > 0 && <span class="rz-rund-zahl">{p.laufend}</span>}
            </button>
          </span>
        </div>
        <div class="rz-nur-schmal">
          <Suchfeld wert={p.suche} onWert={p.onSuche} feldRef={p.sucheRef} gross />
        </div>
        {!p.treffer && (
          <div class="rz-chips rz-nur-schmal" role="tablist" aria-label="Listen" ref={chipsRef}>
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={p.liste === c.id}
                class={`rz-chip${p.liste === c.id ? " an" : ""}`}
                onClick={() => p.onListe(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        {p.treffer && (
          <p class="rz-ue-info">
            {p.treffer.length
              ? `${p.treffer.length} ${p.treffer.length === 1 ? "Rezept" : "Rezepte"} für „${p.suche.trim()}“`
              : `Nichts gefunden für „${p.suche.trim()}“.`}
            {ungefaehr && " Nicht alle Wörter passen, ähnliche Treffer."}
          </p>
        )}
      </header>

      {p.gesamt === 0 && !p.auftraege.length ? (
        <div class="rz-leer">
          <span class="rz-leer-icon">
            <Icon n="muetze" gross={32} />
          </span>
          <p class="rz-leer-titel">Noch keine Rezepte</p>
          <p>Füge einen Link zu einem Rezept ein, den Rest erledigt der Import.</p>
          {p.ordner !== undefined && (
            <p class="rz-leer-ordner">
              Gelesen wird der Ordner „{p.ordner || "/"}“. Ändern in den Einstellungen von Better Cooking.
            </p>
          )}
          <button type="button" class="rz-knopf rz-knopf-haupt" onClick={p.onImport}>
            <Icon n="plus" />
            Rezept holen
          </button>
        </div>
      ) : (
        <ul class="rz-raster" aria-label={p.titel}>
          {p.auftraege.map((a) => (
            <li key={a.id}>
              <AuftragsKarte a={a} onWeg={() => p.onAuftragWeg(a.id)} onNochmal={() => p.onNochmal(a.id)} />
            </li>
          ))}
          {p.rezepte.map((r) => (
            <li key={r.pfad}>
              <Karte r={r} treffer={trefferNach.get(r.pfad)} onKlick={() => p.onRezept(r.pfad)} />
            </li>
          ))}
          {!p.rezepte.length && !p.auftraege.length && !p.treffer && (
            <li class="rz-raster-leer">In dieser Liste ist noch nichts.</li>
          )}
        </ul>
      )}
    </div>
  );
}

export function Karte({ r, treffer, onKlick }: { r: RezeptAnsicht; treffer?: Treffer; onKlick: () => void }) {
  const zeit = zeitKurz(r.zeitGesamt);
  const grund =
    treffer &&
    treffer.felder
      .filter((f) => f !== "titel")
      .slice(0, 2)
      .map((f) => FELDNAMEN[f])
      .join(", ");
  return (
    <button type="button" class="rz-karte" onClick={onKlick}>
      <span class="rz-karte-bild">
        <Bild src={r.bildSrc} alt="" />
        {r.status !== "ausprobieren" && <StatusMarke s={r.status} />}
        {r.importStand && r.importStand !== "fertig" && (
          <span class="rz-marke rz-marke-import">
            <Icon n="warnung" gross={13} />
            Import {r.importStand}
          </span>
        )}
      </span>
      <span class="rz-karte-text">
        <span class="rz-karte-titel">{r.titel}</span>
        <span class="rz-karte-meta">
          {zeit && (
            <span>
              <Icon n="uhr" gross={13} />
              {zeit}
            </span>
          )}
          {r.kategorie && <span>{r.kategorie}</span>}
          {r.status === "ausprobieren" && <span class="rz-meta-test">zum Testen</span>}
          <Sterne wert={r.bewertung} />
        </span>
        {grund && <span class="rz-karte-grund">Treffer in {grund}</span>}
      </span>
    </button>
  );
}
