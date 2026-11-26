// "Fetch again" (issue #63): merges a freshly read recipe into an existing note. The imported parts (title,
// description, yield, times, ingredients, steps, tips, cover image, import state) are replaced; status, rating,
// last made, attempts, own notes and sections, extra properties and everything unknown stay exactly as they were.
// Pure functions without Obsidian, tested in tests/refetch.test.ts. The Obsidian side (loading, writing, backup)
// lives in src/refetchService.ts.
import type { SchemaRecipe } from "./schemaorg";
import { recipeNote } from "./recipeNote";
import { parseRecipe, readFrontmatter, sectionKey } from "./parse";
import { keyFor, type FieldId, type NoteFormat } from "./noteFormat";
import type { Recipe } from "./types";

export type ChangePart = "title" | "description" | "yield" | "times" | "ingredients" | "steps" | "tips" | "image";

export interface Change {
  part: ChangePart;
  /** Counts for lists (ingredients, steps, tips): old and new number of entries. */
  from?: number;
  to?: number;
}

/** Result of reading the source again, before anything is written. */
export type Preview = { ok: true; changes: Change[]; via: "page" | "ai" } | { ok: false; message: string };

export interface RefetchOptions {
  format: NoteFormat;
  /** Link target of the cover image to write (the old one, or a new one); undefined: leave the image as it is. */
  image?: string;
  today: string;
}

/** Frontmatter fields taken from the fresh read; empty fresh values never blank an existing one. */
const KEEP_IF_EMPTY: FieldId[] = ["category", "author", "yield", "timeActive", "timeTotal", "image"];
const ALWAYS: FieldId[] = ["importState", "importError", "updated"];

const IMPORTED_SECTIONS = new Set(["zutaten", "schritte", "tipps"]);

interface Section {
  heading: string;
  key: string;
  lines: string[];
}

function splitNote(text: string): { fm: string[] | null; head: string[]; sections: Section[] } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let fm: string[] | null = null;
  let body = lines;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) {
      fm = lines.slice(1, end);
      body = lines.slice(end + 1);
    }
  }
  const head: string[] = [];
  const sections: Section[] = [];
  let current = head;
  for (const line of body) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h && !line.startsWith("###")) {
      const s: Section = { heading: line, key: sectionKey(h[1]), lines: [] };
      sections.push(s);
      current = s.lines;
    } else current.push(line);
  }
  return { fm, head, sections };
}

/** Raw value of `key: value` in frontmatter lines. */
function rawValue(fm: string[], key: string): string | undefined {
  const m = fm.map((l) => new RegExp(`^${key}:[ \\t]*(.*)$`).exec(l)).find(Boolean);
  return m?.[1];
}

const isEmptyValue = (v: string | undefined) => v === undefined || v.trim() === "" || v.trim() === '""';

/** Sets `key: value` in the frontmatter lines; a list value under the old key is replaced as a whole. */
function setValue(fm: string[], key: string, value: string): string[] {
  const i = fm.findIndex((l) => new RegExp(`^${key}:`).test(l));
  if (i < 0) {
    const before = fm.findIndex((l) => /^(erstellt|created|aktualisiert|updated):/.test(l));
    const out = [...fm];
    out.splice(before < 0 ? out.length : before, 0, `${key}: ${value}`);
    return out;
  }
  let end = i + 1;
  while (end < fm.length && /^\s+-\s/.test(fm[end])) end++;
  return [...fm.slice(0, i), `${key}: ${value}`, ...fm.slice(end)];
}

/** The note as it becomes after "Fetch again": the old note with the imported parts of `fresh` put in. */
export function updatedNote(oldText: string, fresh: SchemaRecipe, o: RefetchOptions): string {
  const f = o.format;
  const old = splitNote(oldText);
  const oldFm = old.fm ? readFrontmatter(oldText).fm : {};
  const source = old.fm ? rawValue(old.fm, keyFor(oldFm, f.fields, "source")) : undefined;
  const sourceUrl = source ? source.replace(/^"|"$/g, "") : undefined;
  const next = splitNote(
    recipeNote(fresh, {
      source: sourceUrl,
      // Without a new image the header keeps the embed the note has.
      image: o.image ?? parseRecipe("", oldText, 0, f.fields).image,
      today: o.today,
      format: f,
    }),
  );

  let fm = old.fm;
  if (fm && next.fm) {
    for (const id of [...KEEP_IF_EMPTY, ...ALWAYS]) {
      if (id === "image" && o.image === undefined) continue;
      const value = rawValue(next.fm, f.fields[id]);
      if (value === undefined || (KEEP_IF_EMPTY.includes(id) && isEmptyValue(value))) continue;
      fm = setValue(fm, keyFor(oldFm, f.fields, id), value);
    }
  }

  const replace = (key: string) =>
    (key === "zutaten" && fresh.ingredients.length > 0) ||
    (key === "schritte" && fresh.steps.length > 0) ||
    (key === "tipps" && !!fresh.tips?.length);
  const freshSections = new Map(next.sections.map((s) => [s.key, s]));
  const kept = old.sections.map((s) => {
    const n = freshSections.get(s.key);
    return IMPORTED_SECTIONS.has(s.key) && n && replace(s.key) ? { ...s, lines: n.lines } : s;
  });
  // Imported sections the note did not have yet go in before attempts and notes.
  const missing = [...IMPORTED_SECTIONS]
    .filter((k) => replace(k) && !kept.some((s) => s.key === k))
    .map((k) => freshSections.get(k)!)
    .filter(Boolean);
  const at = kept.findIndex((s) => s.key === "versuche" || s.key === "notizen");
  kept.splice(at < 0 ? kept.length : at, 0, ...missing);

  return [...(fm ? ["---", ...fm, "---"] : []), ...next.head, ...kept.flatMap((s) => [s.heading, ...s.lines])].join(
    "\n",
  );
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

/** The new text of the note and what it changes; no changes: the same text as before. */
export function planRefetch(
  path: string,
  oldText: string,
  fresh: SchemaRecipe,
  o: RefetchOptions,
): { text: string; changes: Change[] } {
  const text = updatedNote(oldText, fresh, o);
  const changes = changesBetween(
    parseRecipe(path, oldText, 0, o.format.fields),
    parseRecipe(path, text, 0, o.format.fields),
  );
  return { text: changes.length ? text : oldText, changes };
}

/** Name of the backup note of the old version (without extension), in the subfolder `Vorversionen`. */
export const backupName = (name: string, today: string) => `${name} (Vorversion ${today})`;
