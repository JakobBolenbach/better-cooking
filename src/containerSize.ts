// Containers with a size of their own on the shopping list ("1 (14 oz) can tomatoes"): where the size is read and how
// it is compared. Pure, no Obsidian, tested in tests/shoppingCans.test.ts.
import { SIZE_LEAD_WORDS } from "./ingredientWords";
import { splitQuantity } from "./quantities";

/** Units that come with a size of their own: "1 (14 oz) can tomatoes", "2 Dosen (à 400 g) Tomaten". Other units keep their bracket as a kind or note. */
const CONTAINER = new Set([
  ...["can", "cans", "dose", "dosen", "glas", "gläser", "package", "packages", "packung", "packungen"],
]);
export const isContainer = (unit?: string) => !!unit && CONTAINER.has(unit.toLowerCase());

/** A bracket with a number in it: the size ("(14 oz)", "(à 400 g)"), not a note ("(kleine)"). */
const SIZE_BRACKET = /\(([^()]*\d[^()]*)\)/u;
const SIZE_LEAD = new RegExp(`^\\s*(?:${SIZE_LEAD_WORDS.join("|")})\\.?(?![\\p{L}])\\s*`, "iu");

/** A size as written in brackets without its lead word: "(à 400 g)" → "400 g". */
const cleanSize = (s: string) =>
  s
    .replace(SIZE_LEAD, "")
    .replace(/(\d)(\p{L})/gu, "$1 $2")
    .trim();

/**
 * Splitting of a line like `splitQuantity`, but the size in brackets of a container is kept apart from the name,
 * wherever it stands: "1 (14 oz) can crushed tomatoes", "1 can (14 oz) crushed tomatoes" and "1 can crushed tomatoes
 * (14 oz)" are all 1 can, "crushed tomatoes", "14 oz".
 */
export function splitWithSize(line: string): ReturnType<typeof splitQuantity> & { size?: string } {
  const { lead, ...q } = splitQuantity(line);
  if (q.amount === undefined || !isContainer(q.unit)) return q;
  const inRest = SIZE_BRACKET.exec(q.rest);
  const written = lead && SIZE_BRACKET.test(`(${lead})`) ? lead : inRest?.[1];
  if (!written) return q;
  const rest = inRest ? q.rest.replace(SIZE_BRACKET, " ").replace(/\s+/g, " ").trim() : q.rest;
  return { ...q, rest, size: cleanSize(written) };
}

/** The size at the end of an item name ("crushed tomatoes (14 oz)"), if there is one. */
export const sizeOf = (name: string) => / \(([^()]*\d[^()]*)\)$/u.exec(name)?.[1];

/** A size to compare: letter case and spaces do not count ("14 oz" and "14oz"); "14 oz" and "14-ounce" stay different on purpose. */
const sizeKey = (size?: string) => (size ?? "").toLowerCase().replace(/\s+/g, "");

/**
 * The sizes of two cans allow adding them up: equal, or both without one. "No size" is a size of its own, so the
 * result never depends on which line was on the list first.
 */
export const sameSize = (a: string | undefined, b: string | undefined) => sizeKey(a) === sizeKey(b);
