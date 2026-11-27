// Finding what an improvement proposal belongs to, and tidying up after it (ADR 0007). Depends on Obsidian; the rules
// are in src/improve.ts. Used by src/improveService.ts.
import type { TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import { IMAGE_FOLDER, IMPROVE_FOLDER, joinPath } from "./folder";
import { markImproveFailed, proposalImageJob, startedHere, targetOf } from "./improve";
import { fileAt } from "./improveApply";
import { deviceId } from "./importSyncService";
import { importStateFrom, readField } from "./noteFormat";
import { parseRecipe, readFrontmatter } from "./parse";
import { recipeStubs } from "./recipeStubs";
import { tr } from "./i18n";
import type { Job } from "./types";

/** Images of a proposal that nobody uses any more are cleaned up when they are this old. */
const LEFTOVER_MS = 60 * 60_000;

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/**
 * The note of a job: by frontmatter from the metadata cache, and by reading the file where the cache has no entry
 * yet. A note that says "failed" is excluded only after it was really read (`isFailureNote`, in `targetOf`).
 */
export async function findTarget(
  p: BetterCookingPlugin,
  jobId: string,
  known: boolean,
): Promise<{ path: string; file: TFile } | undefined> {
  const fields = p.noteFormat().fields;
  const found: { path: string; job?: string; importState?: string; file: TFile }[] = [];
  for (const s of recipeStubs(p)) {
    let { job, importState } = s;
    if (s.uncached) {
      const fm = readFrontmatter(await p.app.vault.cachedRead(s.file)).fm;
      job = str(readField(fm, fields, "job"));
      importState = importStateFrom(readField(fm, fields, "importState"));
    }
    if (job?.trim() !== jobId) continue;
    const read = importState === "fehler" ? parseRecipe(s.path, await p.app.vault.cachedRead(s.file), 0, fields) : {};
    found.push({ ...read, path: s.path, job, importState, file: s.file });
  }
  return targetOf(jobId, found, known);
}

/** The timeout of an improvement job: the device that started it leaves the first version as "teilweise" with a reason. */
export async function markTimedOut(p: BetterCookingPlugin, jobs: readonly Job[]) {
  const thisDevice = deviceId(p.app);
  const format = p.noteFormat();
  for (const j of jobs) {
    if (j.errorKey !== "noImprovementArrived" || !startedHere(j, thisDevice)) continue;
    const target = await findTarget(p, j.id, true);
    if (target)
      await p.app.vault.process(
        target.file,
        (cur) => markImproveFailed(cur, j.id, tr("noImprovementArrived"), format) ?? cur,
      );
  }
}

/**
 * Images named after a job ID (`Bilder/<job id> Titelbild.webp`, `… Ablauf.svg`) that arrived after their proposal
 * was dealt with: deleted when no job with that ID is open, no proposal exists for it, no note links to the image,
 * and the file is older than an hour. Only exactly such names, never anything else.
 */
export async function cleanupImages(p: BetterCookingPlugin) {
  const folder = p.settings.folder;
  const { vault, metadataCache } = p.app;
  const linked = new Set(Object.values(metadataCache.resolvedLinks).flatMap((l) => Object.keys(l)));
  for (const f of vault.getFiles()) {
    const job = proposalImageJob(f.path, folder);
    if (!job || !f.path.startsWith(`${joinPath(folder, IMAGE_FOLDER)}/`)) continue;
    if (p.settings.jobs.some((j) => j.id === job)) continue;
    if (fileAt(p, joinPath(joinPath(folder, IMPROVE_FOLDER), `${job}.md`))) continue;
    if (linked.has(f.path) || Date.now() - f.stat.mtime < LEFTOVER_MS) continue;
    await p.app.fileManager.trashFile(f).catch(() => undefined);
  }
}
