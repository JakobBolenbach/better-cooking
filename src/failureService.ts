// Deletes failure notes (rules: src/importFailure.ts). A note is read again right before, so a file that is no
// failure note (any more), or one for another job, is never touched, whatever a job or the screen remembers.
import { Notice, TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import { canDeleteFailure, failureNotesOf, withKnownNotes } from "./importFailure";
import { isRecipeFile } from "./folder";
import { importStateFrom, readField } from "./noteFormat";
import { noteName, parseRecipe } from "./parse";
import { tr } from "./i18n";
import type { Job } from "./types";

type Result = "trashed" | "gone" | "kept" | "error";

/**
 * "trashed": deleted (Obsidian's setting decides where it goes); "gone": no such file; "kept": not a failure note
 * (for `jobId`, if given); "error": the file could not be read or deleted.
 */
export async function trashFailureNote(p: BetterCookingPlugin, path: string, jobId?: string): Promise<Result> {
  const file = p.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return "gone";
  if (!isRecipeFile(path, p.settings.folder) || p.lists.isListNote(path)) return "kept";
  try {
    const note = parseRecipe(path, await p.app.vault.read(file), file.stat.mtime, p.noteFormat().fields);
    if (!canDeleteFailure(note, jobId)) return "kept";
    await p.app.fileManager.trashFile(file);
    return "trashed";
  } catch {
    return "error";
  }
}

/** Tells the user about a note that was kept or could not be deleted; passes the result on. */
function notify(result: Result, path: string): Result {
  if (result === "kept") new Notice(tr("removeFailedKept", { name: noteName(path) }));
  if (result === "error") new Notice(tr("removeFailedError", { name: noteName(path) }));
  return result;
}

/** Notes of the recipe folder that say "failed" and carry a job ID (frontmatter only; deleting re-reads them). */
export function failureCandidates(p: BetterCookingPlugin): { path: string; job?: string }[] {
  const fields = p.noteFormat().fields;
  return p.app.vault
    .getMarkdownFiles()
    .filter((f) => !p.lists.isListNote(f.path) && isRecipeFile(f.path, p.settings.folder))
    .flatMap((f) => {
      const fm = p.app.metadataCache.getFileCache(f)?.frontmatter ?? {};
      const job = readField(fm, fields, "job");
      return importStateFrom(readField(fm, fields, "importState")) === "fehler" && typeof job === "string"
        ? [{ path: f.path, job }]
        : [];
    });
}

/** Deletes the failure notes a job answers for (the notes of the vault by job ID included); false if one failed. */
async function trashChain(p: BetterCookingPlugin, job: Job, quiet = false): Promise<{ ok: boolean; n: number }> {
  let ok = true;
  let n = 0;
  const [full] = withKnownNotes([job], failureCandidates(p));
  for (const note of failureNotesOf(full)) {
    const r = await trashFailureNote(p, note.note, note.job);
    if (!quiet) notify(r, note.note);
    ok = r !== "error" && ok;
    if (r === "trashed") n++;
  }
  return { ok, n };
}

/**
 * "Remove" on a failed job: the failure notes of the job and of the runs it replaced are deleted (each only if it
 * still is a failure note for its job), then the job is dropped. If a note could not be deleted, the job stays.
 */
export async function removeFailedJob(p: BetterCookingPlugin, id: string) {
  const job = p.settings.jobs.find((a) => a.id === id);
  if (job && (await trashChain(p, job)).ok) await p.save({ jobs: p.settings.jobs.filter((a) => a.id !== id) });
}

/** "Remove" on a failed import without a job. */
export async function removeFailureNote(p: BetterCookingPlugin, path: string, jobId: string) {
  notify(await trashFailureNote(p, path, jobId), path);
}

/** A job that replaced a failed run has arrived: the failure notes of the old runs go (same checks), with a notice. */
export async function cleanFailureChain(p: BetterCookingPlugin, job: Job) {
  if (!job.retryOf?.length) return;
  if ((await trashChain(p, job, true)).n) new Notice(tr("oldFailureRemoved"));
}
