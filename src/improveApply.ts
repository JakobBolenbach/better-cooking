// Writes an improvement proposal (ADR 0007, rules: src/improve.ts): merges it into its note with `writeMerged`
// (backup, hand edits kept, compare-and-set), moves the images the note takes, trashes the proposal and what is left of
// its images, and can undo the merge. Depends on Obsidian; tested in tests/improveService.test.ts with a fake vault.
import { TFile, normalizePath } from "obsidian";
import type BetterCookingPlugin from "./main";
import { firstFree } from "./folder";
import {
  imageNameFor,
  proposalImages,
  readProposal,
  schemaFromRecipe,
  safeSource,
  withTimeline,
  type Proposal,
} from "./improve";
import { fileName, recipeNote } from "./recipeNote";
import { parseRecipe, todayIso } from "./parse";
import type { Part } from "./fingerprint";
import { planRefetch } from "./refetch";
import { writeMerged } from "./refetchService";
import { tr } from "./i18n";

const dir = (folder: string, sub: string) => normalizePath(folder ? `${folder}/${sub}` : sub);

const fileAt = (plugin: BetterCookingPlugin, path: string): TFile | null => {
  const f = plugin.app.vault.getAbstractFileByPath(path);
  return f instanceof TFile ? f : null;
};

/** The images a processor wrote for a proposal that exist in the vault (by the names of the contract, not by links). */
export function imagesOf(plugin: BetterCookingPlugin, jobId: string): { cover: TFile | null; timeline: TFile | null } {
  const names = proposalImages(jobId, plugin.settings.folder);
  const cover = names.covers.map((p) => fileAt(plugin, p)).find((f) => !!f) ?? null;
  return { cover, timeline: fileAt(plugin, names.timeline) };
}

/** Deletes a proposal and the images of it that are still there (Obsidian's trash setting decides where they go). */
export async function trashProposal(plugin: BetterCookingPlugin, file: TFile, jobId: string): Promise<void> {
  const { cover, timeline } = imagesOf(plugin, jobId);
  for (const f of [file, cover, timeline]) if (f) await plugin.app.fileManager.trashFile(f).catch(() => undefined);
}

/** A free file name in `Bilder/` for an image of a note: `<note> Titelbild.webp`, `<note> Titelbild 2.webp` … */
const freeImage = (plugin: BetterCookingPlugin, note: string, kind: "cover" | "timeline", ext: string): string =>
  firstFree(
    (n) => imageNameFor(note, kind, ext, n),
    (name) => !!plugin.app.vault.getAbstractFileByPath(`${dir(plugin.settings.folder, "Bilder")}/${name}`),
  );

async function moveImage(plugin: BetterCookingPlugin, file: TFile | null, name: string | undefined) {
  if (!file || !name) return;
  try {
    await plugin.app.fileManager.renameFile(file, `${dir(plugin.settings.folder, "Bilder")}/${name}`);
  } catch (e) {
    console.error("Better Cooking: could not move the image of an improvement", e);
  }
}

export type MergeOutcome =
  | { kind: "gone" }
  | { kind: "conflict" }
  | { kind: "allKept" }
  /** Nothing to write; the proposal is used up. */
  | { kind: "unchanged"; title: string }
  | { kind: "written"; title: string; backup: string; before: string; after: string };

/**
 * Merges the proposal into the note: parts edited by hand stay unless they are in `replace`; import state and error
 * come from the proposal; the cover and the timeline graphic are taken only if the note has none (the other image is
 * trashed with the proposal). After a write, or when there was nothing to write, the proposal is used up and trashed;
 * a conflict or "all kept" leaves everything where it was.
 */
export async function mergeProposal(
  plugin: BetterCookingPlugin,
  proposal: TFile,
  target: TFile,
  replace: Part[],
): Promise<MergeOutcome> {
  if (!fileAt(plugin, proposal.path) || !fileAt(plugin, target.path)) return { kind: "gone" };
  const format = plugin.noteFormat();
  const read: Proposal = readProposal(await plugin.app.vault.read(proposal), format.fields, proposal.path);
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
  if (result.kind === "unchanged") return { kind: "unchanged", title: schema.title };
  return {
    kind: "written",
    title: schema.title,
    backup: result.backup.name,
    before: result.before,
    after: result.after,
  };
}

/** What a merge would change in the note, for the review dialog and the decision; writes nothing. */
export async function planProposal(plugin: BetterCookingPlugin, proposal: TFile, target: TFile, replace: Part[] = []) {
  const format = plugin.noteFormat();
  const read = readProposal(await plugin.app.vault.read(proposal), format.fields, proposal.path);
  const text = await plugin.app.vault.read(target);
  const old = parseRecipe(target.path, text, 0, format.fields);
  const { cover, timeline } = imagesOf(plugin, read.job);
  const plan = planRefetch(text, schemaFromRecipe(read.recipe), {
    format,
    today: todayIso(),
    replace,
    improve: { state: read.state, error: read.error, timeline: !old.timeline && timeline ? "x.svg" : undefined },
  });
  return { plan, read, coverNew: !old.image && !!cover };
}

/** Takes the merge back: the note as it was before, but only if it still is exactly what the merge wrote. */
export async function undoMerge(
  plugin: BetterCookingPlugin,
  target: TFile,
  merged: { before: string; after: string },
): Promise<boolean> {
  let done = false;
  await plugin.app.vault.process(target, (cur) => {
    if (cur !== merged.after) return cur;
    done = true;
    return merged.before;
  });
  return done;
}

/**
 * "Save as a new recipe" for a proposal whose note is gone: a new note written by the plugin's own builder (so it is
 * defused like an import), with the images moved to its name; the proposal is trashed. Returns the title.
 */
export async function saveProposalAsRecipe(plugin: BetterCookingPlugin, proposal: TFile): Promise<string> {
  const { app, settings } = plugin;
  const format = plugin.noteFormat();
  const read = readProposal(await app.vault.read(proposal), format.fields, proposal.path);
  const schema = schemaFromRecipe(read.recipe);
  const folder = settings.folder;
  const name = firstFree(
    (i) => (i === 1 ? fileName(schema.title) : `${fileName(schema.title)} ${i}`),
    (n) => !!app.vault.getAbstractFileByPath(dir(folder, `${n}.md`)),
  );
  const { cover, timeline } = imagesOf(plugin, read.job);
  const image = cover ? freeImage(plugin, name, "cover", cover.extension) : undefined;
  const link = timeline ? freeImage(plugin, name, "timeline", "svg") : undefined;
  let text = recipeNote(schema, { source: safeSource(read.recipe.source), image, today: todayIso(), format });
  if (link) text = withTimeline(text, format.lang, link);
  if (folder && !app.vault.getFolderByPath(folder)) await app.vault.createFolder(folder);
  await app.vault.create(dir(folder, `${name}.md`), text);
  await moveImage(plugin, cover, image);
  await moveImage(plugin, timeline, link);
  await trashProposal(plugin, proposal, read.job);
  return schema.title;
}

/** Message for a failed write in the user's language. */
export const applyFailed = (e: unknown) =>
  tr("improveApplyFailed", { error: (e instanceof Error ? e.message : String(e)).slice(0, 120) });
