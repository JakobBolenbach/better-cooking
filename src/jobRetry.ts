// "Retry" of a job (the one place; src/main.ts only hands over). A normal job is sent again with the same input and
// replaced by the new one. An improvement job (ADR 0007) starts a new run on its note with the common start
// (src/improveStart.ts): new job ID, the note's `auftrag` follows and it says "offen" again, the old job goes
// (`retryOf`, so a late proposal of the old ID is dropped).
import type BetterCookingPlugin from "./main";
import { replaceJob } from "./importFailure";
import { startOnNote } from "./improveStart";
import { findTarget } from "./improveTarget";
import { processorName } from "./processor";
import { detectSource } from "./source";
import { tr } from "./i18n";

/** Jobs whose retry is on its way: a second tap while the first request is on its way does nothing. */
const retrying = new Set<string>();

export async function retryJob(p: BetterCookingPlugin, id: string): Promise<{ ok: boolean; message?: string }> {
  const old = p.settings.jobs.find((a) => a.id === id);
  if (!old) return { ok: false, message: tr("jobGone") };
  if (retrying.has(id)) return { ok: true };
  retrying.add(id);
  try {
    // A job goes to the same processor again; the way of the plugin is not tried a second time.
    if (!p.processorInfo().ready[old.processor])
      return { ok: false, message: tr("chosenNotReady", { chosen: processorName(old.processor) }) };
    const e = detectSource(old.input);
    if (old.improve) {
      // The note has to carry the job ID still, otherwise the new run would improve nothing.
      const target = await findTarget(p, old.id, true);
      if (!target) return { ok: false, message: tr("retryNoNote") };
      const r = await startOnNote(p, {
        file: target.file,
        expected: old.id,
        earlier: old,
        e,
        input: old.input,
        processor: old.processor,
        feedback: old.feedback,
        format: p.noteFormat(),
      });
      // "Unsure" counts as sent: the job exists, the message says it is unclear.
      return { ok: r.ok, message: r.message };
    }
    const r = await p.sendJob(e, old.input, old.processor, old.local);
    if (r.ok && r.job) await p.save({ jobs: replaceJob(p.settings.jobs, old, r.job) });
    return r;
  } finally {
    retrying.delete(id);
  }
}
