// Improvement proposals (ADR 0007, issue #132): a processor never rewrites a note. For a job with `verbessern` it
// writes one file Verbesserungen/<job id>.md, a full recipe note, and the plugin merges it into the note that carries
// the job ID, with the rules of "Fetch again" (ADR 0006), so hand edits survive. Pure rules without Obsidian, tested in
// tests/improve.test.ts; the part that talks to Obsidian is src/improveService.ts.
import { checkImportedNote, type Finding } from "./importCheck";
import { failureReason, isFailureNote } from "./importFailure";
import { storedField } from "./fingerprint";
import { IMAGE_FOLDER, IMPROVE_FOLDER, joinPath } from "./folder";
import { isJobId } from "./processor";
import { yaml } from "./recipeNote";
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

/** Is the path a proposal: a Markdown file directly in `<folder>/Verbesserungen/`? */
export function isProposalPath(path: string, folder: string): boolean {
  if (!path.toLowerCase().endsWith(".md")) return false;
  const dir = joinPath(folder, IMPROVE_FOLDER);
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

export type ImproveDecision = "apply" | "review";

/**
 * What happens with a proposal that has a note: "apply" on the device that started the job when no part edited by hand
 * would change (or the note has no fingerprint to compare, which the caller counts as a change) and the proposal has no
 * import-check findings; otherwise "review": the user looks at it first, also on every other device and when the job
 * is not known here. Orphans and dropped jobs are settled before (src/improveService.ts).
 */
export function improveDecision(i: {
  job: Pick<Job, "device" | "improve"> | undefined;
  thisDevice: string | null;
  editedChanged: boolean;
  findings: readonly Finding[];
}): ImproveDecision {
  return startedHere(i.job, i.thisDevice) && !i.editedChanged && !i.findings.length ? "apply" : "review";
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
  const lines = error ? setValue(out, errorKey, yaml(error)) : errorKey in parsed ? setValue(out, errorKey, '""') : out;
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
 * The jobs after the note of an improvement job was deleted on purpose (#119): an open improvement job of this ID is
 * marked `dropped` (a proposal that arrives later is dropped quietly, no card shows it, the sync stops waiting); one
 * that has a proposal waiting for review is removed, and its `review` is returned so the caller can delete the proposal.
 */
export function dropImprovement(jobs: Job[], jobId: string): { jobs: Job[]; review?: Job["review"] } {
  const j = jobs.find((a) => a.id === jobId && a.improve);
  if (!j) return { jobs };
  if (j.review) return { jobs: jobs.filter((a) => a !== j), review: j.review };
  return { jobs: jobs.map((a) => (a === j ? { ...a, dropped: true as const } : a)) };
}

/** The jobs with a proposal waiting for review of this job; a job that this device does not know becomes a hidden record. */
export function withReview(jobs: Job[], id: string, review: NonNullable<Job["review"]>, now: number): Job[] {
  const j = jobs.find((a) => a.id === id);
  if (j?.review && j.review.proposal === review.proposal && j.review.target === review.target) return jobs;
  if (!j) return [...jobs, { id, input: "", kind: "improve", since: now, processor: "claude", improve: true, review }];
  return jobs.map((a) => (a === j ? { ...a, review } : a));
}

/** The job whose proposal waits for review on this note (by its path), if any. */
export const reviewJobOf = (jobs: readonly Job[], targetPath: string): Job | undefined =>
  jobs.find((j) => j.review?.target === targetPath);

/** A proposal of a run that a retry replaced: some job lists its ID in `retryOf`. It is dropped without a card. */
export const replacedRun = (jobs: readonly Job[], id: string): boolean =>
  jobs.some((j) => j.retryOf?.some((o) => o.job === id));

/**
 * The note with `auftrag` changed from the old job ID to the new one (a retry starts a new run with a new ID), only if
 * it still carries the old one; null otherwise. Nothing else changes.
 */
export function rebindJob(text: string, format: NoteFormat, from: string, to: string): string | null {
  const { fm, head, sections } = splitNote(text);
  if (!fm) return null;
  const parsed = readFrontmatter(text).fm;
  const job = readField(parsed, format.fields, "job");
  if (typeof job !== "string" || job.trim() !== from) return null;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return joinNote(setValue(fm, keyFor(parsed, format.fields, "job"), to), head, sections, eol);
}

/**
 * What the page shows for recipes: the banner state of a recipe that a proposal waits for (`banner`, by the recipe), and
 * a first version that says "offen" without an open improvement job (`open`; a job with a review is open) as "teilweise"
 * with `reason`: no one improves it any more.
 */
export function markRecipes<R extends { path: string; job?: string; importState?: string; importError?: string }>(
  recipes: R[],
  o: { banner: (r: R) => "ready" | "waiting" | undefined; open: ReadonlySet<string>; reason: string },
): (R & { improvement?: "ready" | "waiting" })[] {
  return recipes.map((r) => {
    let out: R & { improvement?: "ready" | "waiting" } = r;
    const banner = o.banner(r);
    if (banner) out = { ...out, improvement: banner };
    if (r.importState === "offen" && !(r.job && o.open.has(r.job)))
      out = { ...out, importState: "teilweise", importError: r.importError ?? o.reason };
    return out;
  });
}
