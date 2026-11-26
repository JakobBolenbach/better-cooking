// Which file the shopping list and the meal plan use (issue #76). Once a list note exists it keeps its file: a
// change of the interface or note language never switches to the default name of the other language.
// Pure functions without Obsidian, tested in tests/listNoteResolve.test.ts.
import type { NoteLang } from "./noteFormat";
import { NOTE_WORDS } from "./noteFormat";
import { LINE } from "./shopping";
import { readPlanRows } from "./mealPlan";

export type ListKind = "shoppingList" | "mealPlan";

/** Path of a name set in the settings or a default name: ".md" added, surrounding blanks removed. */
export function withExtension(name: string): string {
  const n = name.trim();
  return n.toLowerCase().endsWith(".md") ? n : `${n}.md`;
}

/** The default file name of a list note in a note language ("Wochenplan.md"). */
export const defaultListPath = (lang: NoteLang, kind: ListKind): string => withExtension(NOTE_WORDS[lang][kind]);

/** Whether a list note has content that matters: checkbox lines on the shopping list, entries in the plan. */
export function hasListEntries(kind: ListKind, text: string): boolean {
  return kind === "shoppingList" ? text.split(/\r?\n/).some((l) => LINE.test(l)) : readPlanRows(text).length > 0;
}

export interface ListNoteResolution {
  path: string;
  /** An existing note was found (or the user named one): the path should be stored in the settings. */
  keep: boolean;
  /** Both default notes have entries: the paths in the order [used, other], for a one-time hint. */
  conflict?: [string, string];
}

/**
 * The file of a list note. A path set by the user is used as it is. Otherwise a note under one of the default names
 * of both languages: if both exist, the one with entries; if both have entries, the one of the current note language
 * (and a conflict is reported, nothing is merged or deleted). Without any note: the default of the current language.
 */
export function resolveListNote(
  own: string,
  kind: ListKind,
  lang: NoteLang,
  /** The text of a note; undefined if it does not exist. */
  read: (path: string) => string | undefined,
): ListNoteResolution {
  if (own.trim()) return { path: withExtension(own), keep: true };
  const other: NoteLang = lang === "de" ? "en" : "de";
  const mine = defaultListPath(lang, kind);
  const theirs = defaultListPath(other, kind);
  const mineText = read(mine);
  const theirText = read(theirs);
  if (mineText === undefined && theirText === undefined) return { path: mine, keep: false };
  if (theirText === undefined) return { path: mine, keep: true };
  if (mineText === undefined) return { path: theirs, keep: true };
  const mineFull = hasListEntries(kind, mineText);
  const theirFull = hasListEntries(kind, theirText);
  if (mineFull && theirFull) return { path: mine, keep: true, conflict: [mine, theirs] };
  return theirFull ? { path: theirs, keep: true } : { path: mine, keep: true };
}
