// Shopping list (issue #7): a plain Markdown note with one checkbox per item, readable without the plugin.
// Adding a recipe merges equal ingredients with compatible units and remembers which recipes need them.
// Only checkbox lines are touched; everything else in the note stays as the user wrote it.
// Pure functions without Obsidian, tested in tests/shopping.test.ts.

import { formatQuantity, ingredientName, splitQuantity } from "./quantities";
import { isEquipment } from "./cooking";
import type { IngredientGroup } from "./types";

export interface Item {
  amount?: number;
  /** Unit as written ("g", "EL"); undefined for counts ("2 Zwiebeln"). */
  unit?: string;
  name: string;
  /** Titles of the recipes the item is for. */
  recipes: string[];
  checked: boolean;
}

/** Units that can be added up, with their base unit and factor. */
const BASE: Record<string, [string, number]> = {
  mg: ["g", 0.001],
  g: ["g", 1],
  gramm: ["g", 1],
  kg: ["g", 1000],
  kilogramm: ["g", 1000],
  ml: ["ml", 1],
  milliliter: ["ml", 1],
  cl: ["ml", 10],
  dl: ["ml", 100],
  l: ["ml", 1000],
  liter: ["ml", 1000],
  tl: ["TL", 1],
  teelöffel: ["TL", 1],
  el: ["EL", 1],
  esslöffel: ["EL", 1],
  stück: ["", 1],
  stücke: ["", 1],
  stk: ["", 1],
  piece: ["", 1],
  pieces: ["", 1],
  tsp: ["tsp", 1],
  teaspoon: ["tsp", 1],
  teaspoons: ["tsp", 1],
  tbsp: ["tbsp", 1],
  tablespoon: ["tbsp", 1],
  tablespoons: ["tbsp", 1],
  cup: ["cups", 1],
  cups: ["cups", 1],
  oz: ["oz", 1],
  ounce: ["oz", 1],
  ounces: ["oz", 1],
  lb: ["oz", 16],
  lbs: ["oz", 16],
  pound: ["oz", 16],
  pounds: ["oz", 16],
};

const base = (unit?: string): [string, number] => (unit ? (BASE[unit.toLowerCase()] ?? [unit, 1]) : ["", 1]);

/** Key for merging: name without case, quantity words and plural "-n"/"-s" endings. */
const key = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(.*\p{L}{3})(?:n|s)$/u, "$1");

/**
 * Items of a recipe's ingredients for a servings factor; equipment groups are left out, and so are the
 * ingredients in `skip` (keys "group-line" as on the recipe page, where checked means "already there").
 */
export function itemsFromRecipe(
  title: string,
  groups: IngredientGroup[],
  factor = 1,
  skip: readonly string[] = [],
): Item[] {
  const out: Item[] = [];
  groups.forEach((g, gi) => {
    if (isEquipment(g.title)) return;
    g.ingredients.forEach((line, zi) => {
      if (!skip.includes(`${gi}-${zi}`)) out.push(itemFromLine(line, title, factor));
    });
  });
  return out;
}

export function itemFromLine(line: string, recipe: string | undefined, factor = 1): Item {
  const q = splitQuantity(line);
  const name = ingredientName(line) || q.rest || line.trim();
  return {
    amount: q.amount !== undefined ? q.amount * factor : undefined,
    unit: q.amount !== undefined ? q.unit : undefined,
    name,
    recipes: recipe ? [recipe] : [],
    checked: false,
  };
}

/** Readable amount in a sensible unit: 1500 g → 1,5 kg, 250 ml stays. */
function amountText(amount: number, unit?: string): string {
  const [b] = base(unit);
  if (b === "g" && amount >= 1000) return `${formatQuantity(amount / 1000, "kg")} kg`;
  if (b === "ml" && amount >= 1000) return `${formatQuantity(amount / 1000, "l")} l`;
  if (b === "g" || b === "ml") return `${formatQuantity(amount, b)} ${b}`;
  return unit ? `${formatQuantity(amount, unit)} ${unit}` : formatQuantity(amount);
}

const SEP = " · ";

export function itemLine(i: Item): string {
  const amount = i.amount !== undefined ? `${amountText(i.amount, i.unit)} ` : "";
  const recipes = i.recipes.length ? `${SEP}${i.recipes.join(", ")}` : "";
  return `- [${i.checked ? "x" : " "}] ${amount}${i.name}${recipes}`;
}

const LINE = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/;

/** Item from a checkbox line of the list; undefined for any other line. */
export function readItemLine(line: string): Item | undefined {
  const m = LINE.exec(line);
  if (!m) return undefined;
  const text = m[2].trim();
  const i = text.lastIndexOf(SEP);
  const main = i >= 0 ? text.slice(0, i) : text;
  const recipes =
    i >= 0
      ? text
          .slice(i + SEP.length)
          .split(/,\s*/)
          .filter(Boolean)
      : [];
  const q = splitQuantity(main);
  return {
    amount: q.amount,
    unit: q.amount !== undefined ? q.unit : undefined,
    name: q.amount !== undefined ? q.rest : main,
    recipes,
    checked: m[1] !== " ",
  };
}

/** Two open items with the same name and units that can be added up; the result keeps `a`'s place. */
function merge(a: Item, b: Item): Item | undefined {
  if (a.checked || b.checked || key(a.name) !== key(b.name)) return undefined;
  const [ba, fa] = base(a.unit);
  const [bb, fb] = base(b.unit);
  if (a.amount === undefined || b.amount === undefined) {
    if (a.amount !== undefined || b.amount !== undefined) return undefined;
    return { ...a, recipes: [...new Set([...a.recipes, ...b.recipes])] };
  }
  if (ba !== bb) return undefined;
  const sum = a.amount * fa + b.amount * fb;
  // Keep the unit when it is the base or the same in both, otherwise write the base unit.
  const unit = a.unit === b.unit ? a.unit : ba || undefined;
  const amount = unit === a.unit ? sum / fa : sum;
  return {
    ...a,
    // "1 Zwiebel" and "2 Zwiebeln": keep the plural.
    name: amount > 1 && b.name.length > a.name.length ? b.name : a.name,
    amount,
    unit,
    recipes: [...new Set([...a.recipes, ...b.recipes])],
  };
}

/** A store and the words of items bought there (setting "Stores", one "Store: word, word" per line). */
export interface Store {
  name: string;
  words: string[];
}

/** Reads the setting "Stores"; lines without a colon or without words are skipped. */
export function readStores(text: string): Store[] {
  const out: Store[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const i = raw.indexOf(":");
    if (i < 1) continue;
    const name = raw
      .slice(0, i)
      .replace(/[#[\]]/g, "")
      .trim()
      .slice(0, 40);
    const words = raw
      .slice(i + 1)
      .split(",")
      .map((w) => key(w))
      .filter(Boolean);
    if (name && words.length) out.push({ name, words });
  }
  return out;
}

const SECTION = /^##\s+(.+?)\s*$/;

/** Name of the level-2 section a line is in, or undefined above the first one. */
function sectionAt(lines: string[], n: number): string | undefined {
  for (let i = n; i >= 0; i--) {
    const m = SECTION.exec(lines[i]);
    if (m) return m[1];
  }
  return undefined;
}

/** Store for an item: where the same item already is on the list, otherwise by the store's words. */
function storeFor(lines: string[], item: Item, stores: Store[]): string | undefined {
  const k = key(item.name);
  for (let n = 0; n < lines.length; n++) {
    const existing = readItemLine(lines[n]);
    if (existing && key(existing.name) === k) return sectionAt(lines, n);
  }
  // German compounds end with the word: "Weizenmehl" is bought where "Mehl" is.
  const words = k.split(" ");
  return stores.find((s) => s.words.some((w) => words.some((x) => x === w || x.endsWith(w))))?.name;
}

/** Index after which a new item of `section` goes (creates the section at the end if needed). */
function placeFor(lines: string[], section: string | undefined): number {
  const start = section ? lines.findIndex((l) => SECTION.exec(l)?.[1] === section) : -1;
  if (section && start < 0) {
    if (lines[lines.length - 1]?.trim()) lines.push("");
    lines.push(`## ${section}`);
    return lines.length - 1;
  }
  // The part of the list: from the section heading (or the top) to the next level-2 heading.
  const from = section ? start + 1 : 0;
  let to = lines.findIndex((l, n) => n >= from && SECTION.test(l));
  if (to < 0) to = lines.length;
  let last = section ? start : -1;
  for (let n = from; n < to; n++) if (LINE.test(lines[n])) last = n;
  if (last >= 0) return last;
  // No item yet in the part above the first section: after the title.
  let n = to - 1;
  while (n >= from && !lines[n].trim()) n--;
  // Right below the title: keep an empty line between title and list.
  if (n >= 0 && lines[n].startsWith("# ")) {
    if (lines[n + 1] !== "") lines.splice(n + 1, 0, "");
    return n + 1;
  }
  return n;
}

/**
 * Adds items to the list note: an open item with the same name and a compatible unit is updated in place,
 * anything else goes into its store's section (`## Store`, see readStores) or into the part above the first
 * section. A new list starts with `heading`.
 */
export function addToList(text: string, items: Item[], heading: string, stores: Store[] = []): string {
  const lines = text ? text.replace(/\r\n/g, "\n").split("\n") : [`# ${heading}`, ""];
  if (text && lines[lines.length - 1] === "") lines.pop();
  for (const item of items) {
    let done = false;
    for (let n = 0; n < lines.length && !done; n++) {
      const existing = readItemLine(lines[n]);
      const merged = existing && merge(existing, item);
      if (merged) {
        lines[n] = itemLine(merged);
        done = true;
      }
    }
    if (done) continue;
    const at = placeFor(lines, storeFor(lines, item, stores));
    lines.splice(at + 1, 0, itemLine(item));
    // An empty line before the next section.
    if (SECTION.test(lines[at + 2] ?? "")) lines.splice(at + 2, 0, "");
  }
  return `${lines.join("\n")}\n`;
}

/** Removes checked items, e.g. after shopping. */
export function removeChecked(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => !readItemLine(l)?.checked)
    .join("\n");
}
