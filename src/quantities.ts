// Mengen in Zutatenzeilen erkennen und für andere Portionen umrechnen.
// Reine Funktionen ohne Obsidian, mit Vitest getestet (tests/kern.test.ts).
import type { Servings } from "./types";

/** Einheiten, nach denen eine Zahl als Menge gilt. Reihenfolge: lange Formen zuerst. */
const UNITS = [
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
const UNIT_RE = UNITS.map((e) => e.replace(".", "\\.")).join("|");
const FRACTION: Record<string, number> = {
  "½": 0.5,
  "¼": 0.25,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅛": 0.125,
  "⅕": 0.2,
};
const FRACTION_CHARS = Object.keys(FRACTION).join("");

/** Eine Zahl: 400 · 1,5 · 1.5 · ½ · 1 ½ · 1½ · 1/2 */
const NUMBER = `(?:\\d+(?:[.,]\\d+)?(?:\\s*[${FRACTION_CHARS}])?|[${FRACTION_CHARS}]|\\d+\\s*/\\s*\\d+)`;
const RANGE = `(${NUMBER})(?:\\s*(?:-|–|bis)\\s*(${NUMBER}))?`;
/** Menge mit Einheit irgendwo in der Zeile (nicht nach einem Buchstaben, z. B. nicht "Type 405"). */
const QUANTITY_WITH_UNIT = new RegExp(`(?<![\\p{L}\\d.,/])${RANGE}\\s*(${UNIT_RE})(?![\\p{L}])`, "gu");
/** Menge am Zeilenanfang, auch ohne Einheit ("2 Eier", "½ Zitrone"). */
const QUANTITY_AT_START = new RegExp(`^${RANGE}(?=\\s|$)`, "u");

export function readNumber(s: string): number | undefined {
  const t = s.trim().replace(/\s+/g, " ");
  if (FRACTION[t] !== undefined) return FRACTION[t];
  const fractionSlash = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (fractionSlash) return Number(fractionSlash[2]) ? Number(fractionSlash[1]) / Number(fractionSlash[2]) : undefined;
  const mixed = new RegExp(`^(\\d+)\\s*([${FRACTION_CHARS}])$`).exec(t);
  if (mixed) return Number(mixed[1]) + FRACTION[mixed[2]];
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/** Gewicht und Volumen werden gerundet, Löffel und Stück als Brüche gezeigt. */
const METRIC = /^(g|kg|mg|ml|cl|dl|l|Gramm|Kilogramm|Milligramm|Milliliter|Zentiliter|Deziliter|Liter|cm)$/i;

const comma = (n: number) => String(n).replace(".", ",");

export function formatQuantity(n: number, unit?: string): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (unit && METRIC.test(unit)) {
    if (n >= 1000) return comma(Math.round(n / 10) * 10);
    if (n >= 100) return comma(Math.round(n / 5) * 5);
    if (n >= 10) return comma(Math.round(n));
    if (n >= 1) return comma(Math.round(n * 2) / 2);
    return comma(Math.round(n * 10) / 10);
  }
  // Brüche in Vierteln (auch Drittel, wenn näher dran)
  const whole = Math.floor(n + 1e-9);
  const rest = n - whole;
  const candidates: [number, string][] = [
    [0, ""],
    [0.25, "¼"],
    [1 / 3, "⅓"],
    [0.5, "½"],
    [2 / 3, "⅔"],
    [0.75, "¾"],
    [1, ""],
  ];
  let best = candidates[0];
  for (const k of candidates) if (Math.abs(k[0] - rest) < Math.abs(best[0] - rest)) best = k;
  const g = best[0] === 1 ? whole + 1 : whole;
  if (n < 0.2) return comma(Math.round(n * 100) / 100);
  if (!best[1]) return String(g);
  return g ? `${g} ${best[1]}` : best[1];
}

export interface Part {
  text: string;
  /** true, wenn dieser Teil eine (umgerechnete) Menge ist. */
  quantity?: boolean;
}

/**
 * Zutatenzeile umrechnen. Gibt Teile zurück, damit die Oberfläche Mengen hervorheben kann.
 * Umgerechnet werden die Menge am Anfang und jede weitere Menge mit Einheit (auch in Klammern).
 * Zahlen ohne Einheit mitten im Text (z. B. "Type 405") bleiben unverändert.
 */
export function scaleLine(line: string, faktor: number): Part[] {
  const hits: { start: number; end: number; replacement: string }[] = [];
  const compute = (from: string, until: string | undefined, unit?: string) => {
    const a = readNumber(from);
    const b = until ? readNumber(until) : undefined;
    if (a === undefined) return undefined;
    const fa = formatQuantity(a * faktor, unit);
    const fb = b !== undefined ? formatQuantity(b * faktor, unit) : undefined;
    return fb ? `${fa} bis ${fb}` : fa;
  };
  const start = QUANTITY_AT_START.exec(line);
  let fromStart = 0;
  if (start) {
    const after = line.slice(start[0].length);
    const unit = new RegExp(`^\\s*(${UNIT_RE})(?![\\p{L}])`, "u").exec(after);
    const replacement = compute(start[1], start[2], unit?.[1]);
    if (replacement !== undefined) {
      const end = start[0].length + (unit ? unit[0].length : 0);
      hits.push({ start: 0, end, replacement: unit ? `${replacement} ${unit[1]}` : replacement });
      fromStart = end;
    }
  }
  QUANTITY_WITH_UNIT.lastIndex = 0;
  for (let m = QUANTITY_WITH_UNIT.exec(line); m; m = QUANTITY_WITH_UNIT.exec(line)) {
    if (m.index < fromStart) continue;
    // Längen mitten in der Zeile sind Größen (Form, Stück), keine Mengen: "Springform (26 cm)".
    if (m[3] === "cm") continue;
    const replacement = compute(m[1], m[2], m[3]);
    if (replacement !== undefined)
      hits.push({ start: m.index, end: m.index + m[0].length, replacement: `${replacement} ${m[3]}` });
  }
  const parts: Part[] = [];
  let pos = 0;
  for (const t of hits) {
    if (t.start > pos) parts.push({ text: line.slice(pos, t.start) });
    parts.push({ text: faktor === 1 ? line.slice(t.start, t.end) : t.replacement, quantity: true });
    pos = t.end;
  }
  if (pos < line.length) parts.push({ text: line.slice(pos) });
  return parts;
}

/** "9 Brötchen" → 9 Brötchen; "1 großes Brot" → 1 großes Brot; "für 4 Personen" → 4 Personen. */
export function readResult(result: string | undefined): Servings | undefined {
  if (!result) return undefined;
  const m = new RegExp(`(?:^|für\\s+|ca\\.\\s*)(${NUMBER})\\s*(.*)$`, "iu").exec(result.trim());
  if (!m) return undefined;
  const n = readNumber(m[1]);
  if (!n || n <= 0) return undefined;
  return { count: n, unit: (m[2] || "Portionen").trim() };
}

/** Schrittweite für den Portionen-Regler: ganze Zahlen; bei Anzahl 1 in halben Schritten. */
export function nextServing(count: number, direction: 1 | -1, base: number): number {
  const step = base <= 1 ? 0.5 : 1;
  const fresh = Math.round((count + direction * step) * 2) / 2;
  return Math.max(step, Math.min(fresh, Math.max(base * 20, 50)));
}

/** Kern einer Zutat ohne Menge, Einheit und Klammerzusatz: "400 g Weizenmehl Type 405" → "Weizenmehl Type 405". */
export function ingredientName(line: string): string {
  let t = line.replace(/\([^)]*\)/g, " ").replace(/,.*$/, "");
  const start = QUANTITY_AT_START.exec(t.trim());
  if (start) t = t.trim().slice(start[0].length);
  t = t.replace(new RegExp(`^\\s*(${UNIT_RE})(?![\\p{L}])`, "u"), "");
  return t.replace(/\s+/g, " ").trim();
}
