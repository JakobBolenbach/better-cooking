// Deletes failure notes (rules: src/importFailure.ts). A note is read again right before, so a file that is no
// failure note (any more), or one for another job, is never touched, whatever a job or the screen remembers.
import { Notice, TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import { canDeleteFailure, failureNotesOf } from "./importFailure";
import { isRecipeFile } from "./folder";
import { noteName, parseRecipe } from "./parse";
import { tr } from "./i18n";

/**
 * "trashed": deleted (Obsidian's setting decides where it goes); "gone": no such file; "kept": not a failure note
 * (for `jobId`, if given); "error": the file could not be read or deleted.
 */
export async function trashFailureNote(
  p: BetterCookingPlugin,
  path: string,
  jobId?: string,
): Promise<"trashed" | "gone" | "kept" | "error"> {
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
function notify<T extends Awaited<ReturnType<typeof trashFailureNote>>>(result: T, path: string): T {
  if (result === "kept") new Notice(tr("removeFailedKept", { name: noteName(path) }));
  if (result === "error") new Notice(tr("removeFailedError", { name: noteName(path) }));
  return result;
}

/**
 * "Remove" on a failed job: the failure notes of the job and of the runs it replaced are deleted (each only if it
 * still is a failure note for its job), then the job is dropped. If a note could not be deleted, the job stays.
 */
export async function removeFailedJob(p: BetterCookingPlugin, id: string) {
  const job = p.settings.jobs.find((a) => a.id === id);
  if (!job) return;
  let blocked = false;
  for (const n of failureNotesOf(job))
    blocked = notify(await trashFailureNote(p, n.note, n.job), n.note) === "error" || blocked;
  if (!blocked) await p.save({ jobs: p.settings.jobs.filter((a) => a.id !== id) });
}

/** "Remove" on a failed import without a job. */
export async function removeFailureNote(p: BetterCookingPlugin, path: string, jobId: string) {
  notify(await trashFailureNote(p, path, jobId), path);
}
