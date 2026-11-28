// What the import cards and the import dialog can do with a job; the host (src/view.ts, dev/preview.tsx) provides it.
import type { SyncReport } from "../importSync";
import { failureNotesOf } from "../importFailure";
import type { Job } from "../types";

export interface JobActions<R = void> {
  /** Drop the job from the cards (the processor's run is not stopped). */
  onJobGone: (id: string) => void;
  /** Start the job again (same input) and remove the old one. */
  onRetry: (id: string) => Promise<R>;
  /** The button "Pull now"; unset without the Git plugin. */
  onSyncNow?: () => Promise<SyncReport>;
  /** "Remove" on a failed job: deletes its failure notes and drops the job. */
  onRemoveFailed?: (id: string) => void | Promise<void>;
  /** "Remove" on a failure note without an open job (path, job ID in the note). */
  onRemoveFailure?: (path: string, job: string) => void | Promise<void>;
}

/** A job that has failure notes to answer for is removed with a question that names them, not with the plain "x". */
export const removable = (a: Job, actions: JobActions): boolean =>
  !!actions.onRemoveFailed && failureNotesOf(a).length > 0;
