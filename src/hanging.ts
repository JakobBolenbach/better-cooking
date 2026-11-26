// Lines that hang below an entry of a note the plugin edits (a shopping list item, a meal plan entry): the one place
// that says which lines belong to an entry, so reading, moving and removing agree. Pure, tested in tests/hanging.test.ts.

/** Width of the indentation of a line. */
export const indentOf = (line: string): number => /^\s*/.exec(line)![0].length;

/**
 * End (exclusive) of the entry at `at` with the lines hanging below it: the lines indented deeper than the entry,
 * up to an empty line or the next entry line at any depth (`isEntry` says what an entry line is; it has its own).
 */
export function hangingEnd(lines: string[], at: number, isEntry: (line: string) => boolean): number {
  const own = indentOf(lines[at]);
  let end = at + 1;
  while (end < lines.length && lines[end].trim() && indentOf(lines[end]) > own && !isEntry(lines[end])) end++;
  return end;
}
