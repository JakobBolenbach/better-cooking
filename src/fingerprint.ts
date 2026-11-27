// Import fingerprint (ADR 0006, issue #130): a short hash per imported part of a note, kept in the frontmatter field
// `import_hash`. A part whose current hash differs from the stored one was changed after the import, by hand.
// The hash covers the parsed, normalised value of a part, never the Markdown: line endings, spacing, list markers and
// German or English headings do not count. The normalisation must stay stable; changing it needs a migration.
// Pure functions without Obsidian, tested in tests/fingerprint.test.ts.
import { hasOwn } from "./ownKeys";
import type { Recipe } from "./types";

/** FNV-1a over the UTF-16 units of `s` (a character outside the BMP counts by its first unit only, as it always did), in base 36. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(36);
}

export type Part = "title" | "description" | "yield" | "times" | "ingredients" | "steps" | "tips";

/** Order in which the parts are written. */
export const PARTS: readonly Part[] = ["title", "description", "yield", "times", "ingredients", "steps", "tips"];

export type Hashes = Partial<Record<Part, string>>;

type Source = Pick<
  Recipe,
  "title" | "description" | "result" | "timeActive" | "timeTotal" | "ingredients" | "steps" | "tips"
>;

/** Runs of whitespace become one space, no space at the ends. */
const norm = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** The normalised value of every part the recipe has; empty parts are left out. */
export function partValues(r: Source): Partial<Record<Part, string>> {
  const values: Record<Part, string> = {
    title: norm(r.title),
    description: norm(r.description),
    yield: norm(r.result),
    times: r.timeActive || r.timeTotal ? `${r.timeActive ?? ""}|${r.timeTotal ?? ""}` : "",
    ingredients: r.ingredients
      .map((g) => `${norm(g.title)}|${g.ingredients.map(norm).join("|")}`)
      .join("\n")
      .replace(/^\|*$/, ""),
    steps: r.steps.map((s) => `${norm(s.title)}|${norm(s.text)}`).join("\n"),
    tips: r.tips.map(norm).join("\n"),
  };
  const out: Partial<Record<Part, string>> = {};
  for (const p of PARTS) if (values[p]) out[p] = values[p];
  return out;
}

/** The hash of every part the recipe has. */
export function fingerprints(r: Source): Hashes {
  const out: Hashes = {};
  const v = partValues(r);
  for (const p of PARTS) if (v[p] !== undefined) out[p] = fnv1a(v[p]);
  return out;
}

/** The field value: `"title=1k2j ingredients=9xq3"`, as one quoted YAML string. */
export const formatHash = (fp: Hashes): string =>
  JSON.stringify(
    PARTS.filter((p) => fp[p])
      .map((p) => `${p}=${fp[p]}`)
      .join(" "),
  );

/** Reads the field value (quotes optional). Anything broken, unknown or foreign is ignored; never throws. */
export function parseHash(v: unknown): Hashes {
  const out: Hashes = {};
  if (typeof v !== "string") return out;
  const text = v.trim().replace(/^"(.*)"$/, "$1");
  for (const pair of text.split(/\s+/)) {
    const m = /^([a-z]+)=([0-9a-z]{1,8})$/.exec(pair);
    const part = m && PARTS.find((p) => p === m[1]);
    if (part && !hasOwn(out, part)) out[part] = m[2];
  }
  return out;
}

/** Parts that were stored and whose current value hashes differently: changed after the import. */
export function editedParts(r: Source, stored: Hashes): Part[] {
  const now = fingerprints(r);
  return PARTS.filter((p) => stored[p] !== undefined && (now[p] ?? fnv1a("")) !== stored[p]);
}
