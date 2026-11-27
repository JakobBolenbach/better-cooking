// Finding what an improvement proposal belongs to, and the writes into notes that go with a job (ADR 0007): the timeout
// of a job, a retry's new job ID. Depends on Obsidian; the rules are in src/improve.ts. Used by src/improveService.ts.
// Every write is checked against the text read from the cache first: nothing is written that would not change.
import type { TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import { markImproveFailed, rebindJob, startedHere, targetOf } from "./improve";
import { deviceId } from "./importSyncService";
import { parseRecipe, readFrontmatter } from "./parse";
import { recipeStubs, stubFields } from "./recipeStubs";
import { jobTimedOut } from "./processor";
import { tr } from "./i18n";
import type { Job } from "./types";

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
    if (s.uncached)
      ({ job, importState } = stubFields(readFrontmatter(await p.app.vault.cachedRead(s.file)).fm, fields));
    if (job?.trim() !== jobId) continue;
    const read = importState === "fehler" ? parseRecipe(s.path, await p.app.vault.cachedRead(s.file), 0, fields) : {};
    found.push({ ...read, path: s.path, job, importState, file: s.file });
  }
  return targetOf(jobId, found, known);
}

/** Writes `change` into the note, but only if it would change it (read from the cache first); true if written. */
export async function writeIfChanged(
  p: BetterCookingPlugin,
  file: TFile,
  change: (text: string) => string | null,
): Promise<boolean> {
  if (change(await p.app.vault.cachedRead(file)) === null) return false;
  let written = false;
  await p.app.vault.process(file, (cur) => {
    const next = change(cur);
    written = next !== null && next !== cur;
    return next ?? cur;
  });
  return written;
}

/**
 * The timeout of improvement jobs: the device that started a job leaves the first version as "teilweise" with a reason
 * (compare-and-set on the job ID and "offen"), once per job: the job is marked `timedOut` afterwards, whether or not
 * there was a note to write.
 */
export async function markTimedOut(p: BetterCookingPlugin, jobs: readonly Job[]) {
  const thisDevice = deviceId(p.app);
  const format = p.noteFormat();
  const done = new Set<string>();
  for (const j of jobs) {
    if (j.errorKey !== "noImprovementArrived" || j.timedOut || !startedHere(j, thisDevice)) continue;
    const target = await findTarget(p, j.id, true);
    if (target)
      await writeIfChanged(p, target.file, (t) => markImproveFailed(t, j.id, tr("noImprovementArrived"), format));
    done.add(j.id);
  }
  if (done.size)
    await p.save({ jobs: p.settings.jobs.map((j) => (done.has(j.id) ? { ...j, timedOut: true as const } : j)) });
}

/** A retry started a new run: the note's `auftrag` becomes the new job ID, if it still carries the old one. */
export async function rebind(p: BetterCookingPlugin, from: string, to: string) {
  const target = await findTarget(p, from, true);
  const format = p.noteFormat();
  if (target) await writeIfChanged(p, target.file, (t) => rebindJob(t, format, from, to));
}

/** Jobs of a deleted note (`dropped`) whose proposal never came go once their time is over. */
export async function tidyJobs(p: BetterCookingPlugin, hasProposal: (id: string) => boolean) {
  const now = Date.now();
  const jobs = p.settings.jobs.filter((j) => !(j.dropped && jobTimedOut(j, now) && !hasProposal(j.id)));
  if (jobs.length !== p.settings.jobs.length) await p.save({ jobs });
}
