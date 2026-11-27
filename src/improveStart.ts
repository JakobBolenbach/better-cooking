// The one way an improvement job starts (ADR 0007): for a first version (#133), for feedback on a finished note (#120)
// and for "Retry" of an improvement. The job is reserved first (`Job.starting`, so a note that says "offen" is never
// without a job), the note gets the job ID and "offen" (compare-and-set; a first version is written with them), then
// the request is sent. Accepted: the real job takes the reservation's place. Clearly refused: the reservation goes and
// the note is closed (`closeUnimproved`). No answer at all (it may have arrived): the reservation becomes a normal job
// marked `unsure`, so the time limit and "Retry" apply. Depends on Obsidian through the plugin.
import type { TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import type { Detection } from "./source";
import type { NoteFormat } from "./noteFormat";
import { newJob, newJobId, processorName } from "./processor";
import { replaceJob } from "./importFailure";
import { closeUnimproved, rebindJob, upsertJob } from "./improve";
import { SESSION_ID, findTarget, writeIfChanged } from "./improveTarget";
import { deviceId } from "./importSyncService";
import { tr } from "./i18n";
import type { Job } from "./types";

/** What is needed to start: the source to send, the processor, and the job ID (new, or the one a first version carries). */
export interface StartRequest {
  e: Detection;
  input: string;
  processor: "claude" | "github";
  format: NoteFormat;
  id: string;
  /** The user's feedback (#120). */
  feedback?: string;
}

/** `unsure`: no answer, the job may have arrived; it is a normal job now (the message says so). */
export type Started = { ok: boolean; message: string; unsure?: true; job?: string };

const withoutStarting = (j: Job): Job => {
  const { starting: _gone, ...rest } = j;
  return rest;
};

/**
 * The job is remembered before the note is written or bound and before the request is sent: a note that says "offen"
 * is never without an open job, and a crash in between leaves a reservation of this session that the next start cleans
 * up (`cleanupStarting`, src/improveTarget.ts).
 */
export async function reserve(p: BetterCookingPlugin, r: Omit<StartRequest, "format">) {
  const job = {
    ...newJob(
      { id: r.id, input: r.e.url ?? r.input, improve: true, feedback: r.feedback },
      r.e,
      r.processor,
      deviceId(p.app),
      undefined,
    ),
    starting: SESSION_ID,
  };
  await p.save({ jobs: upsertJob(p.settings.jobs, job) });
}

/** The reservation goes, and the note (at `path`, or found by the job ID) is closed in the state it has without a job. */
export async function release(p: BetterCookingPlugin, id: string, format: NoteFormat, reason: string, path?: string) {
  await p.save({ jobs: p.settings.jobs.filter((j) => j.id !== id) });
  const file = path ? p.app.vault.getFileByPath(path) : (await findTarget(p, id, true))?.file;
  if (file) await writeIfChanged(p, file, (t) => closeUnimproved(t, id, reason, format));
}

/**
 * Sends the reserved job and settles it (see the top of the file). `earlier`: a failed or timed-out run that this one
 * replaces like a retry (the old job goes, `retryOf` remembers it). `path`: the note, for the close after a refusal.
 */
export async function sendReserved(
  p: BetterCookingPlugin,
  r: StartRequest & { earlier?: Job; path?: string },
): Promise<Started> {
  const processor = processorName(r.processor);
  const sent = await p.sendJob(r.e, r.input, r.processor, undefined, { id: r.id, feedback: r.feedback });
  const swap = (jobs: Job[]) => (r.earlier ? replaceJob(jobs, r.earlier, r.id) : jobs);
  if (sent.ok) {
    if (r.earlier) await p.save({ jobs: swap(p.settings.jobs) });
    return { ok: true, message: sent.message ?? "", job: r.id };
  }
  const why = sent.message ?? tr("unknown");
  if (sent.unsure) {
    const jobs = p.settings.jobs.map((j) => (j.id === r.id ? { ...withoutStarting(j), unsure: true as const } : j));
    await p.save({ jobs: swap(jobs) });
    return { ok: true, unsure: true, message: tr("improveUnsure", { processor, why }), job: r.id };
  }
  await release(p, r.id, r.format, tr("improveNotStarted", { why }), r.path);
  return { ok: false, message: why };
}

/**
 * A new run on a note that exists (feedback, "Retry"): reserve, bind the note by compare-and-set (`expected`: the job ID
 * it carries now, none for a note without one), send. If the note changed meanwhile nothing is started.
 */
export async function startOnNote(
  p: BetterCookingPlugin,
  o: Omit<StartRequest, "id"> & { file: TFile; expected?: string; earlier?: Job },
): Promise<Started> {
  const id = newJobId();
  await reserve(p, { ...o, id });
  const bound = await writeIfChanged(p, o.file, (t) => rebindJob(t, o.format, o.expected, id));
  if (!bound) {
    await p.save({ jobs: p.settings.jobs.filter((j) => j.id !== id) });
    return { ok: false, message: tr("improveRetryChanged") };
  }
  return sendReserved(p, { ...o, id, path: o.file.path });
}
