// The backup note of "Fetch again" and the remembered cover addresses (issue #63). Pure functions without Obsidian,
// tested in tests/refetch.test.ts; split from src/refetch.ts, which re-exports them.
import { joinNote, splitNote } from "./noteText";
import { keyFor, type NoteFormat } from "./noteFormat";
import { readFrontmatter } from "./parse";

/** Name of the backup note of the old version (without extension), in the subfolder `Vorversionen`. */
export const backupName = (name: string, today: string) => `${backupPrefix(name)}${today})`;

/** What every backup name of the recipe `name` starts with. */
export const backupPrefix = (name: string) => `${name} (Vorversion `;

/**
 * The text of the backup note: the old note, except that the job ID is removed (so no open job can be matched to
 * the backup) and a field marks it as an old version (`vorversion` / `previous_version`, a link to the recipe).
 * This is the one documented exception to "unchanged"; the recipe folder's subfolders are not read as recipes.
 */
export function backupText(oldText: string, recipeName: string, format: NoteFormat): string {
  const eol = oldText.includes("\r\n") ? "\r\n" : "\n";
  const { fm, head, sections } = splitNote(oldText);
  if (!fm) return oldText;
  const parsed = readFrontmatter(oldText).fm;
  const jobKey = keyFor(parsed, format.fields, "job");
  const marker = `${format.lang === "de" ? "vorversion" : "previous_version"}: ${JSON.stringify(`[[${recipeName}]]`)}`;
  const lines = fm.filter((l) => !new RegExp(`^${jobKey}:`).test(l));
  const at = lines.findIndex((l) => /^(erstellt|created):/.test(l));
  lines.splice(at < 0 ? lines.length : at, 0, marker);
  return joinNote(lines, head, sections, eol);
}

// ------------------------------------------------------------------ Remembered cover addresses

/** The remembered cover address follows its note when it is renamed (`to`) or goes with it when it is deleted. */
export function moveCover(map: Record<string, string>, from: string, to?: string): Record<string, string> {
  if (!(from in map)) return map;
  const { [from]: url, ...rest } = map;
  return to ? { ...rest, [to]: url } : rest;
}

/** Addresses of notes that no longer exist are dropped. */
export function pruneCovers(map: Record<string, string>, exists: (path: string) => boolean): Record<string, string> {
  return Object.fromEntries(Object.entries(map).filter(([path]) => exists(path)));
}
