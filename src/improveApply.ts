// Writes an improvement proposal (ADR 0007, rules: src/improve.ts): merges it into its note with `writeMerged`
// (backup, hand edits kept, compare-and-set), moves the images the note takes, trashes the proposal and what is left of
// its images, and can undo the merge. Depends on Obsidian; tested in tests/improveService.test.ts with a fake vault.
import { Notice, TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import { IMAGE_FOLDER, firstFree, imageNameFor, joinPath } from "./folder";
import {
  fingerprintKnown,
  proposalImages,
  readProposal,
  safeSource,
  schemaFromRecipe,
  withImportState,
  withTimeline,
  type Proposal,
} from "./improve";
import { findingsText } from "./importCheck";
import { fileName, recipeNote } from "./recipeNote";
import { parseRecipe, todayIso } from "./parse";
import { partValues, type Part } from "./fingerprint";
import { isEditablePart, planRefetch, type ChangePart } from "./refetch";
import { writeMerged } from "./refetchService";
import { tr } from "./i18n";

/** The file at a path, or null (also for a folder). */
export const fileAt = (plugin: BetterCookingPlugin, path: string): TFile | null => {
  const f = plugin.app.vault.getAbstractFileByPath(path);
  return f instanceof TFile ? f : null;
};

const imageDir = (plugin: BetterCookingPlugin) => joinPath(plugin.settings.folder, IMAGE_FOLDER);

/**
 * The images a processor wrote for a proposal that exist in the vault, by the names of the contract and not by links.
 * Only for a checked job ID (`readProposal(...).valid`): the names are built from it and from nothing else.
 */
export function imagesOf(plugin: BetterCookingPlugin, jobId: string): { cover: TFile | null; timeline: TFile | null } {
  const names = proposalImages(jobId, plugin.settings.folder);
  const cover = names.covers.map((p) => fileAt(plugin, p)).find((f) => !!f) ?? null;
  return { cover, timeline: fileAt(plugin, names.timeline) };
}

/**
 * Deletes a proposal and, for a valid one, the images of it that are still there (Obsidian's trash setting decides
 * where they go). An invalid proposal has no job ID to name images by: only the file goes.
 */
export async function trashProposal(plugin: BetterCookingPlugin, file: TFile, jobId?: string): Promise<void> {
  const { cover, timeline } = jobId ? imagesOf(plugin, jobId) : { cover: null, timeline: null };
  for (const f of [file, cover, timeline]) if (f) await plugin.app.fileManager.trashFile(f).catch(() => undefined);
}

/** A free file name in `Bilder/` for an image of a note: `<note> Titelbild.webp`, `<note> Titelbild 2.webp` … */
const freeImage = (plugin: BetterCookingPlugin, note: string, kind: "cover" | "timeline", ext: string): string =>
  firstFree(
    (n) => imageNameFor(note, kind, ext, n),
    (name) => !!plugin.app.vault.getAbstractFileByPath(joinPath(imageDir(plugin), name)),
  );

async function moveImage(plugin: BetterCookingPlugin, file: TFile | null, name: string | undefined) {
  if (!file || !name) return;
  try {
    await plugin.app.fileManager.renameFile(file, joinPath(imageDir(plugin), name));
  } catch (e) {
    console.error("Better Cooking: could not move the image of an improvement", e);
  }
}

export type MergeOutcome =
  | { kind: "gone" }
  | { kind: "conflict" }
  | { kind: "allKept" }
  /** Nothing to write; the proposal is used up. */
  | { kind: "unchanged"; title: string; job: string }
  | { kind: "written"; title: string; job: string; backup: string; before: string; after: string };

const readValid = async (plugin: BetterCookingPlugin, proposal: TFile): Promise<Proposal | undefined> => {
  const read = readProposal(await plugin.app.vault.read(proposal), plugin.noteFormat().fields, proposal.path);
  return read.valid ? read : undefined;
};

/**
 * Merges the proposal into the note: parts edited by hand stay unless they are in `replace`; import state and error
 * come from the proposal; the cover and the timeline graphic are taken only if the note has none (the other image is
 * trashed with the proposal). After a write, or when there was nothing to write, the proposal is used up and trashed;
 * a conflict or "all kept" leaves everything where it was. An invalid proposal is never merged ("gone").
 */
export async function mergeProposal(
  plugin: BetterCookingPlugin,
  proposal: TFile,
  target: TFile,
  replace: Part[],
): Promise<MergeOutcome> {
  if (!fileAt(plugin, proposal.path) || !fileAt(plugin, target.path)) return { kind: "gone" };
  const format = plugin.noteFormat();
  const read = await readValid(plugin, proposal);
  if (!read) return { kind: "gone" };
  const old = parseRecipe(target.path, await plugin.app.vault.read(target), 0, format.fields);
  const { cover, timeline } = imagesOf(plugin, read.job);
  const image = !old.image && cover ? freeImage(plugin, target.basename, "cover", cover.extension) : undefined;
  const link = !old.timeline && timeline ? freeImage(plugin, target.basename, "timeline", "svg") : undefined;
  const schema = schemaFromRecipe(read.recipe);
  const result = await writeMerged(plugin, target, schema, {
    format,
    today: todayIso(),
    image,
    replace,
    improve: { state: read.state, error: read.error, timeline: link },
  });
  if (result.kind === "conflict" || result.kind === "allKept") return { kind: result.kind };
  if (result.kind === "written") {
    await moveImage(plugin, cover, image);
    await moveImage(plugin, timeline, link);
  }
  await trashProposal(plugin, proposal, read.job);
  const done = { title: schema.title, job: read.job };
  if (result.kind === "unchanged") return { kind: "unchanged", ...done };
  return { kind: "written", ...done, backup: result.backup.name, before: result.before, after: result.after };
}

/**
 * What a merge would change in the note, for the review dialog and the decision; writes nothing. `editedChanged`:
 * a part edited by hand would change, or the note has no fingerprint this version can read (then nothing says what
 * was edited, so the user decides). `details`: the proposal's text of each changed part, for the dialog.
 */
export async function planProposal(plugin: BetterCookingPlugin, proposal: TFile, target: TFile, replace: Part[] = []) {
  const format = plugin.noteFormat();
  const read = await readValid(plugin, proposal);
  if (!read) return undefined;
  const text = await plugin.app.vault.read(target);
  const old = parseRecipe(target.path, text, 0, format.fields);
  const { cover, timeline } = imagesOf(plugin, read.job);
  const schema = schemaFromRecipe(read.recipe);
  const plan = planRefetch(text, schema, {
    format,
    today: todayIso(),
    replace,
    improve: { state: read.state, error: read.error, timeline: !old.timeline && timeline ? "x.svg" : undefined },
  });
  const changes = [...plan.changes];
  if (!old.image && cover && !changes.some((c) => c.part === "image")) changes.push({ part: "image" });
  const shown = partValues(recipeNote(schema, { today: todayIso(), format }), format.fields);
  const details: Partial<Record<ChangePart, string>> = {};
  for (const c of changes) if (isEditablePart(c.part) && shown[c.part]) details[c.part] = shown[c.part];
  const editedChanged =
    !fingerprintKnown(old) || changes.some((c) => isEditablePart(c.part) && plan.edited.includes(c.part));
  return { plan, read, changes, details, editedChanged };
}

/**
 * Takes the merge back: the note as it was before, but only if it still is exactly what the merge wrote. The job is
 * closed by then, so a first version that still says "offen" would never be improved: it goes back as "teilweise".
 */
export async function undoMerge(
  plugin: BetterCookingPlugin,
  target: TFile,
  merged: { before: string; after: string },
): Promise<boolean> {
  const format = plugin.noteFormat();
  let done = false;
  await plugin.app.vault.process(target, (cur) => {
    if (cur !== merged.after) return cur;
    done = true;
    const back = parseRecipe("", merged.before, 0, format.fields);
    return back.importState === "offen"
      ? (withImportState(merged.before, format, "teilweise", tr("improveStale")) ?? merged.before)
      : merged.before;
  });
  return done;
}

/**
 * "Save as a new recipe" for a proposal whose note is gone: a new note written by the plugin's own builder (so it is
 * defused like an import, with the extra properties of the settings), with the images moved to its name; the proposal
 * is trashed. Tells the user about import-check findings of the proposal like a normal import does. Returns the title.
 */
export async function saveProposalAsRecipe(plugin: BetterCookingPlugin, proposal: TFile): Promise<string | undefined> {
  const { app, settings } = plugin;
  const format = plugin.noteFormat();
  const read = await readValid(plugin, proposal);
  if (!read) return undefined;
  const schema = schemaFromRecipe(read.recipe);
  const folder = settings.folder;
  const name = firstFree(
    (i) => (i === 1 ? fileName(schema.title) : `${fileName(schema.title)} ${i}`),
    (n) => !!app.vault.getAbstractFileByPath(joinPath(folder, `${n}.md`)),
  );
  const { cover, timeline } = imagesOf(plugin, read.job);
  const image = cover ? freeImage(plugin, name, "cover", cover.extension) : undefined;
  const link = timeline ? freeImage(plugin, name, "timeline", "svg") : undefined;
  let text = recipeNote(schema, {
    source: safeSource(read.recipe.source),
    image,
    today: todayIso(),
    format,
    extraProperties: plugin.extraProperties(format),
  });
  if (link) text = withTimeline(text, format.lang, link);
  if (folder && !app.vault.getFolderByPath(folder)) await app.vault.createFolder(folder);
  await app.vault.create(joinPath(folder, `${name}.md`), text);
  await moveImage(plugin, cover, image);
  await moveImage(plugin, timeline, link);
  await trashProposal(plugin, proposal, read.job);
  if (read.findings.length)
    new Notice(tr("recipeSuspicious", { title: schema.title, what: findingsText(read.findings) }), 0);
  return schema.title;
}

/** Message for a failed write in the user's language. */
export const applyFailed = (e: unknown) =>
  tr("improveApplyFailed", { error: (e instanceof Error ? e.message : String(e)).slice(0, 120) });
