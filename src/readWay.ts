// How a recipe was read (ADR 0008, issue #155): the plugin records it in a frontmatter field when it writes a note, and
// the recipe page shows it. Pure functions, tested in tests/readWay.test.ts.
import type { Key } from "./i18n";

/**
 * The values of the field, the same in every language and note format:
 * `page` (the schema.org data of a website, read in the plugin), `rules` (the offline rules for a text or a caption),
 * `ai` (the user's own AI) and `processor` (Claude or the GitHub action).
 */
export const READ_WAYS = ["page", "rules", "ai", "processor"] as const;
export type ReadWay = (typeof READ_WAYS)[number];

/** The way from a raw field value; unknown or empty values (another tool, a typo) are no way, and the note keeps them. */
export function readWayFrom(raw: string | undefined): ReadWay | undefined {
  const v = raw?.trim().toLowerCase();
  return READ_WAYS.find((w) => w === v);
}

/**
 * The way a note was read, as far as the note says: its field, or "processor" for a note that carries a job ID
 * (`auftrag`) and neither the field nor a fingerprint (`import_hash`): every import of the plugin since 0.9 has the
 * fingerprint and no processor writes it, so such a note comes from a routine that does not write the field.
 * Undefined for older notes: better nothing than something wrong. Reading never changes a note; only writing it
 * replaces the field.
 */
export function wayOfNote(r: { importVia?: ReadWay; job?: string; importHash?: string }): ReadWay | undefined {
  return r.importVia ?? (r.job?.trim() && !r.importHash?.trim() ? "processor" : undefined);
}

const LABELS: Record<ReadWay, Key> = {
  page: "readPage",
  rules: "readRules",
  ai: "readAi",
  processor: "readProcessor",
};

/** The string key of the line on the recipe page. */
export const readWayKey = (w: ReadWay): Key => LABELS[w];
