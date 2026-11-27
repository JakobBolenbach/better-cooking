// "Delete recipe" (issue #119): which files and meal plan entries belong to a recipe and go with it. Pure functions
// without Obsidian (tests/deletePlan.test.ts); src/deleteService.ts reads the vault and does the deleting, the preview
// (dev/previewDelete.ts) asks the same `planDelete`. The rules are cautious: an image is only taken if it lies in
// `Bilder/` (or below it) of the recipe folder and no kept note or canvas links to it; a backup only if it lies in
// `Vorversionen/` and belongs to this recipe; a link counts only as a link ([[…]]), plain text is no link.

import { noteName, linkTarget } from "./parse";
import { readPlanRows, type PlanRow } from "./mealPlan";
import { BACKUP_FOLDER, IMAGE_FOLDER, joinPath } from "./folder";

/** The recipe note a delete is about. */
export interface NoteRef {
  path: string;
  /** File name without .md. */
  name: string;
}

/** Where a link of a note leads, as Obsidian resolves it (`getFirstLinkpathDest`); undefined if it leads nowhere. */
export type Resolve = (target: string, from: string) => string | undefined;

/** Does the link in `link` (a frontmatter value of the note at `from`) point to the recipe? Resolution decides; a link that leads nowhere is compared by name. */
function pointsTo(link: string | undefined, from: string, recipe: NoteRef, resolve?: Resolve): boolean {
  const target = linkTarget(link);
  if (!target) return false;
  const to = resolve?.(target, from);
  return to !== undefined ? to === recipe.path : noteName(target) === recipe.name;
}

/**
 * Notes of the recipe's older versions. A backup carries a link to the recipe in the field `vorversion` /
 * `previous_version` (`link`, the frontmatter value); if it has one, the link decides, otherwise the exact name
 * prefix `<name> (Vorversion ` does. Only files directly in `<folder>/Vorversionen/` count.
 */
export function backupsOf(
  recipe: NoteRef,
  files: { path: string; link?: string }[],
  folder: string,
  resolve?: Resolve,
): string[] {
  const dir = `${joinPath(folder, BACKUP_FOLDER)}/`;
  return files
    .filter((f) => {
      if (!f.path.startsWith(dir) || f.path.slice(dir.length).includes("/") || !/\.md$/i.test(f.path)) return false;
      if (f.link) return pointsTo(f.link, f.path, recipe, resolve);
      return noteName(f.path).startsWith(`${recipe.name} (Vorversion `);
    })
    .map((f) => f.path)
    .sort();
}

/** Notes (other than the recipe itself) whose translation link (`link`, the frontmatter value) points to the recipe. */
export function translationsOf(recipe: NoteRef, notes: { path: string; link?: string }[], resolve?: Resolve): string[] {
  return notes
    .filter((n) => n.path !== recipe.path && pointsTo(n.link, n.path, recipe, resolve))
    .map((n) => n.path)
    .sort();
}

/** The files a `.canvas` note points to (nodes of type file), as a link count per path like `resolvedLinks`; undefined if the text is no canvas. */
export function canvasLinks(text: string): Record<string, number> | undefined {
  try {
    const nodes = (JSON.parse(text) as { nodes?: unknown }).nodes;
    const out: Record<string, number> = {};
    for (const n of Array.isArray(nodes) ? nodes : []) {
      const file = (n as { file?: unknown } | null)?.file;
      if (typeof file === "string") out[file] = (out[file] ?? 0) + 1;
    }
    return out;
  } catch {
    return undefined;
  }
}

/**
 * Images that go with the notes in `going` (the recipe, its translations that go, its backups): files in
 * `<folder>/Bilder/` that these notes link to and that no other note links to. `resolved` is Obsidian's
 * `metadataCache.resolvedLinks` (note path → linked path → count), with the canvases added.
 */
export function orphanedImages(
  going: string[],
  resolved: Record<string, Record<string, number>>,
  folder: string,
): string[] {
  const dir = `${joinPath(folder, IMAGE_FOLDER)}/`;
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
 * Does a link of the plan note point to one of the notes? `resolve` is Obsidian's link resolution (target → path of
 * the file it leads to, undefined if none): when it answers, it decides; without an answer the link text has to be the
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

/** What the dialog of "Delete recipe" shows (src/deleteService.ts, src/ui/deleteModal.tsx). */
export interface DeletePreview {
  ok: true;
  title: string;
  /** File names of the images that go. */
  images: string[];
  /** The images stay because the links of the vault are not safe to read yet (still indexing, or a canvas that cannot be read). */
  imagesKept: boolean;
  backups: number;
  /** Every translation of the recipe; whether they go is the user's choice. */
  translations: { path: string; title: string; language?: string }[];
  /** The plan entries that go, by day (today on), as the names of the linked notes. */
  plan: { date: string; titles: string[] }[];
  /** What was shown, as the paths of the files that go after the note and the link texts of the plan entries: `run` deletes only these. */
  shown: Shown;
}

export interface Shown {
  files: string[];
  targets: string[];
}

/** What a delete would take; everything the service and the preview need to show it and to do it. */
export interface DeleteScan {
  /** Every translation (path), also when they stay. */
  allTranslations: string[];
  translations: string[];
  backups: string[];
  images: string[];
  imagesKept: boolean;
  rows: PlanRow[];
  /** The link texts of `rows`. */
  targets: string[];
}

export interface DeleteInput {
  recipe: NoteRef;
  withTranslations: boolean;
  folder: string;
  /** Today as YYYY-MM-DD: entries from this day on go. */
  today: string;
  /** Recipe notes of the folder (not the list notes) with their translation link, as in the frontmatter. */
  recipes: { path: string; name: string; link?: string }[];
  /** Notes of `Vorversionen/` with their link to the recipe, as in the frontmatter. */
  versions: { path: string; link?: string }[];
  resolve?: Resolve;
  resolvedLinks: Record<string, Record<string, number>>;
  /** The links of the vault can be trusted (indexed; canvases read): without it no image is taken. */
  linksSure: boolean;
  planText: string;
  planResolve?: (target: string) => string | undefined;
}

export function planDelete(i: DeleteInput): DeleteScan {
  const allTranslations = translationsOf(i.recipe, i.recipes, i.resolve);
  const translations = i.withTranslations ? allTranslations : [];
  const going = [i.recipe, ...translations.map((p) => i.recipes.find((r) => r.path === p)!)];
  const backups = [...new Set(going.flatMap((n) => backupsOf(n, i.versions, i.folder, i.resolve)))].sort();
  const images = i.linksSure
    ? orphanedImages([...going.map((n) => n.path), ...backups], i.resolvedLinks, i.folder)
    : [];
  const matches = planLinkMatcher(going, i.planResolve);
  const rows = futurePlanEntries(i.planText, i.today, matches);
  return {
    allTranslations,
    translations,
    backups,
    images,
    imagesKept: !i.linksSure,
    rows,
    targets: [...new Set(rows.map((r) => r.target))],
  };
}
