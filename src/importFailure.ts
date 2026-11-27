// A processor that fails still writes a note with the import state "failed" (docs/import-contract.md). A note
// counts as such a failure note only if it also carries a job ID and holds no recipe content (no ingredients, steps,
// tips, notes or attempts; the description is the reason and does not count): a recipe with `import: fehler` and
// content stays a normal recipe. A failure note closes its job as failed, and
// without a job it is shown as a failed import. Pure rules, tested in tests/importFailure.test.ts.
import type { Job } from "./types";

/** The parsed import state (`importStateFrom`) of a failure note, in both note languages. */
export const FAILED_STATE = "fehler";

interface NoteLike {
  importState?: string;
  importError?: string;
  job?: string;
  /** From the parser; left out where only the frontmatter is known (then the note counts as without content). */
  ingredients?: { ingredients: unknown[] }[];
  steps?: unknown[];
  tips?: unknown[];
  notes?: unknown[];
  attempts?: unknown[];
}

/**
 * Content of a real recipe: ingredients, steps, tips, notes or attempts. The description does not count, because the
 * processor writes the reason there.
 */
const hasContent = (r: NoteLike) =>
  !!(r.steps?.length || r.tips?.length || r.notes?.length || r.attempts?.length) ||
  !!r.ingredients?.some((g) => g.ingredients.length);

/** A failure note: import state "failed", a job ID, and no recipe content. Everything else is a normal recipe. */
export const isFailureNote = (r: NoteLike): boolean =>
  r.importState === FAILED_STATE && !!r.job?.trim() && !hasContent(r);

/**
 * May the plugin delete this note? Only a failure note (`isFailureNote`), and if `jobId` is given, only one that was
 * written for exactly that job.
 */
export const canDeleteFailure = (r: NoteLike, jobId?: string): boolean =>
  isFailureNote(r) && (jobId === undefined || r.job?.trim() === jobId);

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

/** The failure notes a job answers for: its own and those of the runs it replaced ("Retry"). */
export function failureNotesOf(a: Job): { job: string; note: string }[] {
  const all = [{ job: a.id, note: a.failedNote }, ...(a.retryOf ?? [])];
  return all.flatMap((x) => (x.note ? [{ job: x.job, note: x.note }] : []));
}

/**
 * The jobs with the failure notes of the vault added that belong to them by job ID (the job or a run it replaced) but
 * that the job does not remember by path (a note that was renamed or came late). For the question before "Remove" and
 * for the removal itself; not stored.
 */
export function withKnownNotes(jobs: Job[], failures: readonly { path: string; job?: string }[]): Job[] {
  return jobs.map((a) => {
    const ids = new Set([a.id, ...(a.retryOf ?? []).map((o) => o.job)]);
    const have = new Set(failureNotesOf(a).map((n) => n.note));
    const extra = failures.filter((f) => !!f.job && ids.has(f.job) && !have.has(f.path));
    return extra.length
      ? { ...a, retryOf: [...(a.retryOf ?? []), ...extra.map((f) => ({ job: f.job!, note: f.path }))] }
      : a;
  });
}

/** Jobs whose failure notice was not shown on this device yet, and the list to remember (the newest `cap`). */
export function newlyReported(failed: readonly Job[], reported: readonly string[], cap = 50) {
  const fresh = failed.filter((j) => !reported.includes(j.id));
  return { fresh, reported: [...reported, ...fresh.map((j) => j.id)].slice(-cap) };
}

/**
 * Failure notes to show as "failed imports": those that no job knows (by the path it remembers, by the job ID in
 * the note, or as a run it replaced) and whose job ID no real recipe carries (then the run did deliver).
 */
export function orphanFailures<R extends { path: string; job?: string }>(
  failures: R[],
  jobs: readonly Job[],
  recipes: readonly { job?: string }[] = [],
): R[] {
  return failures.filter(
    (f) =>
      !jobs.some(
        (a) =>
          a.failedNote === f.path ||
          (!!f.job && a.id === f.job) ||
          a.retryOf?.some((o) => o.note === f.path || (!!f.job && o.job === f.job)),
      ) && !(f.job && recipes.some((r) => r.job === f.job)),
  );
}

/**
 * The jobs after "Retry" was accepted: `old` is gone, and the new job (`newId`, and only that one) remembers the old
 * run and the runs it had replaced, so their failure notes stay hidden while it is open.
 */
export function replaceJob(jobs: Job[], old: Job, newId: string): Job[] {
  const retryOf = [...(old.retryOf ?? []), { job: old.id, note: old.failedNote }];
  return jobs.flatMap((a) => (a.id === old.id ? [] : a.id === newId ? [{ ...a, retryOf }] : [a]));
}
