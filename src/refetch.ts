// "Fetch again" (issue #63): merges a freshly read recipe into an existing note. The imported parts (title,
// description, yield, times, ingredients, steps, tips, cover image, import state) are replaced; status, rating,
// last made, attempts, own notes and sections, extra properties, own header lines and everything unknown stay as they
// were. Pure functions without Obsidian, tested in tests/refetch.test.ts. The Obsidian side (loading, writing,
// backup) lives in src/refetchService.ts.
import type { SchemaRecipe } from "./schemaorg";
import { keyFactsLine, recipeNote } from "./recipeNote";
import { parseRecipe, readFrontmatter } from "./parse";
import { joinNote, readHead, rawValue, setValue, splitNote, type Section } from "./noteText";
import { FIELD_PRESETS, keyFor, type FieldId, type NoteFormat, type NoteLang } from "./noteFormat";
import { detectSource } from "./source";
import type { Key } from "./i18n";
import {
  LIST_PARTS,
  PARTS,
  editedParts,
  importedSection,
  fingerprints,
  formatHash,
  partValues,
  storedField,
  storedHashes,
  type Hashes,
  type Part,
} from "./fingerprint";
import type { Recipe } from "./types";

export type ChangePart = "title" | "description" | "yield" | "times" | "ingredients" | "steps" | "tips" | "image";

export interface Change {
  part: ChangePart;
  /** Counts for lists (ingredients, steps, tips): old and new number of entries. */
  from?: number;
  to?: number;
}

/** Result of reading the source again, before anything is written. */
export type Preview =
  | { ok: true; changes: Change[]; via: "page" | "ai"; edited: Part[] }
  /** `canUseAi`: the page has no recipe data, but the own AI could read it (only on the user's click). */
  | { ok: false; message: string; canUseAi?: boolean };

export interface RefetchOptions {
  format: NoteFormat;
  /** Link target of the cover image to write (a new one); undefined: leave the image as it is. */
  image?: string;
  today: string;
  /** Parts edited by hand (ADR 0006) that the user wants replaced anyway; the other edited parts are kept. */
  replace: Part[];
}

/** What `updatedNote` is given: the parts to keep, as `planRefetch` worked them out (never `replace`). */
type Base = Omit<RefetchOptions, "replace">;
type UpdateOptions = Base & { keep?: Part[] };

/** "Fetch again" is for imported notes from a recipe page; otherwise the reason (a string key). */
export function canRefetch(
  r: Pick<Recipe, "source" | "importState" | "job" | "translationOf">,
): { ok: true } | { ok: false; reason: Key } {
  if (!r.source) return { ok: false, reason: "refetchNoSource" };
  if (r.translationOf) return { ok: false, reason: "refetchTranslation" };
  if (detectSource(r.source).kind !== "webseite") return { ok: false, reason: "refetchPagesOnly" };
  if (!r.importState && !r.job) return { ok: false, reason: "refetchNotImported" };
  return { ok: true };
}

/** Does the page offer another cover image than the note has? Unknown earlier address: only if the note has none. */
export function coverChanged(old: Pick<Recipe, "image">, remembered: string | undefined, coverUrl?: string): boolean {
  if (!coverUrl) return false;
  return !old.image || (remembered !== undefined && remembered !== coverUrl);
}

/** recipeFromSchema's title when the source has none: never written over a real title. */
const NO_TITLE = "Rezept";

// ------------------------------------------------------------------ What is replaced

/**
 * The one decision which parts "Fetch again" really replaces: the ones the source gave (not the placeholder title
 * "Rezept", not a source without steps …) minus the parts to keep. The merge and the fingerprint both use it.
 */
export function replacedParts(fresh: SchemaRecipe, keep: readonly Part[] = []): Set<Part> {
  const given: Record<Part, boolean> = {
    title: fresh.title.trim() !== "" && fresh.title !== NO_TITLE,
    description: !!fresh.description,
    yield: !!fresh.result,
    times: fresh.timeActive !== undefined || fresh.timeTotal !== undefined,
    ingredients: fresh.ingredients.length > 0,
    steps: fresh.steps.length > 0,
    tips: !!fresh.tips?.length,
  };
  return new Set(PARTS.filter((p) => given[p] && !keep.includes(p)));
}

// ------------------------------------------------------------------ Frontmatter

const isEmptyValue = (v: string | undefined) => v === undefined || v.trim() === "" || v.trim() === '""';
const emptyIn = (fm: Record<string, string | string[]>, key: string) => {
  const v = fm[key];
  return v === undefined || (typeof v === "string" ? !v.trim() : v.length === 0);
};

/**
 * The imported frontmatter fields: yield, times and image are replaced when the source has a value; category and
 * author are only filled when the note has none and never into a field the user gave an own name;
 * import state and error only when the note carries them; `updated` always.
 */
function mergeFrontmatter(
  oldFm: string[],
  oldParsed: Record<string, string | string[]>,
  freshFm: string[],
  o: Base,
  replaced: Set<Part>,
): string[] {
  const f = o.format.fields;
  const take = (fm: string[], id: FieldId, how: "replace" | "fill" | "present" | "always"): string[] => {
    const key = keyFor(oldParsed, f, id);
    const value = rawValue(freshFm, f[id]);
    if (value === undefined) return fm;
    // Own field names ("category: tags") are never written: the user's field, the user's content.
    const own = key !== FIELD_PRESETS.de[id] && key !== FIELD_PRESETS.en[id];
    if (how === "fill") return !own && emptyIn(oldParsed, key) && !isEmptyValue(value) ? setValue(fm, key, value) : fm;
    if (how === "present") return key in oldParsed ? setValue(fm, key, value) : fm;
    if (how === "replace" && isEmptyValue(value)) return fm;
    return setValue(fm, key, value);
  };
  let fm = oldFm;
  for (const id of ["yield", "timeActive", "timeTotal"] as const)
    if (replaced.has(id === "yield" ? "yield" : "times")) fm = take(fm, id, "replace");
  if (o.image !== undefined) fm = take(fm, "image", "replace");
  for (const id of ["category", "author"] as const) fm = take(fm, id, "fill");
  for (const id of ["importState", "importError"] as const) fm = take(fm, id, "present");
  return take(fm, "updated", "always");
}

// ------------------------------------------------------------------ Header

/**
 * Header line by line: a real new title, description and cover embed replace the old lines; yield and times are
 * written from the merged frontmatter; the source line and lines the user added stay.
 */
function mergeHead(
  oldHead: string[],
  freshHead: string[],
  o: Base,
  replaced: Set<Part>,
  values: { result?: string; timeActive?: number; timeTotal?: number },
): string[] {
  const old = readHead(oldHead);
  const next = readHead(freshHead);
  // A title the user deleted stays deleted when the edit is kept.
  const title = replaced.has("title") ? (next.title ?? old.title) : old.title;
  const image = o.image !== undefined ? `![[${o.image}]]` : old.image;
  const description = replaced.has("description") && next.description.length ? next.description : old.description;
  const lang: NoteLang = /^\*\*(Yield|Servings|Active|Total)/.test(old.facts ?? "")
    ? "en"
    : /^\*\*/.test(old.facts ?? "")
      ? "de"
      : o.format.lang;
  // The key facts line is written again only when yield or times were replaced; otherwise it stays as it is.
  const facts = replaced.has("yield") || replaced.has("times") ? (keyFactsLine(values, lang) ?? old.facts) : old.facts;
  const blocks = [[title], [image], description, [facts], [old.source], old.other].map((b) =>
    b.filter((l): l is string => !!l),
  );
  return [...blocks.filter((b) => b.length).flatMap((b) => [...b, ""])];
}

// ------------------------------------------------------------------ The note

/** The note as it becomes after "Fetch again": the old note with the imported parts of `fresh` put in. */
export function updatedNote(oldText: string, fresh: SchemaRecipe, o: UpdateOptions): string {
  const replaced = replacedParts(fresh, o.keep);
  const f = o.format;
  const eol = oldText.includes("\r\n") ? "\r\n" : "\n";
  const old = splitNote(oldText);
  const oldParsed = old.fm ? readFrontmatter(oldText).fm : {};
  const source = old.fm ? rawValue(old.fm, keyFor(oldParsed, f.fields, "source")) : undefined;
  const oldRecipe = parseRecipe("", oldText, 0, f.fields);
  const freshText = recipeNote(fresh, {
    source: source?.replace(/^"|"$/g, ""),
    image: o.image ?? oldRecipe.image,
    today: o.today,
    format: f,
  });
  const next = splitNote(freshText);

  const fm = old.fm && next.fm ? mergeFrontmatter(old.fm, oldParsed, next.fm, o, replaced) : old.fm;
  const merged = fm ? parseRecipe("", ["---", ...fm, "---"].join("\n"), 0, f.fields) : undefined;
  const head = mergeHead(old.head, next.head, o, replaced, {
    result: merged?.result ?? fresh.result,
    timeActive: merged?.timeActive ?? fresh.timeActive,
    timeTotal: merged?.timeTotal ?? fresh.timeTotal,
  });

  // Only the first section of a kind is replaced; a second one with the same name stays as the user wrote it.
  const kept = old.sections.map((s) => ({ ...s }));
  const missing: Section[] = [];
  for (const part of LIST_PARTS) {
    const n = replaced.has(part) ? importedSection(next.sections, part) : undefined;
    if (!n) continue;
    const target = importedSection(kept, part);
    if (target) target.lines = n.lines;
    else missing.push(n);
  }
  // Imported sections the note did not have yet go in before attempts and notes.
  const at = kept.findIndex((s) => s.key === "versuche" || s.key === "notizen");
  kept.splice(at < 0 ? kept.length : at, 0, ...missing);

  const written = joinNote(fm, head, kept, eol);
  const stored = storedField(oldRecipe);
  if (!fm || stored.foreign) return written;
  // The fingerprints (ADR 0006): the parts this run really replaced, hashed as the note has them now. The others keep
  // what was stored, so a kept hand edit is still found next time, unless its value now equals the source's (then
  // it is no edit any more). Entries of parts this version does not know are written back unchanged.
  const hashes: Hashes = { ...stored.hashes };
  const now = fingerprints(written, f.fields);
  const given = fingerprints(freshText, f.fields);
  for (const p of replaced) hashes[p] = now[p];
  for (const p of o.keep ?? []) if (hashes[p] !== undefined && given[p] === now[p]) hashes[p] = now[p];
  const field = keyFor(oldParsed, f.fields, "importHash");
  return joinNote(setValue(fm, field, formatHash(hashes, stored.extra)), head, kept, eol);
}

const count = (r: Recipe) => r.ingredients.reduce((n, g) => n + g.ingredients.length, 0);
const LISTS: Partial<Record<Part, (r: Recipe) => number>> = {
  ingredients: count,
  steps: (r) => r.steps.length,
  tips: (r) => r.tips.length,
};

/**
 * What differs between two notes, as short parts for the confirmation dialog: the same normalised values that the
 * fingerprint hashes (so a changed bullet or placeholder is no change), counts for lists as before.
 */
export function changesBetween(oldText: string, newText: string, fields: NoteFormat["fields"], old?: Recipe): Change[] {
  const ra = old ?? parseRecipe("", oldText, 0, fields);
  const rb = parseRecipe("", newText, 0, fields);
  const a = partValues(oldText, fields, ra);
  const b = partValues(newText, fields, rb);
  const out: Change[] = PARTS.filter((p) => a[p] !== b[p]).map((part) => {
    const n = LISTS[part];
    return n ? { part, from: n(ra), to: n(rb) } : { part };
  });
  if ((ra.image ?? "") !== (rb.image ?? "")) out.push({ part: "image" });
  return out;
}

/**
 * The new text of the note, what the source differs in, which parts were edited by hand since the import (`edited`;
 * none known without a stored fingerprint) and which of those are kept (`kept`: edited and not in `o.replace`).
 * Nothing to write (no changes, or only kept parts differ): the same text as before.
 */
export function planRefetch(
  oldText: string,
  fresh: SchemaRecipe,
  o: RefetchOptions,
): { text: string; changes: Change[]; edited: Part[]; kept: Part[] } {
  const { replace, ...base } = o;
  const fields = o.format.fields;
  const old = parseRecipe("", oldText, 0, fields);
  const edited = editedParts(oldText, fields, storedHashes(old), old);
  const kept = edited.filter((p) => !replace.includes(p));
  const all = updatedNote(oldText, fresh, base);
  const changes = changesBetween(oldText, all, fields, old);
  const text = kept.length ? updatedNote(oldText, fresh, { ...base, keep: kept }) : all;
  // With kept parts the note may change in nothing but its fingerprints: that alone is not written.
  const applied = kept.length ? changesBetween(oldText, text, fields, old) : changes;
  return { text: applied.length ? text : oldText, changes, edited, kept };
}

// ------------------------------------------------------------------ Backup

/** Name of the backup note of the old version (without extension), in the subfolder `Vorversionen`. */
export const backupName = (name: string, today: string) => `${name} (Vorversion ${today})`;

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
