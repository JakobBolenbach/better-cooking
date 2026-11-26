// Shopping list (issue #7): a plain Markdown note with one checkbox per item, readable without the plugin.
// Adding a recipe merges equal ingredients with compatible units and remembers which recipes need them.
// Only checkbox lines are touched (a line may move into its store's section); everything else in the note stays as the user wrote it.
// Pure functions without Obsidian, tested in tests/shopping.test.ts.

import { formatQuantity, ingredientName, readNumber, roundBase, splitQuantity } from "./quantities";
import { METRIC_BASE, singularUnit, unitFor } from "./units";
import { isEquipment } from "./cooking";
import { indentOf } from "./hanging";
import { kindsOf, nameRank, pluralName, plainName, sameIngredient } from "./ingredientKey";
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

/** Other units that can be added up, with their base unit and factor; weight and volume are in METRIC_BASE. */
const BASE: Record<string, [string, number]> = {
  tl: ["TL", 1],
  teelöffel: ["TL", 1],
  el: ["EL", 1],
  esslöffel: ["EL", 1],
  päckchen: ["Päckchen", 1],
  pck: ["Päckchen", 1],
  pkg: ["Päckchen", 1],
  stück: ["", 1],
  stk: ["", 1],
  piece: ["", 1],
  tsp: ["tsp", 1],
  teaspoon: ["tsp", 1],
  tbsp: ["tbsp", 1],
  tablespoon: ["tbsp", 1],
  cup: ["cup", 1],
  oz: ["oz", 1],
  ounce: ["oz", 1],
  lb: ["oz", 16],
  lbs: ["oz", 16],
  pound: ["oz", 16],
};

/** Singular and plural of the same unit ("Prise", "Prisen") are one base unit. */
const base = (unit?: string): [string, number] => {
  if (!unit) return ["", 1];
  const one = singularUnit(unit);
  return METRIC_BASE[one.toLowerCase()] ?? BASE[one.toLowerCase()] ?? [one, 1];
};

/** Plural endings written in parentheses after a word: "Ei(er)", "Tomate(n)". */
const WRITTEN_PLURAL = "er|en|n|e|s";

/** Key of a store word: name without case and "-n"/"-s" endings (compared against item names). */
const key = (name: string) => plain(name).replace(/^(.*\p{L}{3})(?:n|s)$/u, "$1");

/** Name without case, punctuation and a plural written in parentheses: "Ei(er)", "Tomate(n)". */
const plain = (name: string) =>
  name
    .toLowerCase()
    .replace(new RegExp(`(\\p{L})\\((?:${WRITTEN_PLURAL})\\)`, "gu"), "$1")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

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

/** "6 Ei(er)": ingredientName drops the parenthetical, so a plural written that way comes back for more than one. */
function writtenPlural(line: string, name: string, amount?: number): string {
  if (!amount || amount <= 1) return name;
  for (const m of line.matchAll(new RegExp(`(\\p{L}+)\\((${WRITTEN_PLURAL})\\)`, "gu")))
    if (name.toLowerCase().endsWith(m[1].toLowerCase())) return `${name}${m[2]}`;
  return name;
}

/** Units that German writes as the end of a compound: "Knoblauchzehen" is "Zehen Knoblauch" (prefix of three letters or more). */
const COMPOUND_UNIT = /^(\p{L}{3,}?)(zehen?|scheiben?|zweige?|dosen?)$/iu;

export function itemFromLine(line: string, recipe: string | undefined, factor = 1): Item {
  const q = splitQuantity(line);
  const amount = q.amount !== undefined ? q.amount * factor : undefined;
  // Without state and use words ("weiche Butter", "Salz nach Geschmack"); preparation in front of the noun stays.
  const base = plainName(writtenPlural(line, ingredientName(line) || q.rest || line.trim(), amount));
  // Kinds after a comma or in brackets ("Zucker, braun", "Milch (3,5 %)") are part of the ingredient.
  const kinds = kindsOf(q.rest);
  let name = kinds ? `${base}, ${kinds}` : base;
  let unit = q.amount !== undefined ? q.unit : undefined;
  const compound = q.amount !== undefined && !unit && !kinds ? COMPOUND_UNIT.exec(name) : null;
  if (compound) {
    const [, noun, word] = compound;
    unit = word[0].toUpperCase() + word.slice(1).toLowerCase();
    name = noun[0].toUpperCase() + noun.slice(1);
  }
  return { amount, unit, name, recipes: recipe ? [recipe] : [], checked: false };
}

/**
 * Readable amount in a sensible unit; `amount` is in the unit as written. Rounded in the base unit first,
 * then the unit is chosen: 1500 ml and 1,5 l → 1,5 l, 250 ml stays, 20 mg stays, 1500 g → 1,5 kg.
 */
export function amountText(amount: number, unit?: string): string {
  const [b, f] = base(unit);
  if (b !== "g" && b !== "ml") {
    const text = formatQuantity(amount, unit);
    return unit ? `${text} ${unitFor(unit, readNumber(text) ?? amount)}` : text;
  }
  const v = Math.round(amount * f * 1e6) / 1e6;
  // Below 1 g in mg, never "0 g".
  if (b === "g" && v < 1 && roundBase(v * 1000) < 1000) return `${formatQuantity(v * 1000, "mg")} mg`;
  const r = roundBase(v);
  if (r >= 1000) return `${formatQuantity(r / 1000, b === "g" ? "kg" : "l")} ${b === "g" ? "kg" : "l"}`;
  return `${formatQuantity(r, b)} ${b}`;
}

export const SEP = " · ";

export function itemLine(i: Item): string {
  const amount = i.amount !== undefined ? `${amountText(i.amount, i.unit)} ` : "";
  const recipes = i.recipes.length ? `${SEP}${i.recipes.join(", ")}` : "";
  return `- [${i.checked ? "x" : " "}] ${amount}${i.name}${recipes}`;
}

export const LINE = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/;

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

/**
 * Name of a merged line: the existing line's name stays as written. It changes only to the main spelling of a
 * synonym group ("Zucker" for "Kristallzucker", then written plainly) and to the plural for counted things
 * above 1 ("1 Zwiebel" and "1 Zwiebel" are "2 Zwiebeln", "1 Apfel" and "2 Äpfel" are "3 Äpfel").
 */
function mergedName(a: Item, b: Item, amount: number, unit: string | undefined): string {
  const name = nameRank(b.name) < nameRank(a.name) ? plainName(b.name) : a.name;
  return amount > 1 && !unit ? pluralName(name) : name;
}

/** Two open items of the same ingredient (see ingredientKey) and units that can be added up; the result keeps `a`'s place. */
function merge(a: Item, b: Item): Item | undefined {
  if (a.checked || b.checked || !sameIngredient(a.name, b.name)) return undefined;
  const [ba, fa] = base(a.unit);
  const [bb, fb] = base(b.unit);
  if (a.amount === undefined || b.amount === undefined) {
    if (a.amount !== undefined || b.amount !== undefined) return undefined;
    return { ...a, name: mergedName(a, b, 0, a.unit), recipes: [...new Set([...a.recipes, ...b.recipes])] };
  }
  if (ba !== bb) return undefined;
  const sum = a.amount * fa + b.amount * fb;
  // Keep the unit when it is the base or the same in both, otherwise write the base unit.
  const unit = a.unit === b.unit ? a.unit : ba || undefined;
  const amount = unit === a.unit ? sum / fa : sum;
  return {
    ...a,
    name: mergedName(a, b, amount, unit),
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

export const SECTION = /^##\s+(.+?)\s*$/;

/** Name of the level-2 section a line is in, or undefined above the first one. */
function sectionAt(lines: string[], n: number): string | undefined {
  for (let i = n; i >= 0; i--) {
    const m = SECTION.exec(lines[i]);
    if (m) return m[1];
  }
  return undefined;
}

/** German compounds end with the word: "Weizenmehl" is bought where "Mehl" is. */
function storeByWords(item: Item, stores: Store[]): string | undefined {
  const words = plain(item.name).split(" ");
  // Also the word without its plural ending: "Kirschtomaten" is bought where "Tomate" is (store words are keys).
  // A compound ends with the store word after a prefix of three letters or more: "Reis" is not "Eis".
  const ends = (x: string, w: string) => x.length >= w.length + 3 && x.endsWith(w);
  const fits = (x: string, w: string) => x === w || ends(x, w) || ends(key(x), w) || sameIngredient(x, w);
  return stores.find((s) => s.words.some((w) => words.some((x) => fits(x, w))))?.name;
}

/** Store for an item: where the same item already is on the list, otherwise by the store's words. */
function storeFor(lines: string[], item: Item, stores: Store[]): string | undefined {
  for (let n = 0; n < lines.length; n++) {
    const existing = readItemLine(lines[n]);
    if (existing && sameIngredient(existing.name, item.name)) return sectionAt(lines, n);
  }
  return storeByWords(item, stores);
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

/** Puts an item below the last item of its section. */
function insertItem(lines: string[], item: Item, section: string | undefined) {
  const at = placeFor(lines, section);
  lines.splice(at + 1, 0, itemLine(item));
  // An empty line before the next section.
  if (SECTION.test(lines[at + 2] ?? "")) lines.splice(at + 2, 0, "");
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
        done = true;
        // Above the first section, but a store fits now: it moves there, unless notes hang below it (indented
        // lines). Lines in a section were put there by the user and stay.
        const store =
          sectionAt(lines, n) === undefined && !(lines[n + 1]?.trim() && indentOf(lines[n + 1]) > indentOf(lines[n]))
            ? storeByWords(merged, stores)
            : undefined;
        if (store) {
          lines.splice(n, 1);
          // No double empty line where the item was.
          if (!lines[n - 1]?.trim() && !lines[n]?.trim()) lines.splice(n, 1);
          insertItem(lines, merged, store);
        } else lines[n] = itemLine(merged);
      }
    }
    if (done) continue;
    insertItem(lines, item, storeFor(lines, item, stores));
  }
  return `${lines.join("\n")}\n`;
}
