// The start of a social media import in the plugin (issue #87, ADR 0005): which way the link takes (src/socialFlow.ts),
// the local reading (src/socialImport.ts) and what comes of it for the caller. For a first version (#133, ADR 0007) it
// also reserves the improvement job before the note is written, sends it afterwards, and closes the note if that fails.
// Depends on Obsidian through the plugin.
import { Notice } from "obsidian";
import type BetterCookingPlugin from "./main";
import type { Detection } from "./source";
import type { NoteFormat } from "./noteFormat";
import { newJob, newJobId, processorName, type ActiveProcessor } from "./processor";
import type { ImportResult } from "./types";
import { closeUnimproved, rebindJob, upsertJob } from "./improve";
import { SESSION_ID, findTarget, writeIfChanged } from "./improveTarget";
import { deviceId } from "./importSyncService";
import { noticeWithAction } from "./notice";
import { AI_KEY_ID } from "./ai";
import { readPageLocally } from "./extraProperties";
import { savedMessage, type Saved } from "./localImport";
import { fallbackAfter } from "./socialFlow";
import { importSocial } from "./socialImport";
import { tr } from "./i18n";

/**
 * Social media link (src/socialFlow.ts): the plugin reads the post itself unless Claude or GitHub were chosen on
 * purpose and "Erste Fassung sofort" is off. Gives the final answer (`done`), or the processor that takes over (with
 * the local reason after a failed reading), or undefined for anything that is no social media link.
 */
export async function importSocialPost(
  p: BetterCookingPlugin,
  e: Detection,
  info: ReturnType<BetterCookingPlugin["processorInfo"]>,
  format: NoteFormat,
  recipes: { source?: string }[],
): Promise<{ done: ImportResult } | { processor: ActiveProcessor | null; failure?: string } | undefined> {
  const route = info.route(e.kind);
  if (!route) return undefined;
  if (route.via === "facebook") return { done: { ok: false, message: tr("socialFacebook") } };
  if (route.via === "processor") return { processor: route.processor };
  // Only a route with a rule for a first version has a job for it.
  const processor = route.run ? route.fallback : null;
  const job = processor ? newJobId() : undefined;
  let reserved: string | undefined;
  try {
    const r = await importSocial(
      {
        app: p.app,
        folder: p.settings.folder,
        format,
        extraProperties: p.extraProperties(format),
        ai: route.ai ? { settings: p.ai(), key: p.secret(AI_KEY_ID) } : undefined,
        recipes,
        followLinks: readPageLocally(p.settings.readWebsitesLocally, !!info.active),
        fallback: !!route.fallback,
        run: route.run,
        job,
        reserve: async (id) => {
          if (!processor) return;
          await reserve(p, e, processor, id);
          reserved = id;
        },
      },
      e,
    );
    if (!r.ok) {
      const next = fallbackAfter(route.fallback, r.why, route.chosen);
      return next ? { processor: next, failure: r.detail } : { done: r };
    }
    if (r.firstVersion && job && processor)
      return { done: await startImprovement(p, e, r.saved, { job, processor, format }) };
    // A cover address is remembered for "Fetch again", which only works for recipe websites.
    if (r.how === "website") await p.rememberCover(r.saved.path, r.saved.coverUrl);
    const message = r.how === "rules" ? tr("savedFromText", { title: r.saved.title }) : savedMessage(r.saved);
    return { done: { ok: true, message } };
  } catch (err) {
    // Reserved, then something threw (the note could not be written, the request): nobody will improve the note.
    if (reserved) await release(p, reserved, format, tr("improveNotStarted", { why: errorText(err) }));
    throw err;
  }
}

const errorText = (err: unknown) => (err instanceof Error ? err.message.slice(0, 80) : tr("unknown"));

/**
 * The job is remembered before its note is written (#133): a note that says "offen" is never without an open job, not
 * even for the moment of the request, and a crash in between leaves a reservation of this session that the next start
 * cleans up (`cleanupStarting`, src/improveTarget.ts).
 */
async function reserve(p: BetterCookingPlugin, e: Detection, processor: "claude" | "github", id: string) {
  const job = {
    ...newJob({ id, input: e.url ?? "", improve: true }, e, processor, deviceId(p.app), undefined),
    starting: SESSION_ID,
  };
  await p.save({ jobs: upsertJob(p.settings.jobs, job) });
}

/** The reservation goes, and the note (at `path`, or found by the job ID) is closed in the state it has without a job. */
async function release(p: BetterCookingPlugin, id: string, format: NoteFormat, reason: string, path?: string) {
  await p.save({ jobs: p.settings.jobs.filter((j) => j.id !== id) });
  const file = path ? p.app.vault.getFileByPath(path) : (await findTarget(p, id, true))?.file;
  if (file) await writeIfChanged(p, file, (t) => closeUnimproved(t, id, reason, format));
}

/**
 * The first version is written; now the improvement job is sent with the ID that the note carries. If the request
 * fails, nobody improves the note: the reservation goes, the note is closed at once (src/improve.ts `closeUnimproved`),
 * the answer is a warning, and a notice offers "Retry".
 */
async function startImprovement(
  p: BetterCookingPlugin,
  e: Detection,
  saved: Saved,
  o: { job: string; processor: "claude" | "github"; format: NoteFormat },
): Promise<ImportResult> {
  const processor = processorName(o.processor);
  const sent = await p.sendJob(e, e.url ?? "", o.processor, undefined, { id: o.job });
  if (sent.ok) return { ok: true, message: tr("firstVersionSaved", { title: saved.title, processor }) };
  const why = sent.message ?? tr("unknown");
  await release(p, o.job, o.format, tr("improveNotStarted", { why }), saved.path);
  // The dialog gets the message; the notice only offers the retry.
  noticeWithAction(
    tr("improveRetryAsk", { processor }),
    {
      label: tr("retry"),
      run: () => void retryStart(p, e, saved, o).catch(() => new Notice(tr("improveRetryFailed"))),
    },
    15000,
  );
  return { ok: true, warning: true, message: tr("firstVersionNoJob", { title: saved.title, processor, why }) };
}

/**
 * "Retry" in the notice after a failed start: a new run with a new job ID. The note gets the new ID (and `offen`) first;
 * only if that was written the job is sent, otherwise the note was changed meanwhile and nothing is started.
 */
async function retryStart(
  p: BetterCookingPlugin,
  e: Detection,
  saved: Saved,
  o: { job: string; processor: "claude" | "github"; format: NoteFormat },
) {
  const file = p.app.vault.getFileByPath(saved.path);
  const next = newJobId();
  if (!file) return void new Notice(tr("improveRetryChanged"));
  await reserve(p, e, o.processor, next);
  const written = await writeIfChanged(p, file, (t) => rebindJob(t, o.format, o.job, next));
  if (!written) {
    await p.save({ jobs: p.settings.jobs.filter((j) => j.id !== next) });
    new Notice(tr("improveRetryChanged"));
    return;
  }
  new Notice((await startImprovement(p, e, saved, { ...o, job: next })).message ?? "", 8000);
}
