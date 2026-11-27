// "Fetch again" (issue #63): merges a freshly read recipe into an existing note. The imported parts (title,
// description, yield, times, ingredients, steps, tips, cover image, import state) are replaced; status, rating,
// last made, attempts, own notes and sections, extra properties, own header lines and everything unknown stay as they
// were. Pure functions without Obsidian, tested in tests/refetch.test.ts. The Obsidian side (loading, writing,
// backup) lives in src/refetchService.ts.
import type { SchemaRecipe } from "./schemaorg";
import { keyFactsLine, recipeNote } from "./recipeNote";
import { parseRecipe, readFrontmatter } from "./parse";
import { joinNote, readHead, rawValue, setValue, splitNote } from "./noteText";
import { FIELD_PRESETS, keyFor, type FieldId, type NoteFormat, type NoteLang } from "./noteFormat";
import { detectSource } from "./source";
import type { Key } from "./i18n";
import { PARTS, editedParts, fingerprints, formatHash, parseHash, type Hashes, type Part } from "./fingerprint";
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
  /** Parts the user edited by hand and wants to keep: the note's value stays, only its fingerprint is brought up to date. */
  keep?: Part[];
}

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

const IMPORTED_SECTIONS = new Set(["zutaten", "schritte", "tipps"]);
/** recipeFromSchema's title when the source has none: never written over a real title. */
const NO_TITLE = "Rezept";

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
  o: RefetchOptions,
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
  const kept = (id: FieldId) => o.keep?.includes(id === "yield" ? "yield" : "times");
  for (const id of ["yield", "timeActive", "timeTotal"] as const) if (!kept(id)) fm = take(fm, id, "replace");
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
  fresh: SchemaRecipe,
  o: RefetchOptions,
  values: { result?: string; timeActive?: number; timeTotal?: number },
): string[] {
  const old = readHead(oldHead);
  const next = readHead(freshHead);
  const realTitle = fresh.title.trim() !== "" && fresh.title !== NO_TITLE;
  const title = o.keep?.includes("title")
    ? (old.title ?? next.title)
    : ((realTitle ? next.title : undefined) ?? old.title ?? next.title);
  const image = o.image !== undefined ? `![[${o.image}]]` : old.image;
  const description =
    !o.keep?.includes("description") && fresh.description && next.description.length
      ? next.description
      : old.description;
  const lang: NoteLang = /^\*\*(Yield|Servings|Active|Total)/.test(old.facts ?? "")
    ? "en"
    : /^\*\*/.test(old.facts ?? "")
      ? "de"
      : o.format.lang;
  const facts = keyFactsLine(values, lang) ?? old.facts;
  const blocks = [[title], [image], description, [facts], [old.source], old.other].map((b) =>
    b.filter((l): l is string => !!l),
  );
  return [...blocks.filter((b) => b.length).flatMap((b) => [...b, ""])];
}

// ------------------------------------------------------------------ The note

/** The note as it becomes after "Fetch again": the old note with the imported parts of `fresh` put in. */
export function updatedNote(oldText: string, fresh: SchemaRecipe, o: RefetchOptions): string {
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

  const fm = old.fm && next.fm ? mergeFrontmatter(old.fm, oldParsed, next.fm, o) : old.fm;
  const merged = fm ? parseRecipe("", ["---", ...fm, "---"].join("\n"), 0, f.fields) : undefined;
  const head = mergeHead(old.head, next.head, fresh, o, {
    result: merged?.result ?? fresh.result,
    timeActive: merged?.timeActive ?? fresh.timeActive,
    timeTotal: merged?.timeTotal ?? fresh.timeTotal,
  });

  const replace = (key: string) =>
    (key === "zutaten" && fresh.ingredients.length > 0 && !o.keep?.includes("ingredients")) ||
    (key === "schritte" && fresh.steps.length > 0 && !o.keep?.includes("steps")) ||
    (key === "tipps" && !!fresh.tips?.length && !o.keep?.includes("tips"));
  const freshSections = new Map(next.sections.map((s) => [s.key, s]));
  const done = new Set<string>();
  // Only the first section of a kind is replaced; a second one with the same name stays as the user wrote it.
  const kept = old.sections.map((s) => {
    const n = freshSections.get(s.key);
    if (!IMPORTED_SECTIONS.has(s.key) || !n || !replace(s.key) || done.has(s.key)) return s;
    done.add(s.key);
    return { ...s, lines: n.lines };
  });
  // Imported sections the note did not have yet go in before attempts and notes.
  const missing = [...IMPORTED_SECTIONS]
    .filter((k) => replace(k) && !kept.some((s) => s.key === k))
    .map((k) => freshSections.get(k)!)
    .filter(Boolean);
  const at = kept.findIndex((s) => s.key === "versuche" || s.key === "notizen");
  kept.splice(at < 0 ? kept.length : at, 0, ...missing);

  const written = joinNote(fm, head, kept, eol);
  if (!fm) return written;
  // The fingerprints (ADR 0006): what the source gave, hashed as the note has it now (replaced) or as the source had
  // it (kept), so the next reading can tell a hand edit from the import.
  const stored = parseHash(oldParsed[keyFor(oldParsed, f.fields, "importHash")]);
  const now = fingerprints(parseRecipe("", written, 0, f.fields));
  const given = fingerprints(parseRecipe("", freshText, 0, f.fields));
  const hashes: Hashes = { ...stored };
  for (const p of PARTS) if (given[p]) hashes[p] = o.keep?.includes(p) ? given[p] : (now[p] ?? given[p]);
  const field = keyFor(oldParsed, f.fields, "importHash");
  return joinNote(setValue(fm, field, formatHash(hashes)), head, kept, eol);
}

const flat = (r: Recipe) => r.ingredients.map((g) => `${g.title ?? ""}|${g.ingredients.join("|")}`).join("\n");
const stepsOf = (r: Recipe) => r.steps.map((s) => `${s.title ?? ""}|${s.text}`).join("\n");
const count = (r: Recipe) => r.ingredients.reduce((n, g) => n + g.ingredients.length, 0);

/** What differs between two readings of a note, as short parts for the confirmation dialog. */
export function changesBetween(a: Recipe, b: Recipe): Change[] {
  const out: Change[] = [];
  if (a.title !== b.title) out.push({ part: "title" });
  if ((a.description ?? "") !== (b.description ?? "")) out.push({ part: "description" });
  if ((a.result ?? "") !== (b.result ?? "")) out.push({ part: "yield" });
  if (a.timeActive !== b.timeActive || a.timeTotal !== b.timeTotal) out.push({ part: "times" });
  if (flat(a) !== flat(b)) out.push({ part: "ingredients", from: count(a), to: count(b) });
  if (stepsOf(a) !== stepsOf(b)) out.push({ part: "steps", from: a.steps.length, to: b.steps.length });
  if (a.tips.join("|") !== b.tips.join("|")) out.push({ part: "tips", from: a.tips.length, to: b.tips.length });
  if ((a.image ?? "") !== (b.image ?? "")) out.push({ part: "image" });
  return out;
}

/**
 * The new text of the note (without the parts in `o.keep`), what the source differs in, and which parts were edited
 * by hand since the import (`edited`; none known without a stored fingerprint). No changes: the same text as before.
 */
export function planRefetch(
  path: string,
  oldText: string,
  fresh: SchemaRecipe,
  o: RefetchOptions,
): { text: string; changes: Change[]; edited: Part[] } {
  const old = parseRecipe(path, oldText, 0, o.format.fields);
  const all = updatedNote(oldText, fresh, { ...o, keep: undefined });
  const changes = changesBetween(old, parseRecipe(path, all, 0, o.format.fields));
  const edited = editedParts(old, parseHash(old.importHash));
  const text = o.keep?.length ? updatedNote(oldText, fresh, o) : all;
  // With kept parts the note may change in nothing but its fingerprints: that alone is not written.
  const applied = o.keep?.length ? changesBetween(old, parseRecipe(path, text, 0, o.format.fields)) : changes;
  return { text: applied.length ? text : oldText, changes, edited };
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
