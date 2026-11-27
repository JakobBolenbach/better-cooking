// Which note translates which (issue #10, #119): one rule for the overview (src/ui/lists.ts) and for "Delete recipe"
// (src/deletePlan.ts). Pure functions without Obsidian, tested in tests/translations.test.ts.
import { linkTarget, noteName } from "./parse";

/**
 * The link target in a frontmatter value as Obsidian hands it over: the text of `"[[Name]]"`, or the nested array
 * Obsidian reads from an unquoted `[[Name]]` (`[["Name"]]`). Plain text is no link; undefined without a link.
 */
export function linkValue(value: unknown): string | undefined {
  if (typeof value === "string") return linkTarget(value);
  if (!Array.isArray(value)) return undefined;
  for (const x of value.flat(Infinity)) {
    if (typeof x !== "string") continue;
    const target = (linkTarget(x) ?? x.split(/[|#]/)[0]).trim();
    if (target) return target;
  }
  return undefined;
}

/** Does the translation link (a target as `linkValue` gives it) name the note `name`? Folder and extension of the link do not count. */
export const isTranslationOf = (target: string | undefined, name: string): boolean =>
  !!target && noteName(target) === name;
