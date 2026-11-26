// What the meal plan page does with the plan note (issue #65): reading it into rows and the changes it makes.
// Like src/mealPlan.ts only day headings and their entry lines are touched. An entry is found by its day and
// its exact line text (`raw`), so a note that changed meanwhile (sync, editor) is not damaged.
// Pure functions without Obsidian, tested in tests/planEdit.test.ts.

import { DAY, ENTRY, addToPlan } from "./mealPlan";
import { readResult } from "./quantities";

/** One entry line of the plan as the page shows it. */
export interface PlanRow {
  date: string;
  /** The line as in the note; identifies the entry in an edit. */
  raw: string;
  /** Link target of the recipe note (file name without .md). */
  target: string;
  servings?: number;
}

export type PlanEdit =
  | { kind: "move"; date: string; raw: string; to: string }
  | { kind: "servings"; date: string; raw: string; count: number }
  | { kind: "remove"; date: string; raw: string };

const HEADING = /^#{1,2}\s/;
const HANGING = /^\s+\S/;
const lineList = (text: string) => text.replace(/\r\n/g, "\n").split("\n");

/** All entry lines under day headings, in the order of the note. */
export function readPlanRows(text: string): PlanRow[] {
  const rows: PlanRow[] = [];
  let date: string | undefined;
  for (const raw of lineList(text)) {
    const d = DAY.exec(raw);
    if (d) {
      date = d[1];
      continue;
    }
    if (HEADING.test(raw)) {
      date = undefined;
      continue;
    }
    const e = date && ENTRY.exec(raw);
    if (date && e) {
      const servings = readResult(e[2].replace(/^\s*[·:,-]\s*/, ""))?.count;
      rows.push({ date, raw, target: e[1].trim(), ...(servings ? { servings } : {}) });
    }
  }
  return rows;
}

/** Index of the entry line `raw` inside the section of `date`, or -1. */
function find(lines: string[], date: string, raw: string): number {
  const start = lines.findIndex((l) => DAY.exec(l)?.[1] === date);
  if (start < 0) return -1;
  for (let n = start + 1; n < lines.length && !HEADING.test(lines[n]); n++) if (lines[n] === raw) return n;
  return -1;
}

/** Removes the entry (with the indented lines below it); a day left without any content loses its heading. */
function drop(lines: string[], date: string, at: number): string[] {
  let end = at + 1;
  while (end < lines.length && HANGING.test(lines[end])) end++;
  const removed = lines.splice(at, end - at);
  const start = lines.findIndex((l) => DAY.exec(l)?.[1] === date);
  let to = start + 1;
  while (to < lines.length && !HEADING.test(lines[to])) to++;
  if (lines.slice(start + 1, to).every((l) => !l.trim())) lines.splice(start, to - start);
  return removed;
}

/** The entry with another number of servings; an entry without one gets " · n". */
function withServings(raw: string, count: number): string {
  const m = /^(\s*[-*]\s+(?:\[[ xX]\]\s+)?\[\[[^\]]+\]\])(.*)$/.exec(raw);
  if (!m) return raw;
  const tail = /^(\s*[·:,-]\s*)(\d+(?:[.,]\d+)?)(.*)$/.exec(m[2]);
  return tail ? `${m[1]}${tail[1]}${count}${tail[3]}` : `${m[1]} · ${count}${m[2]}`;
}

/** Applies one edit of the page to the text of the plan note; `title` is the heading of a new note. */
export function applyPlanEdit(text: string, edit: PlanEdit, title: string): string {
  const lines = lineList(text);
  const at = find(lines, edit.date, edit.raw);
  if (at < 0) return text;
  if (edit.kind === "servings") {
    lines[at] = withServings(lines[at], edit.count);
    return lines.join("\n");
  }
  if (edit.kind === "remove") {
    drop(lines, edit.date, at);
    return lines.join("\n");
  }
  if (edit.to === edit.date) return text;
  // The entry travels with the note lines below it (addToPlan puts the text in as one block).
  const entry = drop(lines, edit.date, at).join("\n");
  return addToPlan(lines.join("\n"), edit.to, entry, title);
}
