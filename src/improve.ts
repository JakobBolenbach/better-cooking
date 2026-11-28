// Improvement proposals (ADR 0007, issue #132): a processor never rewrites a note. For a job with `verbessern` it
// writes one file Verbesserungen/<job id>.md, a full recipe note, and the plugin merges it into the note that carries
// the job ID, with the rules of "Fetch again" (ADR 0006), so hand edits survive. Pure rules without Obsidian, tested in
// tests/improve.test.ts; the part that talks to Obsidian is src/improveService.ts.
import { stepsAsData } from "./stepIngredients";
import { checkImportedNote, type Finding } from "./importCheck";
import { failureReason, isFailureNote } from "./importFailure";
import { storedField } from "./fingerprint";
import { IMAGE_FOLDER, IMPROVE_FOLDER, joinPath } from "./folder";
import { isJobId, jobFailed, jobTimedOut } from "./processor";
import { missingReason, yaml } from "./recipeNote";
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
 * discarded, and nothing else is touched. "claimed": a note carries its job ID but is no target (not "offen", job
 * unknown here): never a recipe of its own; it is checked again when the job becomes known. "waiting": no note has the
 * job ID, but one has the same source or the proposal is young: another device may not have synced the rebound note
 * yet (#156, src/improveWait.ts); "unexpected": the waiting time is over and a note with the same source exists, which does
 * not expect it any more. Both offer only "discard", never "save as a new recipe".
 */
export interface Orphan {
  path: string;
  job: string;
  title: string;
  kind: "orphan" | "invalid" | "claimed" | "waiting" | "unexpected";
  /** "waiting" and "unexpected": the note with the same source, if there is one (the card links to it). */
  note?: { path: string; title: string };
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
    steps: stepsAsData(r.steps),
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
 * The one way a first version ends when no improvement comes (the request failed, time ran out, the processor's proposal
 * failed, the proposal was discarded, a merge was undone; #133): the state the note would have without a job, "fertig" if it has ingredients and steps, otherwise "teilweise" with what is
 * missing, and `reason` ("The improvement was not started: …") appended to that. Only if the note still carries exactly
 * this job ID and says "offen" (compare-and-set); null otherwise. A complete note keeps no error line.
 */
export function closeUnimproved(text: string, jobId: string, reason: string, format: NoteFormat): string | null {
  const parsed = readFrontmatter(text).fm;
  const job = readField(parsed, format.fields, "job");
  if (typeof job !== "string" || job.trim() !== jobId) return null;
  if (importStateFrom(readField(parsed, format.fields, "importState")) !== "offen") return null;
  const r = parseRecipe("", text, 0, format.fields);
  // A note without steps has the empty placeholder "1. ", which reads as a step without text.
  const has = {
    ingredients: r.ingredients.some((g) => g.ingredients.some((i) => i.trim())),
    steps: r.steps.some((s) => s.text.trim()),
  };
  if (has.ingredients && has.steps) return withImportState(text, format, "fertig");
  return withImportState(
    text,
    format,
    "teilweise",
    [missingReason(format, has, true), reason].filter(Boolean).join(" "),
  );
}

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
export function withReview(
  jobs: Job[],
  id: string,
  review: NonNullable<Job["review"]>,
  now: number,
  processor: Job["processor"] = "claude",
): Job[] {
  const j = jobs.find((a) => a.id === id);
  if (j?.review && j.review.proposal === review.proposal && j.review.target === review.target) return jobs;
  if (!j) return [...jobs, { id, input: "", kind: "improve", since: now, processor, improve: true, review }];
  return jobs.map((a) => (a === j ? { ...a, review } : a));
}

/** The job whose proposal waits for review on this note (by its path), if any. */
export const reviewJobOf = (jobs: readonly Job[], targetPath: string): Job | undefined =>
  jobs.find((j) => j.review?.target === targetPath);

/**
 * The banner of a recipe page: "ready" when the review job is this note's job, "waiting" when another device's job of
 * this note may still apply its proposal. A note without a job ID never has one (#144: `undefined === undefined`).
 */
export function bannerFor(
  job: string | undefined,
  reviewJob: string | undefined,
  waitingJob: string | undefined,
): "ready" | "waiting" | undefined {
  const id = job?.trim();
  if (!id) return undefined;
  if (reviewJob === id) return "ready";
  return waitingJob === id ? "waiting" : undefined;
}

/** A proposal of a run that a retry replaced: some job lists its ID in `retryOf`. It is dropped without a card. */
export const replacedRun = (jobs: readonly Job[], id: string): boolean =>
  jobs.some((j) => j.retryOf?.some((o) => o.job === id));

/**
 * The note with `auftrag` changed from the old job ID to the new one (a retry starts a new run with a new ID), only if
 * it still carries the old one (`from` undefined: only if it has none, so a finished note can take a job: feedback,
 * #120); null otherwise. The note says "offen" afterwards like a first version (a note without `import` gets the field).
 */
export function rebindJob(text: string, format: NoteFormat, from: string | undefined, to: string): string | null {
  const { fm, head, sections } = splitNote(text);
  if (!fm) return null;
  const parsed = readFrontmatter(text).fm;
  const job = readField(parsed, format.fields, "job");
  if ((typeof job === "string" && job.trim() ? job.trim() : undefined) !== from?.trim()) return null;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const rebound = joinNote(setValue(fm, keyFor(parsed, format.fields, "job"), to), head, sections, eol);
  // A new run: the note looks like a first version again ("offen", no reason of the run before).
  if (importStateFrom(readField(parsed, format.fields, "importState")) === "offen") return rebound;
  return withImportState(rebound, format, "offen") ?? rebound;
}

/**
 * What the page shows for recipes: the banner state of a recipe that a proposal waits for (`banner`, by the recipe), a
 * first version that says "offen" while its improvement job is open (`open`, by job ID; the job itself if known) as
 * `improving` (#133), and one that says "offen" without an open job as "teilweise" with `reason`: no one improves it
 * any more.
 */
export function markRecipes<R extends { path: string; job?: string; importState?: string; importError?: string }>(
  recipes: R[],
  o: { banner: (r: R) => "ready" | "waiting" | undefined; open: ReadonlyMap<string, Job | undefined>; reason: string },
): (R & { improvement?: "ready" | "waiting"; improving?: { job?: Job } })[] {
  return recipes.map((r) => {
    let out: R & { improvement?: "ready" | "waiting"; improving?: { job?: Job } } = r;
    const banner = o.banner(r);
    if (banner) out = { ...out, improvement: banner };
    if (r.importState === "offen") {
      // With a proposal waiting (or on its way to another device) the banner speaks, not "is being improved".
      if (r.job && o.open.has(r.job)) out = banner ? out : { ...out, improving: { job: o.open.get(r.job) } };
      else out = { ...out, importState: "teilweise", importError: r.importError ?? o.reason };
    }
    return out;
  });
}

/**
 * The cards of jobs for the overview without those of first versions (#133): an improvement job that is still running
 * and whose note exists shows on that note (badge, line on its page), not as a card of its own. One that failed or ran
 * out of time keeps its card, which has "Retry".
 */
export function withoutFirstVersions(
  jobs: Job[],
  recipes: readonly { job?: string; importState?: string }[],
  now: number,
): Job[] {
  const notes = new Set(recipes.filter((r) => r.importState === "offen" && r.job).map((r) => r.job));
  return jobs.filter((j) => !(j.improve && (j.starting || notes.has(j.id)) && !jobFailed(j) && !jobTimedOut(j, now)));
}

/** The jobs with this one in place of the reserved job of its ID (#133), or added if there was none. */
export const upsertJob = (jobs: readonly Job[], job: Job): Job[] =>
  jobs.some((j) => j.id === job.id) ? jobs.map((j) => (j.id === job.id ? job : j)) : [...jobs, job];

/** Is the job an improvement job that is still open (not dropped, no error)? The one definition (`mark`, busy check). */
export const isOpenImprove = (j: Job): boolean => j.improve === true && !j.dropped && !jobFailed(j);

/**
 * Is an improvement running for this note ("running": its job is open and the proposal has not come), or does a
 * proposal wait for review ("review")? Nothing else may start for it then (feedback, #120).
 */
export function improvementBusy(
  jobs: readonly Job[],
  note: { path: string; job?: string },
): "running" | "review" | undefined {
  if (jobs.some((j) => j.review?.target === note.path)) return "review";
  const own = note.job?.trim();
  return own && jobs.some((j) => j.id === own && isOpenImprove(j) && !j.review) ? "running" : undefined;
}
