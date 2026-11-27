// Line endings of a note the recipe editor writes (issue #131): a line that did not change keeps its own ending, a new
// line gets the ending most lines of the note have. Pure, tested in tests/recipeEdit.test.ts.
import { lcs } from "./sectionDiff";

/** `next` (lines separated by "\n") with the endings of `old` where a line is the same; `old` without "\r" is no work. */
export function withEndings(old: string, next: string): string {
  if (!old.includes("\r")) return next;
  const pieces = old.split("\n");
  const ends = pieces.map((l, i) => (i < pieces.length - 1 ? (l.endsWith("\r") ? "\r\n" : "\n") : ""));
  const crlf = ends.filter((e) => e === "\r\n").length;
  const common = crlf * 2 >= ends.filter(Boolean).length ? "\r\n" : "\n";
  const oldLines = pieces.map((l) => l.replace(/\r$/, ""));
  const lines = next.split("\n");
  const at = new Map(lcs(oldLines, lines).map(([i, j]) => [j, i]));
  return lines
    .map((l, j) => l + (j === lines.length - 1 ? "" : at.has(j) ? ends[at.get(j)!] || common : common))
    .join("");
}
