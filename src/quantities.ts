// Detect quantities in ingredient lines and convert them for other servings.
// Pure functions without Obsidian, tested with Vitest (tests/core.test.ts).
import type { Servings } from "./types";
import { tr } from "./i18n";
import { METRIC_BASE, UNITS, isCountable, unitFor } from "./units";

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

/** Weight and volume are rounded, spoons and pieces shown as fractions (lengths are rounded too). */
const METRIC = new RegExp(`^(${[...Object.keys(METRIC_BASE), "cm"].join("|")})$`, "i");

const comma = (n: number) => String(n).replace(".", ",");

/** Removes floating-point residue (0.1 + 0.2). */
const smooth = (n: number) => Math.round(n * 1e6) / 1e6;

/** Rounds an amount in the base unit (g, ml): >= 1000 to 10, >= 100 to 5, >= 10 to 1, >= 1 to 0,5, below to 0,1. */
export function roundBase(amount: number): number {
  const v = smooth(amount);
  if (v >= 1000) return Math.round(v / 10) * 10;
  if (v >= 100) return Math.round(v / 5) * 5;
  if (v >= 10) return Math.round(v);
  if (v >= 1) return Math.round(v * 2) / 2;
  return Math.round(v * 10) / 10;
}

/** Rounds a metric amount by its size in the base unit (1,8 l is 1800 ml, so it stays 1,8). */
function roundMetric(n: number, unit: string): string {
  // mg and cm round as they are, without a factor.
  const f = Math.max(METRIC_BASE[unit.toLowerCase()]?.[1] ?? 1, 1);
  return comma(smooth(roundBase(n * f) / f));
}

export function formatQuantity(n: number, unit?: string): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (unit && METRIC.test(unit)) return roundMetric(n, unit);
  // Counted things (eggs, onions, "Stück", "Zehe"): whole or half, never thirds ("3 ½ Eier", not "3 ⅓ Eier").
  // Below 1 thirds and quarters stay ("⅓ Zehe").
  if (isCountable(unit) && n >= 1) {
    const half = Math.round(n * 2) / 2;
    return half % 1 ? `${Math.floor(half)} ½` : String(half);
  }
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
  /** Scaled amount with its unit in the matching form: "2 Prisen", "2 bis 3 Zehen". */
  const compute = (from: string, until: string | undefined, unit?: string) => {
    const a = readNumber(from);
    const b = until ? readNumber(until) : undefined;
    if (a === undefined) return undefined;
    const fa = formatQuantity(a * faktor, unit);
    const fb = b !== undefined ? formatQuantity(b * faktor, unit) : undefined;
    const text = fb ? `${fa} ${tr("rangeTo")} ${fb}` : fa;
    if (!unit) return text;
    return `${text} ${unitFor(unit, readNumber(fb ?? fa) ?? (b ?? a) * faktor)}`;
  };
  const start = QUANTITY_AT_START.exec(line);
  let fromStart = 0;
  if (start) {
    const after = line.slice(start[0].length);
    const unit = new RegExp(`^\\s*(${UNIT_RE})(?![\\p{L}])`, "u").exec(after);
    const replacement = compute(start[1], start[2], unit?.[1]);
    if (replacement !== undefined) {
      const end = start[0].length + (unit ? unit[0].length : 0);
      hits.push({ start: 0, end, replacement });
      fromStart = end;
    }
  }
  QUANTITY_WITH_UNIT.lastIndex = 0;
  for (let m = QUANTITY_WITH_UNIT.exec(line); m; m = QUANTITY_WITH_UNIT.exec(line)) {
    if (m.index < fromStart) continue;
    // Lengths inside the line are sizes (tin, piece), not quantities: "Springform (26 cm)".
    if (m[3] === "cm") continue;
    const replacement = compute(m[1], m[2], m[3]);
    if (replacement !== undefined) hits.push({ start: m.index, end: m.index + m[0].length, replacement });
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

/** Words right before the amount of a yield: "für 4 Personen", "Teig für 4", "Ergibt ca. 12 Stück", "Makes about 12". */
const RESULT_LEAD = "(?:^|\\s)(?:für|for|ca\\.|circa|etwa|about|approx\\.?|ergibt|makes|serves|yields)\\s*";

/**
 * "9 Brötchen" → 9 Brötchen; "1 großes Brot" → 1 großes Brot; "für 4 Personen", "for 4 people" → 4 Personen / people;
 * "4-6 servings", "4 bis 6 Portionen" → 4 to 6 (count = lower, countTo = upper). Text before the amount
 * ("Ergibt ca. 12 Stück", "Teig für 4") is kept as `prefix`, except a bare "für"/"for".
 * A bare number has no unit (""); the interface shows its own word for servings then.
 */
export function readResult(result: string | undefined): Servings | undefined {
  if (!result) return undefined;
  const text = result.trim();
  const m = new RegExp(`(^|${RESULT_LEAD})(${NUMBER})(?:\\s*(?:-|–|bis|to)\\s*(${NUMBER}))?\\s*(.*)$`, "iu").exec(text);
  if (!m) return undefined;
  const n = readNumber(m[2]);
  if (!n || n <= 0) return undefined;
  const upper = m[3] ? readNumber(m[3]) : undefined;
  const prefix = (text.slice(0, m.index) + m[1]).replace(/^(?:für|for)\s*$/i, "");
  return {
    count: n,
    unit: m[4].trim(),
    ...(upper && upper > n ? { countTo: upper } : {}),
    ...(prefix ? { prefix } : {}),
  };
}

/**
 * Servings for another amount as text, one form everywhere (key facts, servings control, cooking mode, sharing,
 * meal plan): amounts like `formatQuantity` without a unit ("4", "4 ½", whole or half), a range as "4 bis 6" / "4 to 6",
 * then the unit or the interface's own word.
 */
export function servingsText(s: Servings, faktor = 1): string {
  const from = formatQuantity(s.count * faktor);
  const amount = s.countTo ? `${from} ${tr("rangeTo")} ${formatQuantity(s.countTo * faktor)}` : from;
  return `${amount} ${s.unit || tr("servingsUnit")}`;
}

/**
 * The key fact "yield" for another amount. At the original amount, or if the text has no amount to scale,
 * it stays as written; otherwise it reads like the servings control, with the text before the amount ("Ergibt ca. ") kept.
 */
export function scaledResult(result: string, servings: Servings | undefined, faktor: number): string {
  const read = faktor === 1 || !servings ? undefined : readResult(result);
  return read ? `${read.prefix ?? ""}${servingsText(servings!, faktor)}` : result;
}

/** Step size for the servings control: whole numbers; for a count of 1 in halves. */
export function nextServing(count: number, direction: 1 | -1, base: number): number {
  const step = base <= 1 ? 0.5 : 1;
  const fresh = Math.round((count + direction * step) * 2) / 2;
  return Math.max(step, Math.min(fresh, Math.max(base * 20, 50)));
}

/** How an amount is measured next to the unit: "1 TL gestr. Backpulver", "1 gestr. TL Backpulver". */
const MEASURE =
  "(?:[Gg]estr\\.|[Gg]estrichene[rnms]?|[Gg]estrichen|[Gg]eh\\.|[Gg]ehäufte[rnms]?|[Gg]ehäuft|[Ll]evel|[Hh]eaped)(?!\\p{L})";
const MEASURE_START = new RegExp(`^${MEASURE}\\s*`, "u");
/** A unit after the number, with a measure word in front of it. */
const UNIT_AFTER = new RegExp(`^\\s*(?:${MEASURE}\\s*)?(${UNIT_RE})(?![\\p{L}])`, "u");

/** Text after the unit: a comma right behind it and a measure word are not part of the name. */
const afterUnit = (t: string) =>
  t
    .replace(/^\s*,\s*/, "")
    .replace(/^\s+/, "")
    .replace(MEASURE_START, "");

/** Core of an ingredient without quantity, unit and parenthetical: "400 g Weizenmehl Type 405" → "Weizenmehl Type 405". */
export function ingredientName(line: string): string {
  let t = line.replace(/\([^)]*\)/g, " ").trim();
  const start = QUANTITY_AT_START.exec(t);
  if (start) t = t.slice(start[0].length);
  const unit = UNIT_AFTER.exec(t);
  if (unit) t = afterUnit(t.slice(unit[0].length));
  return t
    .replace(/,(?!\d).*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Quantity at the start of an ingredient line: "1 ½ EL Öl" → 1.5, "EL", "Öl"; ranges count with the upper value.
 * A comma or measure word next to the unit is not part of the rest ("1 TL, gestr. Backpulver" → "Backpulver").
 */
export function splitQuantity(line: string): { amount?: number; unit?: string; rest: string } {
  const t = line.trim();
  const start = QUANTITY_AT_START.exec(t);
  if (!start) return { rest: t };
  const amount = readNumber(start[2] ?? start[1]);
  if (amount === undefined) return { rest: t };
  const after = t.slice(start[0].length);
  const unit = UNIT_AFTER.exec(after);
  return { amount, unit: unit?.[1], rest: (unit ? afterUnit(after.slice(unit[0].length)) : after).trim() };
}
