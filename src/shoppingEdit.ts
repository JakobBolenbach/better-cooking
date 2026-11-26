// What the shopping list page does with the list note (issue #64): reading it into rows for the page and the few
// changes it makes. Like src/shopping.ts only checkbox lines are touched; everything else in the note stays as the
// user wrote it. A line is found by its exact text (`raw`), never by number, so a note that changed in the
// meantime (sync, editor) is not damaged: an edit whose line is gone does nothing.
// Pure functions without Obsidian, tested in tests/shoppingEdit.test.ts.

import { addToList, itemFromLine, itemLine, readItemLine, removeChecked, type Item, type Store } from "./shopping";

/** A recipe an item is for. `amount` is for the amount per recipe, which the list does not hold yet. */
export interface Source {
  recipe: string;
  amount?: string;
}

/** One checkbox line of the list as the page shows it. */
export interface ShoppingRow {
  /** The line as in the note; identifies the line in an edit. */
  raw: string;
  /** Level-2 heading above the line (a store), undefined above the first one. */
  section?: string;
  /** Readable amount with unit ("500 g"), empty for none. */
  amount: string;
  name: string;
  checked: boolean;
  sources: Source[];
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

export type ShoppingEdit =
  | { kind: "check"; raw: string; checked: boolean }
  | { kind: "remove"; raw: string }
  | { kind: "add"; text: string }
  | { kind: "clearDone" }
  | { kind: "removeRecipe"; recipe: string };

const SECTION = /^##\s+(.+?)\s*$/;
const SEP = " · ";
const HANGING = /^\s+\S/;
const NESTED_ITEM = /^\s+[-*]\s+\[[ xX]\]\s/;

const lineList = (text: string) => text.replace(/\r\n/g, "\n").split("\n");

/** Amount as the list writes it ("500 g", "2", "1,5 l"), empty without one. */
function amountOf(item: Item): string {
  if (item.amount === undefined) return "";
  return itemLine({ ...item, name: "", recipes: [], checked: false })
    .replace(/^- \[ \]/, "")
    .trim();
}

/** The sources of a row; the one place that will carry amounts per recipe. */
function sourcesOf(item: Item): Source[] {
  return item.recipes.map((recipe) => ({ recipe }));
}

/** All checkbox lines of the note as rows, in the order of the note. */
export function readShoppingRows(text: string): ShoppingRow[] {
  const rows: ShoppingRow[] = [];
  let section: string | undefined;
  for (const raw of lineList(text)) {
    const s = SECTION.exec(raw);
    if (s) {
      section = s[1];
      continue;
    }
    const item = readItemLine(raw);
    if (item) {
      rows.push({
        raw,
        section,
        amount: amountOf(item),
        name: item.name,
        checked: item.checked,
        sources: sourcesOf(item),
      });
    }
  }
  return rows;
}

export function shoppingView(text: string): ShoppingView {
  const rows = readShoppingRows(text);
  const groups: ShoppingGroup[] = [];
  for (const r of rows.filter((x) => !x.checked)) {
    let g = groups.find((x) => x.name === r.section);
    if (!g) groups.push((g = { name: r.section, rows: [] }));
    g.rows.push(r);
  }
  const open = rows.filter((r) => !r.checked);
  return {
    groups,
    done: rows.filter((r) => r.checked),
    recipes: [...new Set(open.flatMap((r) => r.sources.map((s) => s.recipe)))],
    open: open.length,
  };
}

/** Number of open items (sidebar and list sheet). */
export const openCount = (text: string): number =>
  lineList(text).filter((l) => readItemLine(l)?.checked === false).length;

/** Removes the line at `at` and the indented note lines that hang below it. */
function dropLine(lines: string[], at: number) {
  let end = at + 1;
  while (end < lines.length && HANGING.test(lines[end]) && !NESTED_ITEM.test(lines[end])) end++;
  lines.splice(at, end - at);
}

/** Applies one edit of the page to the text of the list note. `heading` is the title of a new note. */
export function applyShoppingEdit(text: string, edit: ShoppingEdit, heading: string, stores: Store[] = []): string {
  if (edit.kind === "add") {
    const line = edit.text.replace(/\s+/g, " ").trim();
    return line ? addToList(text, [itemFromLine(line, undefined)], heading, stores) : text;
  }
  if (edit.kind === "clearDone") return removeChecked(text);
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (edit.kind === "check" || edit.kind === "remove") {
    const at = lines.indexOf(edit.raw.replace(/\r$/, ""));
    if (at < 0) return text;
    if (edit.kind === "remove") dropLine(lines, at);
    else lines[at] = lines[at].replace(/\[[ xX]\]/, edit.checked ? "[x]" : "[ ]");
    return lines.join("\n");
  }
  // removeRecipe: items only for this recipe go; a shared item loses the name but keeps its amount, because the
  // list does not know how much of it belongs to which recipe.
  for (let n = 0; n < lines.length; n++) {
    const item = readItemLine(lines[n]);
    if (!item || !item.recipes.includes(edit.recipe)) continue;
    if (item.recipes.length === 1) {
      dropLine(lines, n);
      n--;
    } else {
      const rest = item.recipes.filter((r) => r !== edit.recipe);
      lines[n] = `${lines[n].slice(0, lines[n].lastIndexOf(SEP))}${SEP}${rest.join(", ")}`;
    }
  }
  return lines.join("\n");
}
