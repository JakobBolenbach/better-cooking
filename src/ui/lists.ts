// Lists of the overview: counts, categories, filter and sort, list name. Pure functions (tests/lists.test.ts).
import type { RecipeView } from "../types";
import type { List } from "./shared";
import type { IconName } from "./icons";
import { tr } from "../i18n";

export interface ListEntry {
  id: List;
  name: string;
  icon: IconName;
  count: number;
}

/** Categories of the originals (not discarded) with their number of recipes, sorted by name. */
export function categoriesOf(originals: RecipeView[]): [string, number][] {
  const m = new Map<string, number>();
  for (const r of originals)
    if (r.category && r.status !== "verworfen") m.set(r.category, (m.get(r.category) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "de"));
}

/** The fixed lists with their counts, and the number of discarded recipes. */
export function listEntries(originals: RecipeView[]): { lists: ListEntry[]; discarded: number } {
  const count = (f: (r: RecipeView) => boolean) => originals.filter(f).length;
  return {
    lists: [
      { id: "alle", name: tr("listAll"), icon: "buch", count: count((r) => r.status !== "verworfen") },
      { id: "bewaehrt", name: tr("listProven"), icon: "siegel", count: count((r) => r.status === "bewaehrt") },
      { id: "ausprobieren", name: tr("listToTry"), icon: "kolben", count: count((r) => r.status === "ausprobieren") },
      { id: "zuletzt", name: tr("listRecent"), icon: "verlauf", count: count((r) => !!r.lastMade) },
    ],
    discarded: count((r) => r.status === "verworfen"),
  };
}

const newest = (a: RecipeView, b: RecipeView) =>
  (b.created ?? "").localeCompare(a.created ?? "") || b.modified - a.modified;

/** Recipes of a list in display order. `visible` includes translations (only "proven" lists them too). */
export function inList(originals: RecipeView[], visible: RecipeView[], list: List): RecipeView[] {
  const kept = originals.filter((r) => r.status !== "verworfen");
  if (list === "bewaehrt")
    return visible
      .filter((r) => r.status === "bewaehrt")
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.title.localeCompare(b.title, "de"));
  if (list === "ausprobieren") return originals.filter((r) => r.status === "ausprobieren").sort(newest);
  if (list === "zuletzt")
    return originals.filter((r) => !!r.lastMade).sort((a, b) => (b.lastMade ?? "").localeCompare(a.lastMade ?? ""));
  if (list === "verworfen") return originals.filter((r) => r.status === "verworfen").sort(newest);
  if (list.startsWith("kat:")) return kept.filter((r) => r.category === list.slice(4)).sort(newest);
  return kept.sort(newest);
}

/** Import cards of the overview: only in "All" and "To try" and never among search results (they are no recipes). */
export function jobsFor<T>(list: List, search: string, jobs: T[]): T[] {
  return !search.trim() && (list === "alle" || list === "ausprobieren") ? jobs : [];
}

/** Name of the list for the heading. */
export function listName(list: List, lists: ListEntry[]): string {
  if (list.startsWith("kat:")) return list.slice(4);
  if (list === "verworfen") return tr("listDiscarded");
  return lists.find((l) => l.id === list)?.name ?? tr("appName");
}

/** The original and its translations (issue #10) as language choices; undefined when the original is missing. */
export function languagesOf(visible: RecipeView[], r: RecipeView): { path: string; label: string }[] | undefined {
  const original = r.translationOf ? visible.find((x) => x.name === r.translationOf) : r;
  if (!original) return undefined;
  const family = [original, ...visible.filter((x) => x.translationOf === original.name)];
  return family.map((x) => ({ path: x.path, label: x.language ?? tr("originalLanguage") }));
}
