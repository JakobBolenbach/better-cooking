// Hilfen für die Rezeptseite und den Kochmodus: Zeitangaben in Schritten finden (Timer)
// und Zutaten erkennen, die in einem Schritt vorkommen. Reine Funktionen, getestet in tests/kern.test.ts.
import { normalisiere } from "./suche";
import { zutatName } from "./mengen";
import type { Zutatengruppe } from "./types";

export interface Zeitstelle {
  start: number;
  ende: number;
  text: string;
  /** Untere Grenze in Sekunden (Timer startet damit). */
  sekunden: number;
  /** Obere Grenze bei Spannen ("5 bis 6 Std."). */
  bisSekunden?: number;
}

const ZAHL = "(\\d+(?:[.,]\\d+)?|½|¼|¾)";
const ZEIT_RE = new RegExp(
  `(?:ca\\.\\s*|etwa\\s*)?${ZAHL}(?:\\s*(?:-|–|bis)\\s*${ZAHL})?\\s*(Sekunden|Sek\\.?|Minuten|Minute|Min\\.?|Stunden|Stunde|Std\\.?|h)(?![\\p{L}])`,
  "giu",
);

const wert = (s: string) => (s === "½" ? 0.5 : s === "¼" ? 0.25 : s === "¾" ? 0.75 : Number(s.replace(",", ".")));
const faktor = (e: string) => (/^sek/i.test(e) ? 1 : /^(std|stunde|h)/i.test(e) ? 3600 : 60);

/** Alle Zeitangaben in einem Text, z. B. "7 bis 10 Min." oder "ca. 5-6 h". */
export function findeZeiten(text: string): Zeitstelle[] {
  const out: Zeitstelle[] = [];
  ZEIT_RE.lastIndex = 0;
  for (let m = ZEIT_RE.exec(text); m; m = ZEIT_RE.exec(text)) {
    const f = faktor(m[3]);
    const a = wert(m[1]) * f;
    const b = m[2] ? wert(m[2]) * f : undefined;
    if (!Number.isFinite(a) || a <= 0 || a > 72 * 3600) continue;
    out.push({
      start: m.index,
      ende: m.index + m[0].length,
      text: m[0],
      sekunden: Math.round(a),
      bisSekunden: b && b > a ? Math.round(b) : undefined,
    });
  }
  return out;
}

export function dauerText(sek: number): string {
  if (sek < 60) return `${sek} Sek.`;
  const min = Math.round(sek / 60);
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} Std. ${r} Min.` : `${h} Std.`;
}

/** Restzeit als Uhr: 1:05:09 bzw. 4:07. */
export function uhr(sek: number): string {
  const s = Math.max(0, Math.round(sek));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const z = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${z(m)}:${z(r)}` : `${m}:${z(r)}`;
}

/** Gruppen wie "Ausstattung" sind Geräte, keine Zutaten: nicht in Schritten markieren und nicht skalieren. */
export const istAusstattung = (titel?: string) =>
  !!titel && /^(ausstattung|zubehör|zubehoer|werkzeug|geräte|geraete|equipment)$/i.test(titel.trim());

/** Wörter, die in fast jedem Schritt vorkommen und keine Zutat meinen. */
const STOPP = new Set([
  "teig",
  "teigs",
  "masse",
  "schussel",
  "ofen",
  "blech",
  "deckel",
  "alles",
  "minuten",
  "stunden",
  "etwa",
  "ganz",
  "zimmertemperatur",
  "kugel",
  "seiten",
  "mitte",
  "brot",
  "brotchen",
  "form",
  "topf",
  "pfanne",
  "hitze",
  "grad",
]);

function stammwoerter(s: string): string[] {
  return normalisiere(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOPP.has(w));
}

/**
 * Welche Zutaten (Index je Gruppe) kommen im Schritt vor? Abgleich über Wortanfänge und Wortenden,
 * damit "Mehle" beide Mehlsorten trifft und "Ansatz" den "Sauerteig-Ansatz". Lieber eine Zutat zu viel als eine zu wenig.
 */
export function zutatenImSchritt(schritt: string, gruppen: Zutatengruppe[]): { gruppe: number; index: number }[] {
  const woerter = stammwoerter(schritt);
  if (!woerter.length) return [];
  const out: { gruppe: number; index: number }[] = [];
  gruppen.forEach(
    (g, gi) =>
      !istAusstattung(g.titel) &&
      g.zutaten.forEach((z, zi) => {
        const namen = stammwoerter(zutatName(z).replace(/\bType\s*\d+\b/gi, ""));
        if (!namen.length) return;
        const trifft = namen.some((n) =>
          woerter.some((w) => {
            const stamm = w.slice(0, Math.max(4, Math.min(w.length, n.length) - 2));
            return (
              n === w ||
              n.startsWith(stamm) ||
              (stamm.length >= 4 && n.endsWith(w.replace(/e?n?$/, ""))) ||
              w.startsWith(n)
            );
          }),
        );
        if (trifft) out.push({ gruppe: gi, index: zi });
      }),
  );
  return out;
}
