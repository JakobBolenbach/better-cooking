// Zutatenliste mit Umrechnung und Abhaken, Schritttexte mit startbaren Timern.
// Teil der Oberfläche aus src/ui/App.tsx (Preact), ohne Obsidian.
import type { ComponentChildren } from "preact";
import { dauerText, findeZeiten, istAusstattung } from "../kochen";
import { skaliereZeile } from "../mengen";
import type { RezeptAnsicht } from "../types";
import { Inline } from "./gemeinsam";
import { Icon } from "./icons";

export function Zutatenliste({
  r,
  faktor,
  abgehakt,
  onHaken,
  nur,
}: {
  r: RezeptAnsicht;
  faktor: number;
  abgehakt?: string[];
  onHaken?: (k: string) => void;
  nur?: { gruppe: number; index: number }[];
}) {
  return (
    <div class="rz-zutaten">
      {r.zutaten.map((g, gi) => {
        const ausstattung = istAusstattung(g.titel);
        const zeilen = g.zutaten
          .map((z, zi) => ({ z, zi }))
          .filter(({ zi }) => !nur || nur.some((n) => n.gruppe === gi && n.index === zi));
        if (!zeilen.length) return null;
        return (
          <div key={gi} class={`rz-zutatengruppe${ausstattung ? " ausstattung" : ""}`}>
            {g.titel && !nur && <h3 class="rz-gruppe-titel">{g.titel}</h3>}
            <ul>
              {zeilen.map(({ z, zi }) => {
                const k = `${gi}-${zi}`;
                const an = !!abgehakt?.includes(k);
                const teile = ausstattung ? [{ text: z }] : skaliereZeile(z, faktor);
                const inhalt = teile.map((t, i) =>
                  t.menge ? (
                    <b key={i} class={faktor !== 1 ? "rz-menge neu" : "rz-menge"}>
                      {t.text}
                    </b>
                  ) : (
                    <span key={i}>
                      <Inline text={t.text} />
                    </span>
                  ),
                );
                return (
                  <li key={zi}>
                    {onHaken ? (
                      <button
                        type="button"
                        class={`rz-zutat${an ? " an" : ""}`}
                        aria-pressed={an}
                        onClick={() => onHaken(k)}
                      >
                        <span class="rz-kreis" aria-hidden="true">
                          {an && <Icon n="haken" gross={13} />}
                        </span>
                        <span class="rz-zutat-text">{inhalt}</span>
                      </button>
                    ) : (
                      <span class="rz-zutat rz-zutat-statisch">
                        <span class="rz-zutat-text">{inhalt}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Schritttext mit antippbaren Zeitangaben (Timer). */
export function MitUhren({
  text,
  titel,
  onUhr,
}: {
  text: string;
  titel: string;
  onUhr: (titel: string, sek: number) => void;
}) {
  const zeiten = findeZeiten(text);
  if (!zeiten.length) return <Inline text={text} />;
  const out: ComponentChildren[] = [];
  let pos = 0;
  zeiten.forEach((z, i) => {
    if (z.start > pos) out.push(<Inline key={`t${i}`} text={text.slice(pos, z.start)} />);
    out.push(
      <button
        key={`z${i}`}
        type="button"
        class="rz-zeit"
        onClick={() => onUhr(titel, z.sekunden)}
        title={`Timer ${dauerText(z.sekunden)}`}
      >
        <Icon n="timer" gross={13} />
        {z.text}
      </button>,
    );
    pos = z.ende;
  });
  if (pos < text.length) out.push(<Inline key="rest" text={text.slice(pos)} />);
  return <>{out}</>;
}

/** "Kneten (7 bis 10 Min.)" → "Kneten" plus Timer-Chip "7 bis 10 Min." statt Chip in Klammern. */
export function Schritttitel({ titel, onUhr }: { titel: string; onUhr: (titel: string, sek: number) => void }) {
  const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(titel);
  if (m && findeZeiten(m[2]).length) {
    return (
      <>
        {m[1]} <MitUhren text={m[2]} titel={m[1]} onUhr={onUhr} />
      </>
    );
  }
  return <MitUhren text={titel} titel={titel} onUhr={onUhr} />;
}
