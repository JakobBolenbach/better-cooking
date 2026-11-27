// Moves a failure note to the trash (rules: src/importFailure.ts). The note is read again right before, so a file that
// is no failure note (any more) is never touched, whatever a job or the screen remembers.
import { Notice, TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import { canDeleteFailure } from "./importFailure";
import { noteName, parseRecipe } from "./parse";
import { tr } from "./i18n";

/** "trashed": moved to the trash (Obsidian's setting applies); "gone": no such file; "kept": not a failure note. */
export async function trashFailureNote(p: BetterCookingPlugin, path: string): Promise<"trashed" | "gone" | "kept"> {
  const file = p.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return "gone";
  const note = parseRecipe(path, await p.app.vault.cachedRead(file), file.stat.mtime, p.noteFormat().fields);
  if (!canDeleteFailure(note)) return "kept";
  await p.app.fileManager.trashFile(file);
  return "trashed";
}

/** "Remove" on a failed job: the failure note goes to the trash (only if it still is one), then the job is dropped. */
export async function removeFailedJob(p: BetterCookingPlugin, id: string) {
  const job = p.settings.jobs.find((a) => a.id === id);
  if (job?.failedNote && (await trashFailureNote(p, job.failedNote)) === "kept")
    new Notice(tr("removeFailedKept", { name: noteName(job.failedNote) }));
  await p.save({ jobs: p.settings.jobs.filter((a) => a.id !== id) });
}

/** "Remove" on a failed import without a job. */
export async function removeFailureNote(p: BetterCookingPlugin, path: string) {
  if ((await trashFailureNote(p, path)) === "kept") new Notice(tr("removeFailedKept", { name: noteName(path) }));
}
