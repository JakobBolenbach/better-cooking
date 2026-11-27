// Line edits in the header of a note (the lines between the frontmatter and the first section) for the recipe editor:
// the title line and the key facts line. Everything else in the header stays as it is. Pure functions, tested in
// tests/recipeEdit.test.ts.
import { FACTS, SOURCE } from "./noteText";

const TITLE = /^#\s+/;

/** The header with the `# Title` line set; a note without one gets it at the top. Only this line changes. */
export function setTitleLine(head: string[], title: string): string[] {
  const line = `# ${title}`;
  const i = head.findIndex((l) => TITLE.test(l));
  if (i >= 0) return head.map((l, n) => (n === i ? line : l));
  return head[0]?.trim() ? [line, "", ...head] : [line, ...head];
}

/**
 * The header with the key facts line (yield and times, `keyFactsLine`) set: replaced where it is; a missing one goes
 * above the source line, otherwise after the last line of the header with content; `undefined` takes it away (with
 * one of the two empty lines around it).
 */
export function setFactsLine(head: string[], facts: string | undefined): string[] {
  const i = head.findIndex((l) => FACTS.test(l.trim()));
  if (i >= 0 && facts !== undefined) return head.map((l, n) => (n === i ? facts : l));
  if (i >= 0) {
    const gap = head[i - 1]?.trim() === "" && head[i + 1]?.trim() === "";
    return head.filter((_l, n) => n !== i && !(gap && n === i + 1));
  }
  if (facts === undefined) return head;
  const source = head.findIndex((l) => SOURCE.test(l.trim()));
  if (source >= 0) return [...head.slice(0, source), facts, "", ...head.slice(source)];
  const last = head.reduce((at, l, n) => (l.trim() ? n : at), -1);
  return [...head.slice(0, last + 1), ...(last >= 0 ? [""] : []), facts, ...head.slice(last + 1)];
}
