// Import fingerprint (ADR 0006, issue #130): a short hash per imported part of a note, kept in the frontmatter field
// `import_hash`. A part whose current hash differs from the stored one was changed after the import, by hand.
//
// What is hashed: title, description, yield and times by their parsed value; ingredients, steps and tips by the
// normalised lines of their section (the first section of that kind, found by heading in either language), which is
// exactly what "Fetch again" replaces. Per line: trimmed, whitespace collapsed, list marker, step number and checkbox
// state removed; empty lines are dropped. Everything else counts (hints, embeds, group lines, free text, indented
// lines, comments, tables). The normalisation, the hash function and the field format are stored in users' notes:
// changing any of them needs a migration (tests/fingerprintFormat.test.ts pins them).
// Pure functions without Obsidian.
import { parseRecipe } from "./parse";
import { splitNote } from "./noteText";
import type { Fields } from "./noteFormat";
import { hasOwn } from "./ownKeys";

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

/** Section (as `sectionKey` names it) of each list part. */
const SECTION: Partial<Record<Part, string>> = { ingredients: "zutaten", steps: "schritte", tips: "tipps" };

/** Runs of whitespace become one space, no space at the ends. */
const norm = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** One line of a section without what the plugin or the user's editor may change freely. */
const sectionLine = (line: string) =>
  norm(
    line
      .trim()
      .replace(/^[-*+]\s+\[[ xX]\](\s+|$)/, "")
      .replace(/^([-*+]|\d+[.)])(\s+|$)/, ""),
  );

/** The normalised value of every part the note has; empty parts are left out. */
export function partValues(text: string, fields: Fields): Hashes {
  const r = parseRecipe("", text, 0, fields);
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
  for (const [part, key] of Object.entries(SECTION) as [Part, string][]) {
    const s = sections.find((x) => x.key === key);
    values[part] = (s?.lines ?? []).map(sectionLine).filter(Boolean).join("\n");
  }
  const out: Hashes = {};
  for (const p of PARTS) if (values[p]) out[p] = values[p];
  return out;
}

/** The hash of every part the note has. */
export function fingerprints(text: string, fields: Fields): Hashes {
  const out: Hashes = {};
  const v = partValues(text, fields);
  for (const p of PARTS) if (v[p] !== undefined) out[p] = fnv1a(v[p]);
  return out;
}

const VERSION = "v1";

/** The field value, `"v1;title:1k2j;ingredients:9xq3"`: one quoted string without spaces, so no YAML writer folds it. */
export const formatHash = (fp: Hashes): string =>
  JSON.stringify([VERSION, ...PARTS.filter((p) => fp[p]).map((p) => `${p}:${fp[p]}`)].join(";"));

/**
 * Reads the field value (quotes optional). An unknown version, a folded or otherwise broken value or anything foreign
 * gives `{}`, which means "no fingerprint": the note behaves as before the fingerprint existed. Never throws.
 */
export function parseHash(v: unknown): Hashes {
  const out: Hashes = {};
  if (typeof v !== "string") return out;
  const [version, ...pairs] = v
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .split(";");
  if (version !== VERSION || !pairs.length) return {};
  for (const pair of pairs) {
    const m = /^([a-z]+):([0-9a-z]{1,8})$/.exec(pair);
    const part = m && PARTS.find((p) => p === m[1]);
    if (!part || hasOwn(out, part)) return {};
    out[part] = m[2];
  }
  return out;
}

/** The stored fingerprint of a read note (the one place that reads it). */
export const storedHashes = (r: { importHash?: string }): Hashes => parseHash(r.importHash);

/** Parts that were stored and whose current value hashes differently: changed after the import. */
export function editedParts(text: string, fields: Fields, stored: Hashes): Part[] {
  const now = fingerprints(text, fields);
  return PARTS.filter((p) => stored[p] !== undefined && (now[p] ?? fnv1a("")) !== stored[p]);
}
