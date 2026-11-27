// What the meal plan page does with the plan note (issue #65): the changes it makes. Like src/mealPlan.ts only day
// headings and their entry lines (with the lines hanging below them, src/hanging.ts) are touched. An entry is found
// by its day, its exact line text and its number among identical lines of that day (`raw`, `nth`), in all sections
// of that day, so a note that changed in the meantime (sync, editor) is not damaged. An edit that changes nothing
// returns the text as it was; the line endings of the note stay as they are.
// Pure functions without Obsidian, tested in tests/planEdit.test.ts.

import { DAY, ENTRY, HEADING, addToPlan, lineList, readPlanRows } from "./mealPlan";
import { hangingEnd } from "./hanging";
import type { Lang } from "./i18n";
import { formatQuantity, resultNumberSpan } from "./quantities";

/** The entry an edit is about. */
export interface EntryRef {
  date: string;
  raw: string;
  nth: number;
}

export type PlanEdit =
  | ({ kind: "move"; to: string } & EntryRef)
  | ({ kind: "servings"; count: number } & EntryRef)
  | ({ kind: "remove" } & EntryRef)
  /** Puts removed lines (the entry and its hanging lines) back on their day: after the entry `after` if it is still there, otherwise at the end of the day. */
  /** Deletes a recipe (#119): all its entries from the day `from` on (today counts), the days before stay as text. `matches` says whether the link of an entry points to the recipe. */
  | { kind: "removeRecipe"; from: string; matches: (target: string) => boolean }
  | { kind: "restore"; date: string; lines: string[]; after?: { raw: string; nth: number } };

/** The day heading the plugin writes ("## 2026-11-30 · Montag", also without the weekday): nothing of the user's on it. */
const PLAIN_HEADING = /^##\s+\d{4}-\d{2}-\d{2}(?:\s*·\s*\p{L}+)?\s*$/u;

/** Index of the entry, or -1. */
function find(lines: string[], ref: EntryRef): number {
  let date: string | undefined;
  let seen = 0;
  for (let n = 0; n < lines.length; n++) {
    const d = DAY.exec(lines[n]);
    if (d) date = d[1];
    else if (HEADING.test(lines[n])) date = undefined;
    else if (date === ref.date && lines[n] === ref.raw && seen++ === ref.nth) return n;
  }
  return -1;
}

/** Removes lines [from, to); the plugin's own heading of a day left without any content goes too, a heading with text of the user's never. */
function drop(lines: string[], from: number, to: number): string[] {
  let head = from - 1;
  while (head >= 0 && !HEADING.test(lines[head])) head--;
  const removed = lines.splice(from, to - from);
  if (head < 0 || !PLAIN_HEADING.test(lines[head])) return removed;
  let end = head + 1;
  while (end < lines.length && !HEADING.test(lines[end])) end++;
  if (lines.slice(head + 1, end).every((l) => !l.trim())) lines.splice(head, end - head);
  return removed;
}

/** The entry with another number of servings: only the amount is replaced (a range becomes one number), the text around it stays.
 * Servings are whole or half ("4", "1 ½"), so the written number has no decimal separator and does not depend on a language. */
export function servingsRaw(raw: string, count: number): string {
  const e = ENTRY.exec(raw);
  if (!e) return raw;
  const head = raw.slice(0, raw.length - e[2].length);
  const tail = e[2];
  const lead = /^\s*[·:,-]?\s*/.exec(tail)![0].length;
  const span = resultNumberSpan(tail.slice(lead));
  if (!span) return `${head} · ${formatQuantity(count, undefined, "en")}${tail}`;
  return `${head}${tail.slice(0, lead + span[0])}${formatQuantity(count, undefined, "en")}${tail.slice(lead + span[1])}`;
}

/** Applies one edit of the page to the text of the plan note; `title` is the heading of a new note. */
export function applyPlanEdit(text: string, edit: PlanEdit, title: string, lang: Lang): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = lineList(text);
  if (edit.kind === "restore") {
    if (!edit.lines.length) return text;
    const anchor = edit.after ? find(lines, { date: edit.date, ...edit.after }) : -1;
    if (anchor < 0) return addToPlan(text, edit.date, edit.lines.join("\n"), title, lang).replace(/\n/g, eol);
    lines.splice(
      hangingEnd(lines, anchor, (l) => ENTRY.test(l)),
      0,
      ...edit.lines,
    );
    return lines.join(eol);
  }
  if (edit.kind === "removeRecipe") {
    // From the last entry to the first: removing a line moves the number (`nth`) of the identical lines after it only.
    const rows = readPlanRows(text).filter((r) => r.date >= edit.from && edit.matches(r.target));
    for (const r of rows.reverse()) {
      const n = find(lines, r);
      if (n >= 0)
        drop(
          lines,
          n,
          hangingEnd(lines, n, (l) => ENTRY.test(l)),
        );
    }
    return lines.join(eol);
  }
  const at = find(lines, edit);
  if (at < 0) return text;
  if (edit.kind === "servings") {
    lines[at] = servingsRaw(lines[at], edit.count);
    return lines.join(eol);
  }
  if (edit.kind === "move" && edit.to === edit.date) return text;
  const removed = drop(
    lines,
    at,
    hangingEnd(lines, at, (l) => ENTRY.test(l)),
  );
  if (edit.kind === "remove") return lines.join(eol);
  // The entry travels with its hanging lines (addToPlan puts the text in as one block).
  return addToPlan(lines.join("\n"), edit.to, removed.join("\n"), title, lang).replace(/\n/g, eol);
}
