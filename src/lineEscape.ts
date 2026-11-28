// The one rule for the start of a line of text (issue #131): what would be read as something else at the start of a
// Markdown line is escaped with a backslash, and the reader takes exactly that backslash off again. Used for imported
// text (`defuse` in src/recipeNote.ts), for text typed in the recipe editor (`safeText`) and by the reader
// (`unescapeLead` in src/parse.ts), so every view shows the text as it was written. Pure, tested in
// tests/sectionDiff.test.ts and tests/schemaorg.test.ts.

/**
 * Starts that are no plain text: heading, quote, table, code fence, list markers, rules (`-`, `--`, `---`, `===`),
 * a number with a dot, a task-list box, an embed.
 */
export const LINE_START = /^(#|>|\||`|~|=|-|\+|\*|\d+[.)](\s|$)|\[[ xX/-]\](\s|$)|!\[\[)/;

/** `t` with a backslash in front if its start would be read as something else. */
export const escapeStart = (t: string): string => (LINE_START.test(t) ? `\\${t}` : t);

/** Exactly the reverse of `escapeStart`: a backslash in front of such a start is taken off. */
export const unescapeLead = (s: string): string => (s.startsWith("\\") && LINE_START.test(s.slice(1)) ? s.slice(1) : s);

/**
 * "Zutaten:" / "Ingredients:" after a list marker in the middle of a line ("Rühren. - Zutaten: Mehl") is the line under a step
 * (ADR 0009) for a version that joins it into the text and could be taken for it again: an invisible character in front of the
 * colon keeps it text.
 */
export const noStepList = (s: string): string => s.replace(/(\s[-*]\s+(?:Zutaten|Ingredients))(\s*:)/gi, "$1\u200b$2");

/** One line: line breaks and tabs become a space, no space at the ends. */
export const oneLine = (s: string | undefined): string => (s ?? "").replace(/\s*[\r\n\t\u2028\u2029]+\s*/g, " ").trim();

/** Typed text as one safe line. Inline Markdown stays. */
export const safeText = (s: string): string => escapeStart(noStepList(oneLine(s)));

/** A group or step title: one line, no `*` (it is written in bold) and no colon at the end. */
export const cleanTitle = (s: string): string => oneLine(s).replace(/\*/g, "").trim().replace(/:$/, "").trim();

/** An ingredient or tip as one entry: one line, a typed list marker or checkbox at its start taken off. */
export const cleanItem = (s: string | undefined): string =>
  oneLine(s)
    .replace(/^([-*•]\s+)?(\[[ xX/-]\]\s+)?/, "")
    .trim();
