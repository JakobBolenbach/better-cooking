// "Delete recipe" (issue #119): which files and meal plan entries belong to a recipe and go with it. Pure functions
// without Obsidian (tests/deletePlan.test.ts); src/deleteService.ts reads the vault and does the deleting.
// The rules are cautious: an image is only taken if it lies in `Bilder/` of the recipe folder and no kept note links
// to it; a backup only if it lies in `Vorversionen/` and belongs to this recipe.

import { linkTarget } from "./parse";
import { readPlanRows, type PlanRow } from "./mealPlan";

/** Subfolders of the recipe folder (backups: src/refetch.ts, images: src/localImport.ts). */
export const BACKUP_FOLDER = "Vorversionen";
export const IMAGE_FOLDER = "Bilder";

/** The recipe note a delete is about. */
export interface NoteRef {
  path: string;
  /** File name without .md. */
  name: string;
}

const join = (folder: string, sub: string) => (folder ? `${folder}/${sub}/` : `${sub}/`);

/** The name of the note a link points to: no folder, no alias, no extension. */
const baseName = (target: string): string => (target.split("/").pop() ?? target).replace(/\.md$/i, "").trim();

/**
 * Notes of the recipe's older versions. A backup carries a link to the recipe in the field `vorversion` /
 * `previous_version` (`link`, the link target as read from the frontmatter); if it has one, the link decides, otherwise
 * the exact name prefix `<name> (Vorversion ` does. Only files directly in `<folder>/Vorversionen/` count.
 */
export function backupsOf(recipe: NoteRef, files: { path: string; link?: string }[], folder: string): string[] {
  const dir = join(folder, BACKUP_FOLDER);
  return files
    .filter((f) => {
      if (!f.path.startsWith(dir) || f.path.slice(dir.length).includes("/") || !/\.md$/i.test(f.path)) return false;
      if (f.link) return baseName(f.link) === recipe.name;
      return baseName(f.path).startsWith(`${recipe.name} (Vorversion `);
    })
    .map((f) => f.path)
    .sort();
}

/** Notes (other than the recipe itself) whose translation link points to the recipe. */
export function translationsOf(recipe: NoteRef, notes: { path: string; translationOf?: string }[]): string[] {
  return notes
    .filter((n) => n.path !== recipe.path && n.translationOf !== undefined && baseName(n.translationOf) === recipe.name)
    .map((n) => n.path)
    .sort();
}

/**
 * Images that go with the notes in `going` (the recipe, its translations that go, its backups): files in
 * `<folder>/Bilder/` that these notes link to and that no other note links to. `resolved` is Obsidian's
 * `metadataCache.resolvedLinks` (note path → linked path → count).
 */
export function orphanedImages(
  going: string[],
  resolved: Record<string, Record<string, number>>,
  folder: string,
): string[] {
  const dir = join(folder, IMAGE_FOLDER);
  const gone = new Set(going);
  const candidates = new Set<string>();
  for (const note of going)
    for (const target of Object.keys(resolved[note] ?? {}))
      if (target.startsWith(dir) && !/\.md$/i.test(target)) candidates.add(target);
  const kept = new Set<string>();
  for (const [note, links] of Object.entries(resolved)) {
    if (gone.has(note)) continue;
    for (const [target, n] of Object.entries(links)) if (n > 0 && candidates.has(target)) kept.add(target);
  }
  return [...candidates].filter((t) => !kept.has(t)).sort();
}

/**
 * Does a link of the plan note point to the recipe? `resolve` is Obsidian's link resolution (target → path of the
 * file it leads to, undefined if none): when it answers, it decides; without an answer the link text has to be the
 * name or the path of the note.
 */
export function planLinkMatcher(
  notes: NoteRef[],
  resolve?: (target: string) => string | undefined,
): (target: string) => boolean {
  return (target) => {
    const t = target.trim();
    const to = resolve?.(t);
    if (to !== undefined) return notes.some((n) => n.path === to);
    return notes.some((n) => t === n.name || t === n.path.replace(/\.md$/i, "") || t === n.path);
  };
}

/** The entries of the plan from `from` on (today counts) whose link matches. */
export function futurePlanEntries(planText: string, from: string, matches: (target: string) => boolean): PlanRow[] {
  return readPlanRows(planText).filter((r) => r.date >= from && matches(r.target));
}

/** The entries by day, in date order: the link targets as written. */
export function entriesByDay(rows: PlanRow[]): { date: string; targets: string[] }[] {
  const days = new Map<string, string[]>();
  for (const r of rows) days.set(r.date, [...(days.get(r.date) ?? []), r.target]);
  return [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, targets]) => ({ date, targets }));
}

/** Link target as read from a frontmatter value (`[[Name]]`, `[[Name|alias]]`, or the plain text). */
export const linkOf = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? (linkTarget(value) ?? value.trim()) : undefined;

/** What the dialog of "Delete recipe" shows (src/deleteService.ts, src/ui/deleteModal.tsx). */
export interface DeletePreview {
  ok: true;
  title: string;
  /** File names of the images that go. */
  images: string[];
  backups: number;
  /** Every translation of the recipe; whether they go is the user's choice. */
  translations: { path: string; title: string; language?: string }[];
  /** The plan entries that go, by day (today on), as the names of the linked notes. */
  plan: { date: string; titles: string[] }[];
}
