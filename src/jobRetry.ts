// A new run for a job (ADR 0007): "Retry" of a failed job, and feedback (#120) on a note whose last improvement
// failed. The new run replaces the old job (`retryOf`, so late proposals of the old ID are dropped), and for an
// improvement the note's `auftrag` follows. Kept out of src/main.ts, which is at its budget.
import type BetterCookingPlugin from "./main";
import { replaceJob } from "./importFailure";
import { prevOf, type Prev } from "./improve";
import { findTarget } from "./improveTarget";
import { tr } from "./i18n";
import type { Job } from "./types";

/** Why a retry must not start, or undefined: an improvement job needs its note, which has to carry the job ID still. */
export async function refuseRetry(p: BetterCookingPlugin, old: Job): Promise<string | undefined> {
  if (!old.improve || (await findTarget(p, old.id, true))) return undefined;
  return tr("retryNoNote");
}

/**
 * The jobs with the new run in place of `old` (when there is one): the new job remembers the old run, and the state a
 * note had before feedback set it to "offen" (`prev`, otherwise what the old job kept) is on it.
 */
export function withNewRun(jobs: Job[], old: Job | undefined, newId: string, prev?: Prev): Job[] {
  const next = old ? replaceJob(jobs, old, newId) : jobs;
  const carried = prev ?? prevOf(old);
  if (!carried) return next;
  return next.map((j) =>
    j.id === newId ? { ...j, prevState: carried.state, ...(carried.error ? { prevError: carried.error } : {}) } : j,
  );
}

/** A retry was accepted under `newId`: the old job goes, the note's `auftrag` follows (only if it still has the old one). */
export async function retryRun(p: BetterCookingPlugin, old: Job, newId: string): Promise<void> {
  const prev = old.improve ? await p.improve.rebind(old.id, newId) : undefined;
  await p.save({ jobs: withNewRun(p.settings.jobs, old, newId, prev) });
}
