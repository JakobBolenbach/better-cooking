// Containers with a size of their own on the shopping list ("1 (14 oz) can tomatoes"): where the size is read and how
// it is compared. Pure, no Obsidian, tested in tests/shoppingCans.test.ts.
import { splitQuantity } from "./quantities";

/** Units that come with a size of their own: "1 (14 oz) can tomatoes", "2 Dosen (à 400 g) Tomaten". Other units keep their bracket as a kind or note. */
const CONTAINER = new Set([
  "can",
  "cans",
  "dose",
  "dosen",
  "glas",
  "gläser",
  "package",
  "packages",
  "packung",
  "packungen",
]);
export const isContainer = (unit?: string) => !!unit && CONTAINER.has(unit.toLowerCase());
const SIZE_FIRST = /^\(([^)]*\d[^)]*)\)\s*(\p{L}+)\.?\s*(.*)$/u;
const SIZE_AFTER = /^\(([^)]*\d[^)]*)\)\s*(.*)$/u;

/** A size written as "(à 400 g)" or "(14 oz)": the number with its unit, without the lead word. */
const cleanSize = (s: string) => s.replace(/^\s*(?:à|a|je|each|of|ca\.?|about)\s+/iu, "").trim();

/**
 * Splitting of a line like `splitQuantity`, but a size in brackets next to a container unit is kept apart from the
 * name: "1 (14 oz) can crushed tomatoes" and "1 can (14 oz) crushed tomatoes" are both 1 can, "crushed tomatoes", "14 oz".
 */
export function splitWithSize(line: string): ReturnType<typeof splitQuantity> & { size?: string } {
  const q = splitQuantity(line);
  if (q.amount === undefined) return q;
  if (!q.unit) {
    const m = SIZE_FIRST.exec(q.rest);
    if (m && isContainer(m[2])) return { amount: q.amount, unit: m[2], rest: m[3].trim(), size: cleanSize(m[1]) };
  } else if (isContainer(q.unit)) {
    const m = SIZE_AFTER.exec(q.rest);
    if (m) return { ...q, rest: m[2].trim(), size: cleanSize(m[1]) };
  }
  return q;
}

/** The size at the end of an item name ("crushed tomatoes (14 oz)"), if there is one. */
export const sizeOf = (name: string) => / \(([^()]*\d[^()]*)\)$/u.exec(name)?.[1];
export const sameSize = (a: string, b: string) =>
  a.toLowerCase().replace(/\s+/g, "") === b.toLowerCase().replace(/\s+/g, "");
