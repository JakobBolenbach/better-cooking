// Rezeptseite: Kopf mit Bild und Eckdaten, Portionen, Zutaten, Schritte, Tipps, Versuche.
// Teil der Oberfläche aus src/ui/App.tsx (Preact), ohne Obsidian.
import { useState } from "preact/hooks";
import { naechstePortion } from "../mengen";
import { heuteIso, isoZuDe } from "../parse";
import type { RezeptAnsicht, Status, Theme } from "../types";
import { Ablauf, Bild, Inline, STATUS_TEXT, Sterne, useZurueckWischen, zeitKurz } from "./gemeinsam";
import { Icon } from "./icons";
import { MitUhren, Schritttitel, Zutatenliste } from "./zutaten";

// ---------------------------------------------------------------- Rezeptseite

export function Rezeptseite(p: {
  r: RezeptAnsicht;
  theme: Theme;
  faktor: number;
  portion?: number;
  onPortion: (n: number) => void;
  abgehakt: string[];
  onHaken: (k: string) => void;
  onZurueck: () => void;
  onKochen: () => void;
  onUhr: (titel: string, sek: number) => void;
  onStatus: (s: Status) => void;
  onBewertung: (n: number | null) => void;
  onGemacht: () => void;
  onVersuch: () => void;
  onOeffnen: () => void;
}) {
  const { r } = p;
  const [gescrollt, setGescrollt] = useState(false);
  const [ablaufZu, setAblaufZu] = useState(false);
  const wisch = useZurueckWischen(p.onZurueck);
  const host = r.quelle
    ? (() => {
        try {
          return new URL(r.quelle).hostname.replace(/^www\./, "");
        } catch {
          return undefined;
        }
      })()
    : undefined;
  const heute = heuteIso();
  return (
    <article
      class="rz-detail"
      aria-labelledby="rz-rezept-titel"
      ref={wisch.ref}
      onScroll={(e) => setGescrollt((e.target as HTMLElement).scrollTop > 160)}
    >
      <div class={`rz-detail-leiste${gescrollt ? " gescrollt" : ""}`}>
        <button type="button" class="rz-zurueck" onClick={p.onZurueck}>
          <Icon n="links" gross={20} />
          <span>Rezepte</span>
        </button>
        <span class="rz-leiste-titel" aria-hidden="true">
          {r.titel}
        </span>
        <div class="rz-leiste-aktionen">
          <button type="button" class="rz-symbol" aria-label="In Obsidian öffnen" onClick={p.onOeffnen}>
            <Icon n="notiz" />
          </button>
          {r.schritte.length > 0 && (
            <button type="button" class="rz-knopf rz-knopf-haupt rz-knopf-klein" onClick={p.onKochen}>
              <Icon n="flamme" gross={16} />
              Kochen
            </button>
          )}
        </div>
      </div>

      <header class="rz-held">
        <div class="rz-held-bild">
          <Bild src={r.bildSrc} alt={r.titel} />
        </div>
        <div class="rz-held-text">
          {r.kategorie && <span class="rz-oberzeile">{r.kategorie}</span>}
          <h1 id="rz-rezept-titel" class="rz-rezept-titel">
            {r.titel}
          </h1>
          {r.beschreibung && (
            <p class="rz-beschreibung">
              <Inline text={r.beschreibung} />
            </p>
          )}
          <ul class="rz-fakten">
            {r.zeitGesamt && (
              <li>
                <Icon n="uhr" />
                <span>
                  <b>{zeitKurz(r.zeitGesamt)}</b> gesamt
                </span>
              </li>
            )}
            {r.zeitAktiv && (
              <li>
                <Icon n="besteck" />
                <span>
                  <b>{zeitKurz(r.zeitAktiv)}</b> Arbeit
                </span>
              </li>
            )}
            {r.ergebnis && (
              <li>
                <Icon n="personen" />
                <span>
                  <b>{r.ergebnis}</b>
                </span>
              </li>
            )}
          </ul>
          {(r.autor || r.quelle) && (
            <p class="rz-quelle">
              {r.autor && <span>{r.autor}</span>}
              {r.quelle && (
                <a href={r.quelle} target="_blank" rel="noopener">
                  <Icon n="extern" gross={14} />
                  {host ?? "Quelle"}
                </a>
              )}
            </p>
          )}
          {r.importStand && r.importStand !== "fertig" && (
            <p class="rz-hinweis rz-hinweis-warn">
              <Icon n="warnung" gross={16} />
              Import {r.importStand}
              {r.importFehler ? `: ${r.importFehler}` : ""}
            </p>
          )}
        </div>
      </header>

      <section class="rz-pflege" aria-label="Stand und Bewertung">
        <div class="rz-segment" role="radiogroup" aria-label="Stand">
          {(["ausprobieren", "bewaehrt", "verworfen"] as Status[]).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={r.status === s}
              class={r.status === s ? `an an-${s}` : ""}
              onClick={() => p.onStatus(s)}
            >
              {STATUS_TEXT[s]}
            </button>
          ))}
        </div>
        <Sterne wert={r.bewertung} onWert={p.onBewertung} />
        <div class="rz-pflege-knoepfe">
          <button type="button" class="rz-knopf" disabled={r.zuletztGemacht === heute} onClick={p.onGemacht}>
            <Icon n="gemacht" gross={16} />
            {r.zuletztGemacht === heute
              ? "Heute gemacht"
              : r.zuletztGemacht
                ? `Zuletzt ${isoZuDe(r.zuletztGemacht)} · heute`
                : "Heute gemacht"}
          </button>
          <button type="button" class="rz-knopf" onClick={p.onVersuch}>
            <Icon n="stift" gross={16} />
            Versuch notieren
          </button>
        </div>
      </section>

      <div class="rz-koerper">
        <aside class="rz-spalte-zutaten" aria-labelledby="rz-zutaten-titel">
          <div class="rz-zutaten-karte">
            <div class="rz-zutaten-kopf">
              <h2 id="rz-zutaten-titel" class="rz-h2">
                Zutaten
              </h2>
              <PortionenRegler r={r} faktor={p.faktor} portion={p.portion} onPortion={p.onPortion} />
            </div>
            <Zutatenliste r={r} faktor={p.faktor} abgehakt={p.abgehakt} onHaken={p.onHaken} />
            {p.faktor !== 1 && (
              <p class="rz-fussnote">
                Mengen in den Schritten gelten für{" "}
                {r.portionen ? `${fmt(r.portionen.anzahl)} ${r.portionen.einheit}` : "die Originalmenge"}.
              </p>
            )}
          </div>
        </aside>

        <div class="rz-spalte-haupt">
          {r.ablaufSvg && (
            <section class="rz-abschnitt" aria-labelledby="rz-ablauf-titel">
              <button
                type="button"
                class="rz-abschnitt-kopf"
                aria-expanded={!ablaufZu}
                onClick={() => setAblaufZu(!ablaufZu)}
              >
                <h2 id="rz-ablauf-titel" class="rz-h2">
                  Zeitplan
                </h2>
                <Icon n={ablaufZu ? "rechts" : "links"} klasse={ablaufZu ? "" : "rz-dreh-unten"} />
              </button>
              {!ablaufZu && <Ablauf svg={r.ablaufSvg} />}
            </section>
          )}

          <section class="rz-abschnitt" aria-labelledby="rz-schritte-titel">
            <h2 id="rz-schritte-titel" class="rz-h2">
              Zubereitung
            </h2>
            {r.schritte.length ? (
              <ol class="rz-schritte">
                {r.schritte.map((s, i) => (
                  <li key={i} class="rz-schritt">
                    <span class="rz-schritt-nr" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div class="rz-schritt-text">
                      {s.titel && (
                        <p class="rz-schritt-titel">
                          <Schritttitel titel={s.titel} onUhr={p.onUhr} />
                        </p>
                      )}
                      <p>
                        <MitUhren text={s.text} titel={s.titel ?? `Schritt ${i + 1}`} onUhr={p.onUhr} />
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p class="rz-hinweis">
                Keine Schritte erkannt.{" "}
                <button type="button" class="rz-link" onClick={p.onOeffnen}>
                  In Obsidian ansehen
                </button>
              </p>
            )}
          </section>

          {r.tipps.length > 0 && (
            <section class="rz-abschnitt rz-tipps" aria-labelledby="rz-tipps-titel">
              <h2 id="rz-tipps-titel" class="rz-h2">
                Tipps
              </h2>
              <ul>
                {r.tipps.map((t, i) => (
                  <li key={i}>
                    <Inline text={t} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section class="rz-abschnitt" aria-labelledby="rz-versuche-titel">
            <div class="rz-abschnitt-zeile">
              <h2 id="rz-versuche-titel" class="rz-h2">
                Versuche
              </h2>
              <button type="button" class="rz-link" onClick={p.onVersuch}>
                <Icon n="plus" gross={14} />
                Notieren
              </button>
            </div>
            {r.versuche.length ? (
              <ol class="rz-versuche">
                {r.versuche.map((v, i) => (
                  <li key={i}>
                    <span class="rz-versuch-datum">{v.datum}</span>
                    <ul>
                      {v.zeilen.map((z, j) => (
                        <li key={j}>
                          <Inline text={z} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            ) : (
              <p class="rz-leise">
                Noch nicht gemacht. Nach dem Kochen hier festhalten, was du geändert hast und wie es war.
              </p>
            )}
          </section>

          {r.bilderSrc.length > 0 && (
            <section class="rz-abschnitt" aria-labelledby="rz-bilder-titel">
              <h2 id="rz-bilder-titel" class="rz-h2">
                Bilder
              </h2>
              <div class="rz-galerie">
                {r.bilderSrc.map((b, i) => (
                  <Bild key={i} src={b} alt={`${r.titel}, Bild ${i + 1}`} />
                ))}
              </div>
            </section>
          )}

          {r.notizen.length > 0 && (
            <section class="rz-abschnitt" aria-labelledby="rz-notizen-titel">
              <h2 id="rz-notizen-titel" class="rz-h2">
                Notizen
              </h2>
              <ul class="rz-notizen">
                {r.notizen.map((n, i) => (
                  <li key={i}>
                    <Inline text={n} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}

export const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

export function PortionenRegler({
  r,
  faktor,
  portion,
  onPortion,
}: {
  r: RezeptAnsicht;
  faktor: number;
  portion?: number;
  onPortion: (n: number) => void;
}) {
  const basis = r.portionen?.anzahl;
  if (!basis) {
    const stufen = [0.5, 1, 2, 3];
    return (
      <div class="rz-segment rz-segment-klein" role="radiogroup" aria-label="Menge">
        {stufen.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={faktor === f}
            class={faktor === f ? "an" : ""}
            onClick={() => onPortion(f)}
          >
            {f === 0.5 ? "½×" : `${f}×`}
          </button>
        ))}
      </div>
    );
  }
  const aktuell = portion ?? basis;
  return (
    <div class="rz-regler" role="group" aria-label="Portionen">
      <button type="button" aria-label="Weniger" onClick={() => onPortion(naechstePortion(aktuell, -1, basis))}>
        <Icon n="minus" gross={16} />
      </button>
      <span class="rz-regler-wert" aria-live="polite">
        <b>{fmt(aktuell)}</b> {r.portionen!.einheit}
      </span>
      <button type="button" aria-label="Mehr" onClick={() => onPortion(naechstePortion(aktuell, 1, basis))}>
        <Icon n="plus" gross={16} />
      </button>
      {aktuell !== basis && (
        <button type="button" class="rz-regler-zurueck" aria-label="Originalmenge" onClick={() => onPortion(basis)}>
          <Icon n="zurueck" gross={14} />
        </button>
      )}
    </div>
  );
}
