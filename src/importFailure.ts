// A processor that fails still writes a note with the import state "failed" (docs/import-contract.md). Such a note is
// no recipe: it closes its job as failed, and without a job it is shown as a failed import. Pure rules, tested in
// tests/importFailure.test.ts.
import type { Job } from "./types";

/** The parsed import state (`importStateFrom`) of a failure note, in both note languages. */
export const FAILED_STATE = "fehler";

interface NoteLike {
  importState?: string;
  importError?: string;
  job?: string;
}

/** A note whose import state says "failed". */
export const isFailedImport = (r: Pick<NoteLike, "importState">): boolean => r.importState === FAILED_STATE;

/**
 * May the plugin move this note to the trash? Only a failure note that the processor wrote for a job: import state
 * "failed" and a job ID. A normal recipe never passes, and neither does a note with `import: failed` and no job.
 */
export const canDeleteFailure = (r: NoteLike): boolean => isFailedImport(r) && !!r.job?.trim();

/** One-line reason of a failure note, or undefined if the note gives none. The text is untrusted: shown as text only. */
export function failureReason(r: Pick<NoteLike, "importError">): string | undefined {
  const s = (r.importError ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
  return s || undefined;
}

/** The job as failed with the reason of its failure note (the same result on every device, so merging is stable). */
export function failJob(a: Job, note: { path: string } & NoteLike): Job {
  const reason = failureReason(note);
  const next: Job = { ...a, failedNote: note.path };
  delete next.error;
  delete next.errorKey;
  if (reason) next.error = reason;
  else next.errorKey = "importFailedNoReason";
  return next;
}

/** Failure notes that no job knows: by the path the job remembers, or by the job ID in the note. */
export function orphanFailures<R extends { path: string; job?: string }>(failures: R[], jobs: readonly Job[]): R[] {
  return failures.filter((f) => !jobs.some((a) => a.failedNote === f.path || (!!f.job && a.id === f.job)));
}
