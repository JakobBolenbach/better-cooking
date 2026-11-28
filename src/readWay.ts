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
 * (`auftrag`) and no field (the routine of Claude or GitHub does not have to write one); undefined for older notes.
 */
export function wayOfNote(r: { importVia?: ReadWay; job?: string }): ReadWay | undefined {
  return r.importVia ?? (r.job?.trim() ? "processor" : undefined);
}

const LABELS: Record<ReadWay, Key> = {
  page: "readPage",
  rules: "readRules",
  ai: "readAi",
  processor: "readProcessor",
};

/** The string key of the line on the recipe page. */
export const readWayKey = (w: ReadWay): Key => LABELS[w];
