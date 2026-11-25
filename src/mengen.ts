// Mengen in Zutatenzeilen erkennen und für andere Portionen umrechnen.
// Reine Funktionen ohne Obsidian, mit Vitest getestet (tests/kern.test.ts).
import type { Portionen } from "./types";

/** Einheiten, nach denen eine Zahl als Menge gilt. Reihenfolge: lange Formen zuerst. */
const EINHEITEN = [
  "Kilogramm",
  "Gramm",
  "Milligramm",
  "Milliliter",
  "Zentiliter",
  "Deziliter",
  "Liter",
  "Teelöffel",
  "Esslöffel",
  "Prisen",
  "Prise",
  "Messerspitzen",
  "Messerspitze",
  "Päckchen",
  "Packungen",
  "Packung",
  "Stücke",
  "Stück",
  "Bund",
  "Zehen",
  "Zehe",
  "Dosen",
  "Dose",
  "Becher",
  "Tassen",
  "Tasse",
  "Scheiben",
  "Scheibe",
  "Blätter",
  "Blatt",
  "Zweige",
  "Zweig",
  "Handvoll",
  "Gläser",
  "Glas",
  "Würfel",
  "Tropfen",
  "kg",
  "mg",
  "ml",
  "cl",
  "dl",
  "g",
  "l",
  "TL",
  "EL",
  "Tl",
  "El",
  "Msp",
  "Pck",
  "Pkg",
  "Stk",
  "cm",
];
const EINHEIT_RE = EINHEITEN.map((e) => e.replace(".", "\\.")).join("|");
const BRUCH: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125, "⅕": 0.2 };
const BRUCH_ZEICHEN = Object.keys(BRUCH).join("");

/** Eine Zahl: 400 · 1,5 · 1.5 · ½ · 1 ½ · 1½ · 1/2 */
const ZAHL = `(?:\\d+(?:[.,]\\d+)?(?:\\s*[${BRUCH_ZEICHEN}])?|[${BRUCH_ZEICHEN}]|\\d+\\s*/\\s*\\d+)`;
const SPANNE = `(${ZAHL})(?:\\s*(?:-|–|bis)\\s*(${ZAHL}))?`;
/** Menge mit Einheit irgendwo in der Zeile (nicht nach einem Buchstaben, z. B. nicht "Type 405"). */
const MENGE_MIT_EINHEIT = new RegExp(`(?<![\\p{L}\\d.,/])${SPANNE}\\s*(${EINHEIT_RE})(?![\\p{L}])`, "gu");
/** Menge am Zeilenanfang, auch ohne Einheit ("2 Eier", "½ Zitrone"). */
const MENGE_AM_ANFANG = new RegExp(`^${SPANNE}(?=\\s|$)`, "u");

export function leseZahl(s: string): number | undefined {
  const t = s.trim().replace(/\s+/g, " ");
  if (BRUCH[t] !== undefined) return BRUCH[t];
  const bruchStrich = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (bruchStrich) return Number(bruchStrich[2]) ? Number(bruchStrich[1]) / Number(bruchStrich[2]) : undefined;
  const gemischt = new RegExp(`^(\\d+)\\s*([${BRUCH_ZEICHEN}])$`).exec(t);
  if (gemischt) return Number(gemischt[1]) + BRUCH[gemischt[2]];
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/** Gewicht und Volumen werden gerundet, Löffel und Stück als Brüche gezeigt. */
const METRISCH = /^(g|kg|mg|ml|cl|dl|l|Gramm|Kilogramm|Milligramm|Milliliter|Zentiliter|Deziliter|Liter|cm)$/i;

const komma = (n: number) => String(n).replace(".", ",");

export function formatMenge(n: number, einheit?: string): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (einheit && METRISCH.test(einheit)) {
    if (n >= 1000) return komma(Math.round(n / 10) * 10);
    if (n >= 100) return komma(Math.round(n / 5) * 5);
    if (n >= 10) return komma(Math.round(n));
    if (n >= 1) return komma(Math.round(n * 2) / 2);
    return komma(Math.round(n * 10) / 10);
  }
  // Brüche in Vierteln (auch Drittel, wenn näher dran)
  const ganz = Math.floor(n + 1e-9);
  const rest = n - ganz;
  const kandidaten: [number, string][] = [
    [0, ""],
    [0.25, "¼"],
    [1 / 3, "⅓"],
    [0.5, "½"],
    [2 / 3, "⅔"],
    [0.75, "¾"],
    [1, ""],
  ];
  let best = kandidaten[0];
  for (const k of kandidaten) if (Math.abs(k[0] - rest) < Math.abs(best[0] - rest)) best = k;
  const g = best[0] === 1 ? ganz + 1 : ganz;
  if (n < 0.2) return komma(Math.round(n * 100) / 100);
  if (!best[1]) return String(g);
  return g ? `${g} ${best[1]}` : best[1];
}

export interface Teil {
  text: string;
  /** true, wenn dieser Teil eine (umgerechnete) Menge ist. */
  menge?: boolean;
}

/**
 * Zutatenzeile umrechnen. Gibt Teile zurück, damit die Oberfläche Mengen hervorheben kann.
 * Umgerechnet werden die Menge am Anfang und jede weitere Menge mit Einheit (auch in Klammern).
 * Zahlen ohne Einheit mitten im Text (z. B. "Type 405") bleiben unverändert.
 */
export function skaliereZeile(zeile: string, faktor: number): Teil[] {
  const treffer: { start: number; ende: number; ersatz: string }[] = [];
  const rechne = (von: string, bis: string | undefined, einheit?: string) => {
    const a = leseZahl(von);
    const b = bis ? leseZahl(bis) : undefined;
    if (a === undefined) return undefined;
    const fa = formatMenge(a * faktor, einheit);
    const fb = b !== undefined ? formatMenge(b * faktor, einheit) : undefined;
    return fb ? `${fa} bis ${fb}` : fa;
  };
  const anfang = MENGE_AM_ANFANG.exec(zeile);
  let abAnfang = 0;
  if (anfang) {
    const danach = zeile.slice(anfang[0].length);
    const einheit = new RegExp(`^\\s*(${EINHEIT_RE})(?![\\p{L}])`, "u").exec(danach);
    const ersatz = rechne(anfang[1], anfang[2], einheit?.[1]);
    if (ersatz !== undefined) {
      const ende = anfang[0].length + (einheit ? einheit[0].length : 0);
      treffer.push({ start: 0, ende, ersatz: einheit ? `${ersatz} ${einheit[1]}` : ersatz });
      abAnfang = ende;
    }
  }
  MENGE_MIT_EINHEIT.lastIndex = 0;
  for (let m = MENGE_MIT_EINHEIT.exec(zeile); m; m = MENGE_MIT_EINHEIT.exec(zeile)) {
    if (m.index < abAnfang) continue;
    // Längen mitten in der Zeile sind Größen (Form, Stück), keine Mengen: "Springform (26 cm)".
    if (m[3] === "cm") continue;
    const ersatz = rechne(m[1], m[2], m[3]);
    if (ersatz !== undefined)
      treffer.push({ start: m.index, ende: m.index + m[0].length, ersatz: `${ersatz} ${m[3]}` });
  }
  const teile: Teil[] = [];
  let pos = 0;
  for (const t of treffer) {
    if (t.start > pos) teile.push({ text: zeile.slice(pos, t.start) });
    teile.push({ text: faktor === 1 ? zeile.slice(t.start, t.ende) : t.ersatz, menge: true });
    pos = t.ende;
  }
  if (pos < zeile.length) teile.push({ text: zeile.slice(pos) });
  return teile;
}

/** "9 Brötchen" → 9 Brötchen; "1 großes Brot" → 1 großes Brot; "für 4 Personen" → 4 Personen. */
export function leseErgebnis(ergebnis: string | undefined): Portionen | undefined {
  if (!ergebnis) return undefined;
  const m = new RegExp(`(?:^|für\\s+|ca\\.\\s*)(${ZAHL})\\s*(.*)$`, "iu").exec(ergebnis.trim());
  if (!m) return undefined;
  const n = leseZahl(m[1]);
  if (!n || n <= 0) return undefined;
  return { anzahl: n, einheit: (m[2] || "Portionen").trim() };
}

/** Schrittweite für den Portionen-Regler: ganze Zahlen; bei Anzahl 1 in halben Schritten. */
export function naechstePortion(anzahl: number, richtung: 1 | -1, basis: number): number {
  const schritt = basis <= 1 ? 0.5 : 1;
  const neu = Math.round((anzahl + richtung * schritt) * 2) / 2;
  return Math.max(schritt, Math.min(neu, Math.max(basis * 20, 50)));
}

/** Kern einer Zutat ohne Menge, Einheit und Klammerzusatz: "400 g Weizenmehl Type 405" → "Weizenmehl Type 405". */
export function zutatName(zeile: string): string {
  let t = zeile.replace(/\([^)]*\)/g, " ").replace(/,.*$/, "");
  const anfang = MENGE_AM_ANFANG.exec(t.trim());
  if (anfang) t = t.trim().slice(anfang[0].length);
  t = t.replace(new RegExp(`^\\s*(${EINHEIT_RE})(?![\\p{L}])`, "u"), "");
  return t.replace(/\s+/g, " ").trim();
}
