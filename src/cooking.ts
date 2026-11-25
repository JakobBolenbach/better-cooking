// Hilfen für die Rezeptseite und den Kochmodus: Zeitangaben in Schritten finden (Timer)
// und Zutaten erkennen, die in einem Schritt vorkommen. Reine Funktionen, getestet in tests/kern.test.ts.
import { normalize } from "./search";
import { ingredientName } from "./quantities";
import type { IngredientGroup } from "./types";

export interface TimeSpot {
  start: number;
  end: number;
  text: string;
  /** Untere Grenze in Sekunden (Timer startet damit). */
  seconds: number;
  /** Obere Grenze bei Spannen ("5 bis 6 Std."). */
  untilSeconds?: number;
}

const NUMBER = "(\\d+(?:[.,]\\d+)?|½|¼|¾)";
const TIME_RE = new RegExp(
  `(?:ca\\.\\s*|etwa\\s*)?${NUMBER}(?:\\s*(?:-|–|bis)\\s*${NUMBER})?\\s*(Sekunden|Sek\\.?|Minuten|Minute|Min\\.?|Stunden|Stunde|Std\\.?|h)(?![\\p{L}])`,
  "giu",
);

const value = (s: string) => (s === "½" ? 0.5 : s === "¼" ? 0.25 : s === "¾" ? 0.75 : Number(s.replace(",", ".")));
const faktor = (e: string) => (/^sek/i.test(e) ? 1 : /^(std|stunde|h)/i.test(e) ? 3600 : 60);

/** Alle Zeitangaben in einem Text, z. B. "7 bis 10 Min." oder "ca. 5-6 h". */
export function findTimes(text: string): TimeSpot[] {
  const out: TimeSpot[] = [];
  TIME_RE.lastIndex = 0;
  for (let m = TIME_RE.exec(text); m; m = TIME_RE.exec(text)) {
    const f = faktor(m[3]);
    const a = value(m[1]) * f;
    const b = m[2] ? value(m[2]) * f : undefined;
    if (!Number.isFinite(a) || a <= 0 || a > 72 * 3600) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      seconds: Math.round(a),
      untilSeconds: b && b > a ? Math.round(b) : undefined,
    });
  }
  return out;
}

export function durationText(sec: number): string {
  if (sec < 60) return `${sec} Sek.`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} Std. ${r} Min.` : `${h} Std.`;
}

/** Restzeit als Uhr: 1:05:09 bzw. 4:07. */
export function timer(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const z = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${z(m)}:${z(r)}` : `${m}:${z(r)}`;
}

/** Gruppen wie "Ausstattung" sind Geräte, keine Zutaten: nicht in Schritten markieren und nicht skalieren. */
export const isEquipment = (title?: string) =>
  !!title && /^(ausstattung|zubehör|zubehoer|werkzeug|geräte|geraete|equipment)$/i.test(title.trim());

/** Wörter, die in fast jedem Schritt vorkommen und keine Zutat meinen. */
const STOP = new Set([
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

function stemWords(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

/**
 * Welche Zutaten (Index je Gruppe) kommen im Schritt vor? Abgleich über Wortanfänge und Wortenden,
 * damit "Mehle" beide Mehlsorten trifft und "Ansatz" den "Sauerteig-Ansatz". Lieber eine Zutat zu viel als eine zu wenig.
 */
export function ingredientsInStep(step: string, groups: IngredientGroup[]): { group: number; index: number }[] {
  const words = stemWords(step);
  if (!words.length) return [];
  const out: { group: number; index: number }[] = [];
  groups.forEach(
    (g, gi) =>
      !isEquipment(g.title) &&
      g.ingredients.forEach((z, zi) => {
        const names = stemWords(ingredientName(z).replace(/\bType\s*\d+\b/gi, ""));
        if (!names.length) return;
        const matches = names.some((n) =>
          words.some((w) => {
            const stem = w.slice(0, Math.max(4, Math.min(w.length, n.length) - 2));
            return (
              n === w ||
              n.startsWith(stem) ||
              (stem.length >= 4 && n.endsWith(w.replace(/e?n?$/, ""))) ||
              w.startsWith(n)
            );
          }),
        );
        if (matches) out.push({ group: gi, index: zi });
      }),
  );
  return out;
}
