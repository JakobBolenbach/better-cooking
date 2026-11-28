// The entries of a list section (ingredient, group title, step, tip) with the lines they take: the one set of rules the
// page reads them by (`parseRecipe` in src/parse.ts) and the recipe editor writes by (src/sectionDiff.ts).
// Pure functions without Obsidian, tested in tests/hanging.test.ts and tests/sectionDiff.test.ts.
import { unescapeLead } from "./lineEscape";
import { TAIL, readIngredientLine } from "./stepIngredients";

/** A task-list box at the start of an item (`[ ]`, `[x]`, `[/]`, `[-]`); the fingerprint ignores it too (src/fingerprint.ts). */
export const CHECKBOX = String.raw`\[[ xX/-]\]`;
export const BULLET = new RegExp(String.raw`^\s*[-*]\s+(?:${CHECKBOX}\s+)?(.*)$`);
export const NUMBERED = new RegExp(String.raw`^\s*\d+[.)]\s+(?:${CHECKBOX}\s+)?(.*)$`);

export const withoutHint = (z: string) => !z.trim().startsWith(">");

/** One entry of a list section (ingredient, group title, step, tip) with the lines it takes (indexes into the section). */
export interface ListEntry {
  type: "title" | "item";
  /** The entry's own line first, then the lines hanging below it. */
  lines: number[];
  /** Group title (type "title"), or the text of an item with its hanging lines joined (as the page shows it). */
  text: string;
  /** Bold title of a step. */
  title?: string;
  /** A marker without text (`- `, `1. `): a placeholder, not an item. */
  empty: boolean;
  /** Step only: the items of the line "Zutaten: …" hanging below it (an empty list for none), and the line (not part of `text`). */
  ingredients?: string[];
  /** The lines of "Zutaten: …" (more than one are merged). None if a version without this reader joined it into the text. */
  ingredientsLines?: number[];
  /** The list was part of the step's text (see `repairTail`): its own line holds it. */
  tail?: boolean;
}

export type ListKind = "ingredients" | "steps" | "tips";

const GROUP_TITLES = [/^\s*\*\*(.+?)\*\*\s*:?\s*$/, /^\s*###\s+(.+)$/];

/**
 * The entries of a list section found by the one set of rules the page reads them by (`parseRecipe` is built on this)
 * and the recipe editor writes by (src/sectionDiff.ts). Hanging lines: of a step every later line with content that is
 * no heading or embed, of a tip and an ingredient every indented line; they belong to the entry above. Escaped starts
 * (`\## x`, see src/lineEscape.ts) are shown as typed.
 */
export function listEntries(lines: string[], kind: ListKind): ListEntry[] {
  const out: ListEntry[] = [];
  const last = () => out[out.length - 1];
  // A line below an entry: of a step it joins its text; a tip takes it from the last tip with text (as the page always
  // did), an ingredient only directly below it. An empty entry (a marker alone) takes nothing.
  const hang = (z: string, i: number) => {
    const e = kind === "steps" ? last() : kind === "tips" ? [...out].reverse().find((x) => !x.empty) : last();
    if (!e || e.type !== "item" || (e.empty && kind !== "steps")) return;
    e.lines.push(i);
    // The line "Zutaten: …" under a step is no text of it (ADR 0009); several lines are one list.
    const list = kind === "steps" ? readIngredientLine(z, e.lines.at(-2) === i - 1) : undefined;
    if (list) {
      e.ingredients = [...(e.ingredients ?? []), ...list];
      (e.ingredientsLines ??= []).push(i);
      return;
    }
    if (kind !== "ingredients") e.text += " " + z.trim();
    if (kind === "steps" && e.text.trim()) e.empty = false;
  };
  lines.forEach((z, i) => {
    if (!withoutHint(z)) return;
    if (kind === "ingredients") {
      const t = GROUP_TITLES.map((re) => re.exec(z)).find(Boolean);
      if (t) return void out.push({ type: "title", lines: [i], text: t[1].replace(/:$/, "").trim(), empty: false });
    }
    if (kind === "steps") {
      const m = NUMBERED.exec(z);
      if (m) {
        const t = m[1].trim();
        const bold = /^\*\*(.+?)\*\*\s*:?\s*(.*)$/.exec(t);
        const text = bold ? bold[2].trim() : t;
        const title = bold ? bold[1].replace(/:$/, "").trim() : undefined;
        out.push({ type: "item", lines: [i], text: unescapeLead(text), title, empty: !text && !title });
      } else if (z.trim() && !/^#/.test(z.trim()) && !/^!\[\[/.test(z.trim())) hang(z, i);
      return;
    }
    const m = BULLET.exec(z);
    if (m) out.push({ type: "item", lines: [i], text: unescapeLead(m[1].trim()), empty: !m[1].trim() });
    else if (z.trim() && /^\s{2,}/.test(z)) hang(z, i);
  });
  if (kind === "steps") out.forEach(repairTail);
  return out;
}

/** A step whose text ends in "- Zutaten: …" (written by a version that joined the line into the text): the line is back. */
function repairTail(e: ListEntry): void {
  const m = e.type === "item" && e.ingredients === undefined ? TAIL.exec(e.text) : null;
  if (!m) return;
  e.ingredients = readIngredientLine(` ${m[0].trim()}`) ?? [];
  e.text = e.text.slice(0, m.index).trim();
  e.tail = true;
}
