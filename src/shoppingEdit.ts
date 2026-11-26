// What the shopping list page does with the list note (issue #64): reading it into rows for the page and the few
// changes it makes. Like src/shopping.ts only checkbox lines (and the note lines hanging below them) are touched;
// everything else in the note stays as the user wrote it.
//
// A line is found by its exact text and its number among identical lines (`raw`, `nth`), never by line number,
// so a note that changed in the meantime (sync, editor) is not damaged: an edit whose line is gone does nothing.
// An edit that changes nothing returns the text as it was; the line endings of the note stay as they are.
// Pure functions without Obsidian, tested in tests/shoppingEdit.test.ts.

import { hangingEnd } from "./hanging";
import {
  LINE,
  SECTION,
  SEP,
  addToList,
  amountText,
  itemFromLine,
  readItemLine,
  type Item,
  type Store,
} from "./shopping";

/** A recipe an item is for. `amount` is for the amount per recipe, which the list does not hold. */
export interface Source {
  recipe: string;
  amount?: string;
}

/** One checkbox line of the list as the page shows it. */
export interface ShoppingRow {
  /** The line as in the note. With `nth` it identifies the line in an edit and in the page. */
  raw: string;
  /** Which of the identical lines `raw` this is (0 for the first). */
  nth: number;
  /** Level-2 heading above the line (a store), undefined above the first one. */
  section?: string;
  /** Readable amount with unit ("500 g"), empty for none. */
  amount: string;
  name: string;
  checked: boolean;
  sources: Source[];
  /** Indented note lines hanging below the line, as written, without their indentation. */
  notes: string[];
}

export interface ShoppingGroup {
  /** Store; undefined for the items above the first section. */
  name?: string;
  rows: ShoppingRow[];
}

export interface ShoppingView {
  /** Open items by section in the order of the note; sections without open items are left out. */
  groups: ShoppingGroup[];
  /** Checked items in the order of the note. */
  done: ShoppingRow[];
  /** Recipes of the open items, in order of appearance. */
  recipes: string[];
  open: number;
}

/** The line an edit is about. */
export interface LineRef {
  raw: string;
  nth: number;
}

export type ShoppingEdit =
  | ({ kind: "check"; checked: boolean } & LineRef)
  | ({ kind: "remove" } & LineRef)
  | { kind: "add"; text: string }
  | { kind: "clearDone" }
  | { kind: "removeRecipe"; recipe: string };

/** Key of a row in the page. */
export const rowKey = (r: LineRef): string => `${r.nth}:${r.raw}`;

const split = (text: string) => text.split(/\r?\n/);

/** Amount as the list writes it ("500 g", "2", "1,5 l"), empty without one. */
const amountOf = (item: Item): string => (item.amount === undefined ? "" : amountText(item.amount, item.unit));

/** The sources of a row; the one place that will carry amounts per recipe. */
function sourcesOf(item: Item): Source[] {
  return item.recipes.map((recipe) => ({ recipe }));
}

/** End (exclusive) of the item at `at` with its hanging note lines. */
const itemEnd = (lines: string[], at: number): number => hangingEnd(lines, at, (l) => LINE.test(l));

/** All checkbox lines of the note as rows, in the order of the note. */
export function readShoppingRows(text: string): ShoppingRow[] {
  const lines = split(text);
  const seen = new Map<string, number>();
  const rows: ShoppingRow[] = [];
  let section: string | undefined;
  lines.forEach((raw, n) => {
    const s = SECTION.exec(raw);
    if (s) {
      section = s[1];
      return;
    }
    const item = readItemLine(raw);
    if (!item) return;
    const nth = seen.get(raw) ?? 0;
    seen.set(raw, nth + 1);
    rows.push({
      raw,
      nth,
      section,
      amount: amountOf(item),
      name: item.name,
      checked: item.checked,
      sources: sourcesOf(item),
      notes: lines.slice(n + 1, itemEnd(lines, n)).map((l) => l.trim()),
    });
  });
  return rows;
}

export function shoppingView(text: string): ShoppingView {
  const rows = readShoppingRows(text);
  const groups: ShoppingGroup[] = [];
  const open = rows.filter((x) => !x.checked);
  for (const r of open) {
    let g = groups.find((x) => x.name === r.section);
    if (!g) groups.push((g = { name: r.section, rows: [] }));
    g.rows.push(r);
  }
  return {
    groups,
    done: rows.filter((r) => r.checked),
    recipes: [...new Set(open.flatMap((r) => r.sources.map((s) => s.recipe)))],
    open: open.length,
  };
}

/** Is the row with this key still in the note? (An opened item whose line is gone no longer counts as open.) */
export const rowExists = (text: string, key: string | null): boolean =>
  key !== null && readShoppingRows(text).some((r) => rowKey(r) === key);

/** Number of open items (sidebar and list sheet). */
export const openCount = (text: string): number => split(text).filter((l) => readItemLine(l)?.checked === false).length;

/** Index of the `nth` line equal to `raw`, or -1. */
function findLine(lines: string[], ref: LineRef): number {
  let seen = 0;
  for (let n = 0; n < lines.length; n++) if (lines[n] === ref.raw && seen++ === ref.nth) return n;
  return -1;
}

/** Removes the item at `at` with the note lines hanging below it. */
function dropItem(lines: string[], at: number) {
  lines.splice(at, itemEnd(lines, at) - at);
}

/** Applies one edit of the page to the text of the list note. `heading` is the title of a new note. */
export function applyShoppingEdit(text: string, edit: ShoppingEdit, heading: string, stores: Store[] = []): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  if (edit.kind === "add") {
    // " · " in the list separates the recipes: typed in, it would turn into a recipe.
    const line = edit.text
      .replace(/\s*·\s*/g, " - ")
      .replace(/\s+/g, " ")
      .trim();
    if (!line) return text;
    return addToList(text, [itemFromLine(line, undefined)], heading, stores).replace(/\n/g, eol);
  }
  const lines = split(text);
  const before = lines.length;
  let changed = false;
  if (edit.kind === "check" || edit.kind === "remove") {
    const at = findLine(lines, edit);
    if (at < 0) return text;
    if (edit.kind === "remove") dropItem(lines, at);
    else lines[at] = lines[at].replace(/\[[ xX]\]/, edit.checked ? "[x]" : "[ ]");
    changed = true;
  } else {
    // clearDone and removeRecipe walk the whole note.
    for (let n = 0; n < lines.length; n++) {
      const item = readItemLine(lines[n]);
      if (!item) continue;
      if (edit.kind === "clearDone" ? item.checked : item.recipes.length === 1 && item.recipes[0] === edit.recipe) {
        dropItem(lines, n);
        n--;
        changed = true;
      } else if (edit.kind === "removeRecipe" && item.recipes.includes(edit.recipe)) {
        // Shared with other recipes: it loses the name but keeps its amount, because the list does not know how much
        // of it belongs to which recipe.
        const rest = item.recipes.filter((r) => r !== edit.recipe);
        lines[n] = `${lines[n].slice(0, lines[n].lastIndexOf(SEP))}${SEP}${rest.join(", ")}`;
        changed = true;
      }
    }
  }
  return changed || lines.length !== before ? lines.join(eol) : text;
}
