// Moves a failure note to the trash (rules: src/importFailure.ts). The note is read again right before, so a file that
// is no failure note (any more) is never touched, whatever a job or the screen remembers.
import { TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import { canDeleteFailure } from "./importFailure";
import { parseRecipe } from "./parse";

/** "trashed": moved to the trash (Obsidian's setting applies); "gone": no such file; "kept": not a failure note. */
export async function trashFailureNote(p: BetterCookingPlugin, path: string): Promise<"trashed" | "gone" | "kept"> {
  const file = p.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return "gone";
  const note = parseRecipe(path, await p.app.vault.cachedRead(file), file.stat.mtime, p.noteFormat().fields);
  if (!canDeleteFailure(note)) return "kept";
  await p.app.fileManager.trashFile(file);
  return "trashed";
}
