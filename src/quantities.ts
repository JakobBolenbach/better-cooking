// Detect quantities in ingredient lines and convert them for other servings.
// Pure functions without Obsidian, tested with Vitest (tests/core.test.ts).
import type { Servings } from "./types";
import { tr } from "./i18n";

/** Units after which a number counts as a quantity. Order: long forms first. */
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
  // English (long forms first, then abbreviations)
  "tablespoons",
  "tablespoon",
  "teaspoons",
  "teaspoon",
  "cups",
  "cup",
  "ounces",
  "ounce",
  "pounds",
  "pound",
  "pints",
  "pint",
  "quarts",
  "quart",
  "pinches",
  "pinch",
  "cloves",
  "clove",
  "cans",
  "can",
  "slices",
  "slice",
  "sticks",
  "stick",
  "bunches",
  "bunch",
  "sprigs",
  "sprig",
  "packages",
  "package",
  "pieces",
  "piece",
  "handfuls",
  "handful",
  "tbsp",
  "Tbsp",
  "tsp",
  "lbs",
  "lb",
  "oz",
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

/** A number: 400 · 1,5 · 1.5 · ½ · 1 ½ · 1½ · 1/2 */
const NUMBER = `(?:\\d+(?:[.,]\\d+)?(?:\\s*[${FRACTION_CHARS}])?|[${FRACTION_CHARS}]|\\d+\\s*/\\s*\\d+)`;
const RANGE = `(${NUMBER})(?:\\s*(?:-|–|bis|to)\\s*(${NUMBER}))?`;
/** Quantity with unit anywhere in the line (not after a letter, e.g. not "Type 405"). */
const QUANTITY_WITH_UNIT = new RegExp(`(?<![\\p{L}\\d.,/])${RANGE}\\s*(${UNIT_RE})(?![\\p{L}])`, "gu");
/** Quantity at the start of the line, also without a unit ("2 Eier", "½ Zitrone"). */
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

/** Weight and volume are rounded, spoons and pieces shown as fractions. */
const METRIC = /^(g|kg|mg|ml|cl|dl|l|Gramm|Kilogramm|Milligramm|Milliliter|Zentiliter|Deziliter|Liter|cm)$/i;

const comma = (n: number) => String(n).replace(".", ",");

/** Factor to the base unit (g, ml) that sets the rounding step; other metric units (mg, cm) round as they are. */
const METRIC_FACTOR: Record<string, number> = {
  kg: 1000,
  kilogramm: 1000,
  l: 1000,
  liter: 1000,
  dl: 100,
  deziliter: 100,
  cl: 10,
  zentiliter: 10,
};

/** Rounds a metric amount by its size in the base unit (1,8 l is 1800 ml, so it stays 1,8). */
function roundMetric(n: number, unit: string): string {
  const f = METRIC_FACTOR[unit.toLowerCase()] ?? 1;
  const v = n * f;
  let r: number;
  if (v >= 1000) r = Math.round(v / 10) * 10;
  else if (v >= 100) r = Math.round(v / 5) * 5;
  else if (v >= 10) r = Math.round(v);
  else if (v >= 1) r = Math.round(v * 2) / 2;
  else r = Math.round(v * 10) / 10;
  // Back to the written unit without floating-point residue.
  return comma(Math.round((r / f) * 1e6) / 1e6);
}

export function formatQuantity(n: number, unit?: string): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (unit && METRIC.test(unit)) return roundMetric(n, unit);
  // Fractions in quarters (also thirds, if closer)
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
  /** true if this part is a (converted) quantity. */
  quantity?: boolean;
}

/**
 * Convert an ingredient line. Returns parts, so the UI can highlight quantities.
 * Converted are the quantity at the start and every further quantity with a unit (also in parentheses).
 * Numbers without a unit inside the text (e.g. "Type 405") stay unchanged.
 */
export function scaleLine(line: string, faktor: number): Part[] {
  const hits: { start: number; end: number; replacement: string }[] = [];
  const compute = (from: string, until: string | undefined, unit?: string) => {
    const a = readNumber(from);
    const b = until ? readNumber(until) : undefined;
    if (a === undefined) return undefined;
    const fa = formatQuantity(a * faktor, unit);
    const fb = b !== undefined ? formatQuantity(b * faktor, unit) : undefined;
    return fb ? `${fa} ${tr("rangeTo")} ${fb}` : fa;
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
    // Lengths inside the line are sizes (tin, piece), not quantities: "Springform (26 cm)".
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

/**
 * "9 Brötchen" → 9 Brötchen; "1 großes Brot" → 1 großes Brot; "für 4 Personen", "for 4 people" → 4 Personen / people.
 * A bare number has no unit (""); the interface shows its own word for servings then.
 */
export function readResult(result: string | undefined): Servings | undefined {
  if (!result) return undefined;
  const m = new RegExp(`(?:^|für\\s+|for\\s+|ca\\.\\s*|about\\s+)(${NUMBER})\\s*(.*)$`, "iu").exec(result.trim());
  if (!m) return undefined;
  const n = readNumber(m[1]);
  if (!n || n <= 0) return undefined;
  return { count: n, unit: m[2].trim() };
}

/** Step size for the servings control: whole numbers; for a count of 1 in halves. */
export function nextServing(count: number, direction: 1 | -1, base: number): number {
  const step = base <= 1 ? 0.5 : 1;
  const fresh = Math.round((count + direction * step) * 2) / 2;
  return Math.max(step, Math.min(fresh, Math.max(base * 20, 50)));
}

/** Core of an ingredient without quantity, unit and parenthetical: "400 g Weizenmehl Type 405" → "Weizenmehl Type 405". */
export function ingredientName(line: string): string {
  let t = line.replace(/\([^)]*\)/g, " ").replace(/,.*$/, "");
  const start = QUANTITY_AT_START.exec(t.trim());
  if (start) t = t.trim().slice(start[0].length);
  t = t.replace(new RegExp(`^\\s*(${UNIT_RE})(?![\\p{L}])`, "u"), "");
  return t.replace(/\s+/g, " ").trim();
}

/** Quantity at the start of an ingredient line: "1 ½ EL Öl" → 1.5, "EL", "Öl"; ranges count with the upper value. */
export function splitQuantity(line: string): { amount?: number; unit?: string; rest: string } {
  const t = line.trim();
  const start = QUANTITY_AT_START.exec(t);
  if (!start) return { rest: t };
  const amount = readNumber(start[2] ?? start[1]);
  if (amount === undefined) return { rest: t };
  const after = t.slice(start[0].length);
  const unit = new RegExp(`^\\s*(${UNIT_RE})(?![\\p{L}])`, "u").exec(after);
  return { amount, unit: unit?.[1], rest: (unit ? after.slice(unit[0].length) : after).trim() };
}
