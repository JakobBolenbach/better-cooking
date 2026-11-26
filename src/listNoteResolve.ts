// Which file the shopping list and the meal plan use (issue #76). Nothing is stored for this: the choice is made
// again at every access from the files that exist, so a language change never switches to another file and a file
// that shows up later (sync, created by hand) is taken into account at once. Only a path the user set, or the
// user's choice between two notes with entries, is stored in the settings.
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

/** Number of entries of a list note: checkbox lines on the shopping list, entries in the plan. */
export function countListEntries(kind: ListKind, text: string): number {
  return kind === "shoppingList" ? text.split(/\r?\n/).filter((l) => LINE.test(l)).length : readPlanRows(text).length;
}

/** The paths (from `paths`, as they are spelled there) that have a default name of either language, ignoring case. */
export function defaultMatches(paths: string[], kind: ListKind): string[] {
  const names = new Set((["de", "en"] as const).map((l) => defaultListPath(l, kind).toLowerCase()));
  return paths.filter((p) => names.has(p.toLowerCase()));
}

export interface ListFile {
  path: string;
  /** Entries in the note (checkbox lines, plan entries); undefined while not counted yet (not the same as 0). */
  entries?: number;
  /** Last change, to decide between notes with the same number of entries. */
  mtime: number;
}

export interface ListNoteChoice {
  path: string;
  /** Several notes have entries: all of them, the one used first. The page asks the user which one to use. */
  conflict?: ListFile[];
}

/**
 * The file of a list note. A path set by the user is used as it is. Otherwise, among the existing notes with a default
 * name of either language (`found`): the only one; the one with entries; if several have entries, the one with more
 * (the newer one on a tie), and the others are reported as a conflict (nothing is merged or deleted); if none has
 * entries, the one of the current note language. While a note is not counted yet (`entries` undefined) nothing is
 * decided by entries: the one of the current note language, no conflict. Without any note: the default of the
 * current language.
 */
export function resolveListNote(own: string, kind: ListKind, lang: NoteLang, found: ListFile[]): ListNoteChoice {
  if (own.trim()) return { path: withExtension(own) };
  if (!found.length) return { path: defaultListPath(lang, kind) };
  const mine = defaultListPath(lang, kind).toLowerCase();
  const ofLang = () => found.find((f) => f.path.toLowerCase() === mine) ?? found[0];
  if (found.length === 1) return { path: found[0].path };
  if (found.some((f) => f.entries === undefined)) return { path: ofLang().path };
  const full = found.filter((f) => f.entries! > 0).sort((a, b) => b.entries! - a.entries! || b.mtime - a.mtime);
  if (full.length > 1) return { path: full[0].path, conflict: full };
  return { path: (full[0] ?? ofLang()).path };
}

/**
 * Keeps the provisional choice in a conflict for as long as the conflict lasts, so that the page's own changes (which
 * change the number of entries) never flip it. `pinned` is the path chosen before; returns the choice to use and
 * the pin to keep (undefined without a conflict).
 */
export function pinConflict(r: ListNoteChoice, pinned: string | undefined): { choice: ListNoteChoice; pin?: string } {
  if (!r.conflict) return { choice: r };
  const keep = r.conflict.find((f) => f.path === pinned) ?? r.conflict[0];
  return {
    choice: { path: keep.path, conflict: [keep, ...r.conflict.filter((f) => f !== keep)] },
    pin: keep.path,
  };
}
