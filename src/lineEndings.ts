// Line endings of a note the recipe editor writes (issue #131): a line that did not change keeps its own ending, a new
// line gets the ending most lines of the note have. Linear: the common start and end of both texts are matched line by
// line, a line in between takes the ending of an old line of the same text if there is one. Pure, tested in
// tests/recipeEdit.test.ts.

/** `next` (lines separated by "\n") with the endings of `old` where a line is the same; `old` without "\r" is no work. */
export function withEndings(old: string, next: string): string {
  if (!old.includes("\r")) return next;
  const pieces = old.split("\n");
  const ends = pieces.map((l, i) => (i < pieces.length - 1 ? (l.endsWith("\r") ? "\r\n" : "\n") : ""));
  const common = ends.filter((e) => e === "\r\n").length * 2 >= ends.filter(Boolean).length ? "\r\n" : "\n";
  const before = pieces.map((l) => l.replace(/\r$/, ""));
  const lines = next.split("\n");
  const ending: (string | undefined)[] = lines.map(() => undefined);
  let head = 0;
  while (head < before.length && head < lines.length && before[head] === lines[head]) {
    ending[head] = ends[head];
    head++;
  }
  let tail = 0;
  while (
    tail < before.length - head &&
    tail < lines.length - head &&
    before[before.length - 1 - tail] === lines[lines.length - 1 - tail]
  ) {
    ending[lines.length - 1 - tail] = ends[before.length - 1 - tail];
    tail++;
  }
  // In between: an old line of the same text lends its ending (in order), else the common one.
  const spare = new Map<string, string[]>();
  for (let i = head; i < before.length - tail; i++) spare.set(before[i], [...(spare.get(before[i]) ?? []), ends[i]]);
  for (let j = head; j < lines.length - tail; j++) ending[j] = spare.get(lines[j])?.shift() || undefined;
  return lines.map((l, j) => l + (j === lines.length - 1 ? "" : ending[j] || common)).join("");
}
