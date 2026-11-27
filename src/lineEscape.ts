// Typed text in list lines (recipe editor, issue #131): what makes a text structurally safe at the start of a line, and
// the reverse used by the reader (src/parse.ts), so every view shows the text as it was typed, without the backslash.
// Pure functions, tested in tests/sectionDiff.test.ts.

/** Starts of a text that would be read as something else at the start of a line (`**` only matters in a step). */
const LEAD = /^(#|>|\||-\s|\+\s|\*\s|\d+[.)](\s|$)|\[[ xX/-]\](\s|$)|!\[\[)/;
const STEP_LEAD = /^\*\*/;

const lead = (s: string, step: boolean) => LEAD.test(s) || (step && STEP_LEAD.test(s));

/** Line breaks become spaces (a line is one item); a start that looks like structure is escaped. Inline Markdown stays. */
export function safeText(s: string, step = false): string {
  const t = s.replace(/\s*[\r\n\u2028\u2029]+\s*/g, " ").trim();
  return lead(t, step) ? `\\${t}` : t;
}

/** The text of an item as typed: the escape of `safeText` taken off again. */
export const unescapeLead = (s: string, step = false): string =>
  s.startsWith("\\") && lead(s.slice(1), step) ? s.slice(1) : s;

/** A group or step title: one line, no `*` (it is written in bold) and no colon at the end. */
export const cleanTitle = (s: string): string =>
  s
    .replace(/[\r\n\u2028\u2029]+/g, " ")
    .replace(/\*/g, "")
    .trim()
    .replace(/:$/, "")
    .trim();

/** One line: line breaks and tabs become a space, no space at the ends. */
export const oneLine = (s: string | undefined): string => (s ?? "").replace(/\s*[\r\n\t\u2028\u2029]+\s*/g, " ").trim();

/** An ingredient or tip as one entry: one line, a typed list marker or checkbox at its start taken off. */
export const cleanItem = (s: string | undefined): string =>
  oneLine(s)
    .replace(/^([-*•]\s+)?(\[[ xX/-]\]\s+)?/, "")
    .trim();
