// Import fingerprint (ADR 0006, issue #130): a short hash per imported part of a note, kept in the frontmatter field
// `import_hash`. A part whose current hash differs from the stored one was changed after the import, by hand.
//
// What is hashed: title, description, yield and times by their parsed value; ingredients, steps and tips by the
// normalised lines of their section (the first section of that kind, found by heading in either language), which is
// exactly what "Fetch again" replaces. Per line: Unicode NFC, trimmed, whitespace collapsed, list marker or step
// number and then the checkbox state removed; empty lines are dropped. Everything else counts (hints, embeds, group
// lines, free text, indented lines, comments, tables). An empty part has the hash of "", so "missing" only ever means
// "unknown". The normalisation, the hash function and the field format are stored in users' notes: changing any of
// them needs a migration (tests/fingerprintFormat.test.ts pins them).
// Pure functions without Obsidian.
import { CHECKBOX, parseRecipe } from "./parse";
import { splitNote } from "./noteText";
import type { Fields } from "./noteFormat";
import { hasOwn } from "./ownKeys";
import type { Recipe } from "./types";

const encoder = new TextEncoder();

/** FNV-1a (32 bit) over the UTF-8 bytes of `s`, in base 36. Not the hash of `recipeSig`, which stays as it was. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (const b of encoder.encode(s)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(36);
}

export type Part = "title" | "description" | "yield" | "times" | "ingredients" | "steps" | "tips";

/** Order in which the parts are written. */
export const PARTS: readonly Part[] = ["title", "description", "yield", "times", "ingredients", "steps", "tips"];

export type Hashes = Partial<Record<Part, string>>;

/** The parts that are sections of the note. */
export const LIST_PARTS = ["ingredients", "steps", "tips"] as const;
type ListPart = (typeof LIST_PARTS)[number];
/** Key of the section (as `sectionKey` names it) of each list part. */
const SECTION: Record<ListPart, string> = { ingredients: "zutaten", steps: "schritte", tips: "tipps" };

/** The section a list part lives in: the first one of its kind. The merge and the fingerprint both use this. */
export function importedSection<S extends { key: string }>(sections: S[], part: Part): S | undefined {
  return hasOwn(SECTION, part) ? sections.find((s) => s.key === SECTION[part as ListPart]) : undefined;
}

/** Unicode NFC, runs of whitespace become one space, no space at the ends. */
const norm = (s: string | undefined) => (s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();

const MARKER = /^([-*]|\d+[.)])(\s+|$)/;
const BOX = new RegExp(`^${CHECKBOX}(\\s+|$)`);

/** One line of a section without what the plugin or the user's editor may change freely. */
const sectionLine = (line: string) => norm(line.trim().replace(MARKER, "").replace(BOX, ""));

/** The normalised value of every part, empty ones as "". `recipe`: the note already read with an empty path. */
export function partValues(text: string, fields: Fields, recipe?: Recipe): Record<Part, string> {
  const r = recipe ?? parseRecipe("", text, 0, fields);
  const sections = splitNote(text).sections;
  const values: Record<Part, string> = {
    title: norm(r.title),
    description: norm(r.description),
    yield: norm(r.result),
    times: r.timeActive || r.timeTotal ? `${r.timeActive ?? ""}|${r.timeTotal ?? ""}` : "",
    ingredients: "",
    steps: "",
    tips: "",
  };
  for (const part of LIST_PARTS)
    values[part] = (importedSection(sections, part)?.lines ?? []).map(sectionLine).filter(Boolean).join("\n");
  return values;
}

/** The hash of every part; a part the note does not have is the hash of "". */
export function fingerprints(text: string, fields: Fields, recipe?: Recipe): Record<Part, string> {
  const v = partValues(text, fields, recipe);
  return Object.fromEntries(PARTS.map((p) => [p, fnv1a(v[p])])) as Record<Part, string>;
}

const VERSION = "v1";
const ENTRY = /^([a-z]+):([0-9a-z]{1,8})$/;

/** What a field holds: the hashes of the parts this version knows, and entries of parts it does not know (yet). */
export interface Stored {
  hashes: Hashes;
  /** Well-formed entries of unknown parts, `name:hash`, written back unchanged. */
  extra: string[];
  /** A value of a version this code does not know: never overwritten, its parts count as unknown. */
  foreign: boolean;
}

/**
 * The field value, `"v1;title:1k2j;ingredients:9xq3"`: one quoted string without spaces, so no YAML writer folds it.
 * New parts can be added without a new version (older code carries them along); a new version is for a change of
 * meaning only.
 */
export const formatHash = (fp: Hashes, extra: string[] = []): string =>
  JSON.stringify(
    [VERSION, ...PARTS.filter((p) => fp[p] !== undefined).map((p) => `${p}:${fp[p]}`), ...extra].join(";"),
  );

/**
 * Reads the field value (quotes optional). A broken or folded value is no fingerprint (`hashes` empty) and may be
 * overwritten; a value of another version is `foreign`. Never throws.
 */
export function readStored(v: unknown): Stored {
  const none: Stored = { hashes: {}, extra: [], foreign: false };
  if (typeof v !== "string") return none;
  const [version, ...entries] = v
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .split(";");
  if (version !== VERSION) return { ...none, foreign: /^v\d+$/.test(version) && entries.length > 0 };
  const out: Stored = { hashes: {}, extra: [], foreign: false };
  const seen = new Set<string>();
  for (const entry of entries) {
    const m = ENTRY.exec(entry);
    if (!m || seen.has(m[1])) return none;
    seen.add(m[1]);
    const part = PARTS.find((p) => p === m[1]);
    if (part) out.hashes[part] = m[2];
    else out.extra.push(entry);
  }
  return entries.length ? out : none;
}

/** The hashes of the parts this version knows (see `readStored`). */
export const parseHash = (v: unknown): Hashes => readStored(v).hashes;

/** The stored fingerprint of a read note (the one place that reads it). */
export const storedField = (r: { importHash?: string }): Stored => readStored(r.importHash);
export const storedHashes = (r: { importHash?: string }): Hashes => storedField(r).hashes;

/** Parts that were stored and whose current value hashes differently: changed after the import. */
export function editedParts(text: string, fields: Fields, stored: Hashes, recipe?: Recipe): Part[] {
  if (!Object.keys(stored).length) return [];
  const now = fingerprints(text, fields, recipe);
  return PARTS.filter((p) => stored[p] !== undefined && now[p] !== stored[p]);
}
