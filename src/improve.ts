// Improvement proposals (ADR 0007, issue #132): a processor never rewrites a note. For a job with `verbessern` it
// writes one file Verbesserungen/<job id>.md, a full recipe note, and the plugin merges it into the note that carries
// the job ID, with the rules of "Fetch again" (ADR 0006), so hand edits survive. Pure rules without Obsidian, tested in
// tests/improve.test.ts; the part that talks to Obsidian is src/improveService.ts.
import { checkImportedNote, type Finding } from "./importCheck";
import { failureReason, isFailureNote } from "./importFailure";
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
export const IMPROVE_DIR = "Verbesserungen";

/** Is the path a proposal: a Markdown file directly in `<folder>/Verbesserungen/`? */
export function isProposalPath(path: string, folder: string): boolean {
  if (!path.toLowerCase().endsWith(".md")) return false;
  const dir = folder === "" ? IMPROVE_DIR : `${folder}/${IMPROVE_DIR}`;
  const cut = path.lastIndexOf("/");
  return (cut < 0 ? "" : path.slice(0, cut)) === dir;
}

/** The job ID in the file name of a proposal (`Verbesserungen/<job id>.md`). */
export const proposalJobId = (path: string): string => (path.split("/").pop() ?? path).replace(/\.md$/i, "");

/** A proposal whose note is gone: shown in the import area ("Rezept nicht gefunden"). */
export interface Orphan {
  path: string;
  job: string;
  title: string;
}

/** What a proposal says. `state` is what the processor reports; "offen" has no meaning in a proposal and is read as "teilweise". */
export interface Proposal {
  /** Job ID: the frontmatter field, otherwise the file name. */
  job: string;
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
  const job = (recipe.job?.trim() || proposalJobId(path)).trim();
  const given = importStateFrom(readField(readFrontmatter(text).fm, fields, "importState"));
  const complete = recipe.ingredients.length > 0 && recipe.steps.length > 0;
  const state: Proposal["state"] =
    given === "fehler" ? "fehler" : given === "teilweise" ? "teilweise" : complete ? "fertig" : "teilweise";
  const error = failureReason(recipe);
  return { job, state, recipe, ...(state !== "fertig" && error ? { error } : {}), findings: checkImportedNote(text) };
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

/** The note an improvement job belongs to: the recipe that carries the job ID (not a failure note, not a backup). */
export function targetOf<R extends { job?: string; path: string }>(
  jobId: string,
  recipes: readonly R[],
): R | undefined {
  const same = recipes.filter((r) => r.job?.trim() === jobId);
  return same.find((r) => !isFailureNote(r as never)) ?? undefined;
}

export type ImproveDecision = "apply" | "review" | "orphan" | "drop";

/**
 * What happens with a proposal that has content. "drop": the job was dropped (its note was deleted on purpose), the
 * proposal goes away quietly. "orphan": no note carries the job ID. "apply": this device started the job, no part
 * edited by hand would change and the proposal has no import-check findings. Everything else is "review": the user
 * looks at it first (also on every other device, and when the job is not known here).
 */
export function improveDecision(i: {
  job: Pick<Job, "device" | "dropped"> | undefined;
  thisDevice: string | null;
  target: unknown;
  editedChanged: boolean;
  findings: readonly Finding[];
}): ImproveDecision {
  if (i.job?.dropped) return "drop";
  if (!i.target) return "orphan";
  const mine = !!i.thisDevice && !!i.job?.device && i.job.device === i.thisDevice;
  return mine && !i.editedChanged && !i.findings.length ? "apply" : "review";
}

// ------------------------------------------------------------------ Files of a proposal

const COVER_EXT = ["webp", "jpg", "jpeg", "png", "avif", "gif"];

/** Where a processor puts the images of a proposal (contract): the paths to look at, nothing the file links to. */
export function proposalImages(jobId: string, folder: string): { covers: string[]; timeline: string } {
  const dir = folder === "" ? "Bilder" : `${folder}/Bilder`;
  return {
    covers: COVER_EXT.map((e) => `${dir}/${jobId} Titelbild.${e}`),
    timeline: `${dir}/${jobId} Ablauf.svg`,
  };
}

/** Name of an image after it moved into a note's family: `<note> Titelbild.webp`, `<note> Ablauf.svg`. */
export const imageNameFor = (note: string, kind: "cover" | "timeline", extension: string, n = 1): string =>
  kind === "cover"
    ? `${note} Titelbild${n === 1 ? "" : ` ${n}`}.${extension}`
    : `${note} Ablauf${n === 1 ? "" : ` ${n}`}.svg`;

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

/**
 * The note after a failed improvement (starting device): import state "teilweise" and the reason as `import_fehler`,
 * but only if the note still carries exactly this job ID and says "offen" (compare-and-set); null otherwise. Nothing
 * else of the note changes.
 */
export function markImproveFailed(text: string, jobId: string, reason: string, format: NoteFormat): string | null {
  const { fm, head, sections } = splitNote(text);
  if (!fm) return null;
  const parsed = readFrontmatter(text).fm;
  const job = readField(parsed, format.fields, "job");
  if (typeof job !== "string" || job.trim() !== jobId) return null;
  if (importStateFrom(readField(parsed, format.fields, "importState")) !== "offen") return null;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const state = setValue(fm, keyFor(parsed, format.fields, "importState"), importValue(format, "teilweise"));
  const out = setValue(
    state,
    keyFor(parsed, format.fields, "importError"),
    JSON.stringify(reason.replace(/[\r\n]+/g, " ")),
  );
  return joinNote(out, head, sections, eol);
}

/** A source address that a note may carry: http(s) only. */
export const safeSource = (s: string | undefined): string | undefined =>
  s && /^https?:\/\/\S+$/i.test(s) ? s : undefined;
