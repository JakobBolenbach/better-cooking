// Improvement proposals (ADR 0007, issue #132): a processor never rewrites a note. For a job with `verbessern` it
// writes one file Verbesserungen/<job id>.md, a full recipe note, and the plugin merges it into the note that carries
// the job ID, with the rules of "Fetch again" (ADR 0006), so hand edits survive. Pure rules without Obsidian, tested in
// tests/improve.test.ts; the part that talks to Obsidian is src/improveService.ts.
import { checkImportedNote, type Finding } from "./importCheck";
import { failureReason, isFailureNote } from "./importFailure";
import { storedField } from "./fingerprint";
import { IMAGE_FOLDER, IMPROVE_FOLDER, joinPath } from "./folder";
import { isJobId } from "./processor";
import { yamlString } from "./recipeNote";
import {
  importStateFrom,
  importValue,
  keyFor,
  readField,
  type Fields,
  type ImportState,
  type NoteFormat,
} from "./noteFormat";
import { joinNote, setValue, splitNote, type Section } from "./noteText";
import { parseRecipe, readFrontmatter } from "./parse";
import type { SchemaRecipe } from "./schemaorg";
import type { Job, Recipe } from "./types";

/** Subfolder of the recipe folder the proposals arrive in (like Vorversionen/ it is no part of the recipe list). */
export const IMPROVE_DIR = IMPROVE_FOLDER;

/** Is the path a proposal: a Markdown file directly in `<folder>/Verbesserungen/`? */
export function isProposalPath(path: string, folder: string): boolean {
  if (!path.toLowerCase().endsWith(".md")) return false;
  const dir = joinPath(folder, IMPROVE_DIR);
  const cut = path.lastIndexOf("/");
  return (cut < 0 ? "" : path.slice(0, cut)) === dir;
}

/** The job ID in the file name of a proposal (`Verbesserungen/<job id>.md`). */
export const proposalJobId = (path: string): string => (path.split("/").pop() ?? path).replace(/\.md$/i, "");

/**
 * A proposal that waits in the import area: "orphan" (no note for it, or a failed one that has no note to report to)
 * can be saved as a recipe or discarded; "invalid" (file name and job ID do not match, or no valid job ID) can only be
 * discarded, and nothing else is touched.
 */
export interface Orphan {
  path: string;
  job: string;
  title: string;
  kind: "orphan" | "invalid";
}

/** What a proposal says. `state` is what the processor reports; "offen" has no meaning in a proposal and is read as "teilweise". */
export interface Proposal {
  /** Job ID: the file name, which must also be the `auftrag` of the note and have the form `newJobId` makes. */
  job: string;
  /** False: the file name is no job ID, or `auftrag` differs from it. Such a file is never acted on (H1, ADR 0007). */
  valid: boolean;
  state: Exclude<ImportState, "offen">;
  /** The note as the plugin's parser reads it (the path is empty, the title never the file name). */
  recipe: Recipe;
  /** One line, only for "teilweise" and "fehler". */
  error?: string;
  /** Content that does not belong into a recipe (src/importCheck.ts); a proposal with findings is never applied alone. */
  findings: Finding[];
}

/** Reads the text of a proposal file. Everything in it is untrusted: it is only ever used through `schemaFromRecipe`. */
export function readProposal(text: string, fields: Fields, path = ""): Proposal {
  const recipe = parseRecipe("", text, 0, fields);
  const job = proposalJobId(path);
  const valid = isJobId(job) && recipe.job?.trim() === job;
  const given = importStateFrom(readField(readFrontmatter(text).fm, fields, "importState"));
  const complete = recipe.ingredients.length > 0 && recipe.steps.length > 0;
  const state: Proposal["state"] =
    given === "fehler" ? "fehler" : given === "teilweise" ? "teilweise" : complete ? "fertig" : "teilweise";
  const error = failureReason(recipe);
  return {
    job,
    valid,
    state,
    recipe,
    ...(state !== "fertig" && error ? { error } : {}),
    findings: checkImportedNote(text),
  };
}

/**
 * The proposal as data for the plugin's own note builder (`recipeNote`): the merge writes it from there, so every
 * line is defused like an import (no Templater, links, embeds, HTML; src/recipeNote.ts) whatever the file contained.
 * Source, images and the fingerprint are not taken: they belong to the note or are set by the merge.
 */
export function schemaFromRecipe(r: Recipe): SchemaRecipe {
  const groups = r.ingredients.filter((g) => g.ingredients.length);
  return {
    title: r.title.trim() || "Rezept",
    description: r.description,
    author: r.author,
    category: r.category,
    result: r.result,
    timeActive: r.timeActive,
    timeTotal: r.timeTotal,
    ingredients: groups.flatMap((g) => g.ingredients),
    ...(groups.some((g) => g.title) ? { ingredientGroups: groups } : {}),
    steps: r.steps.map((s) => ({ ...(s.title ? { title: s.title } : {}), text: s.text })),
    ...(r.tips.length ? { tips: r.tips } : {}),
    images: [],
  };
}

/**
 * The note an improvement job belongs to: a note that carries the job ID (never a failure note). Only for a job that
 * is known as an improvement job (`known`), or for a note that still says "offen": any other note with the ID of a
 * proposal is not touched (a proposal named after a note's job ID must not rewrite a finished recipe). More than one
 * note (a routine that does not know `verbessern` imports normally and writes a second note with the same job ID):
 * the one with `import: offen` is the target, otherwise the first by path; the other stays a normal recipe.
 */
export function targetOf<R extends { job?: string; path: string; importState?: string }>(
  jobId: string,
  recipes: readonly R[],
  known = false,
): R | undefined {
  const same = recipes
    .filter((r) => r.job?.trim() === jobId && !isFailureNote(r as never))
    .sort((a, b) => a.path.localeCompare(b.path));
  return same.find((r) => r.importState === "offen") ?? (known ? same[0] : undefined);
}

/**
 * Is the note's fingerprint (ADR 0006) one this version can compare? Without one, or with one of another version,
 * nothing says which parts the user edited, so a merge must ask first.
 */
export const fingerprintKnown = (r: { importHash?: string }): boolean => {
  const s = storedField(r);
  return !s.foreign && Object.keys(s.hashes).length > 0;
};

/** Did this device start the improvement job? Only an improvement job counts (a normal job has nothing to apply). */
export const startedHere = (job: Pick<Job, "device" | "improve"> | undefined, device: string | null): boolean =>
  !!device && job?.improve === true && !!job.device && job.device === device;

export type ImproveDecision = "apply" | "review" | "orphan" | "drop";

/**
 * What happens with a proposal that has content. "drop": the job was dropped (its note was deleted on purpose), the
 * proposal goes away quietly. "orphan": no note carries the job ID. "apply": this device started the job, no part
 * edited by hand would change and the proposal has no import-check findings. Everything else is "review": the user
 * looks at it first (also on every other device, and when the job is not known here).
 */
export function improveDecision(i: {
  job: Pick<Job, "device" | "dropped" | "improve"> | undefined;
  thisDevice: string | null;
  target: unknown;
  editedChanged: boolean;
  findings: readonly Finding[];
}): ImproveDecision {
  if (i.job?.dropped) return "drop";
  if (!i.target) return "orphan";
  const mine = startedHere(i.job, i.thisDevice);
  return mine && !i.editedChanged && !i.findings.length ? "apply" : "review";
}

// ------------------------------------------------------------------ Files of a proposal

const COVER_EXT = ["webp", "jpg", "jpeg", "png", "avif", "gif"];

/** Where a processor puts the images of a proposal (contract): the paths to look at, nothing the file links to. */
export function proposalImages(jobId: string, folder: string): { covers: string[]; timeline: string } {
  const dir = joinPath(folder, IMAGE_FOLDER);
  return {
    covers: COVER_EXT.map((e) => `${dir}/${jobId} Titelbild.${e}`),
    timeline: `${dir}/${jobId} Ablauf.svg`,
  };
}

// ------------------------------------------------------------------ Text edits

/** The word of the `## Ablauf` heading in a note language. */
export const timelineHeading = (lang: NoteFormat["lang"]) => (lang === "de" ? "Ablauf" : "Timeline");

/** The section `## Ablauf` with the SVG embed, as the note format has it (docs/recipe-format.md). */
export const timelineSection = (lang: NoteFormat["lang"], link: string): Section => ({
  heading: `## ${timelineHeading(lang)}`,
  key: "ablauf",
  lines: [`![[${link}]]`, ""],
});

/** The note with a timeline section before the first section, unless it has one. */
export function withTimeline(text: string, lang: NoteFormat["lang"], link: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const { fm, head, sections } = splitNote(text);
  if (sections.some((s) => s.key === "ablauf")) return text;
  return joinNote(fm, head, [timelineSection(lang, link), ...sections], eol);
}

/** The note with another import state and error line (same line ending), or null if it has no frontmatter. */
export function withImportState(text: string, format: NoteFormat, state: ImportState, error?: string): string | null {
  const { fm, head, sections } = splitNote(text);
  if (!fm) return null;
  const parsed = readFrontmatter(text).fm;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const out = setValue(fm, keyFor(parsed, format.fields, "importState"), importValue(format, state));
  const errorKey = keyFor(parsed, format.fields, "importError");
  const lines = error
    ? setValue(out, errorKey, yamlString(error))
    : errorKey in parsed
      ? setValue(out, errorKey, '""')
      : out;
  return joinNote(lines, head, sections, eol);
}

/**
 * The note after a failed improvement: import state "teilweise" and the reason as `import_fehler`, but only if the
 * note still carries exactly this job ID and says "offen" (compare-and-set); null otherwise.
 */
export function markImproveFailed(text: string, jobId: string, reason: string, format: NoteFormat): string | null {
  const parsed = readFrontmatter(text).fm;
  const job = readField(parsed, format.fields, "job");
  if (typeof job !== "string" || job.trim() !== jobId) return null;
  if (importStateFrom(readField(parsed, format.fields, "importState")) !== "offen") return null;
  return withImportState(text, format, "teilweise", reason);
}

/** A source address that a note may carry: http(s) only. */
export const safeSource = (s: string | undefined): string | undefined =>
  s && /^https?:\/\/\S+$/i.test(s) ? s : undefined;

/**
 * The job ID in the name of an image a processor wrote for a proposal (`Bilder/<job id> Titelbild.webp`,
 * `Bilder/<job id> Ablauf.svg`), only for an exactly matching name with a valid job ID; undefined for every other file.
 */
export function proposalImageJob(path: string, folder: string): string | undefined {
  const dir = joinPath(folder, IMAGE_FOLDER);
  if (!path.startsWith(`${dir}/`)) return undefined;
  const m = /^(rz-[0-9a-z]+-[0-9a-z]{4}) (?:Titelbild\.(?:webp|jpg|jpeg|png|avif|gif)|Ablauf\.svg)$/.exec(
    path.slice(dir.length + 1),
  );
  return m && isJobId(m[1]) ? m[1] : undefined;
}

/**
 * The jobs after the note of an improvement job was deleted on purpose (#119): that job is marked `dropped`, so a
 * proposal that arrives later is dropped quietly, no card shows it and the sync stops waiting for it. The same array
 * if no open improvement job has this ID.
 */
export function dropImprovement(jobs: Job[], jobId: string): Job[] {
  if (!jobs.some((j) => j.id === jobId && j.improve && !j.dropped)) return jobs;
  return jobs.map((j) => (j.id === jobId ? { ...j, dropped: true as const } : j));
}

/**
 * What the page shows for recipes: "ready" or "waiting" where a proposal waits (`review`, `waiting`), and a first version
 * that says "offen" without an open improvement job (`open`) as "teilweise" with `reason`: no one improves it any more.
 */
export function markRecipes<R extends { job?: string; importState?: string; importError?: string }>(
  recipes: R[],
  o: { review: (job: string) => boolean; waiting: (job: string) => boolean; open: ReadonlySet<string>; reason: string },
): (R & { improvement?: "ready" | "waiting" })[] {
  return recipes.map((r) => {
    let out: R & { improvement?: "ready" | "waiting" } = r;
    if (r.job && o.review(r.job)) out = { ...out, improvement: o.waiting(r.job) ? "waiting" : "ready" };
    if (r.importState === "offen" && !(r.job && o.open.has(r.job)))
      out = { ...out, importState: "teilweise", importError: r.importError ?? o.reason };
    return out;
  });
}
