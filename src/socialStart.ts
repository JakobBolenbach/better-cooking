// The start of a social media import in the plugin (issue #87, ADR 0005): which way the link takes (src/socialFlow.ts),
// the local reading (src/socialImport.ts) and what comes of it for the caller. For a first version (#133, ADR 0007) it
// also reserves the improvement job before the note is written, sends it afterwards, and closes the note if that fails.
// Depends on Obsidian through the plugin.
import type BetterCookingPlugin from "./main";
import type { Detection } from "./source";
import type { NoteFormat } from "./noteFormat";
import { newJob, newJobId, processorName, type ActiveProcessor } from "./processor";
import { closeUnimproved, rebindJob, upsertJob } from "./improve";
import { writeIfChanged } from "./improveTarget";
import { deviceId } from "./importSyncService";
import { noticeWithAction } from "./notice";
import { AI_KEY_ID } from "./ai";
import { readPageLocally } from "./extraProperties";
import { savedMessage, type Saved } from "./localImport";
import { fallbackAfter } from "./socialFlow";
import { importSocial } from "./socialImport";
import { tr } from "./i18n";

type Done = { ok: boolean; message?: string };

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
): Promise<{ done: Done } | { processor: ActiveProcessor | null; failure?: string } | undefined> {
  const route = info.route(e.kind);
  if (!route) return undefined;
  if (route.via === "facebook") return { done: { ok: false, message: tr("socialFacebook") } };
  if (route.via === "processor") return { processor: route.processor };
  const processor = route.fallback;
  const job = processor ? newJobId() : undefined;
  const r = await importSocial(
    {
      app: p.app,
      folder: p.settings.folder,
      format,
      extraProperties: p.extraProperties(format),
      ai: route.ai ? { settings: p.ai(), key: p.secret(AI_KEY_ID) } : undefined,
      recipes,
      followLinks: readPageLocally(p.settings.readWebsitesLocally, !!info.active),
      fallback: !!processor,
      run: route.run,
      job,
      reserve: (id) => (processor ? reserve(p, e, processor, id) : Promise.resolve()),
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
}

/**
 * The job is remembered before its note is written (#133): a note that says "offen" is never without an open job, not
 * even for the moment of the request, and a crash in between leaves a job that the next start cleans up.
 */
async function reserve(p: BetterCookingPlugin, e: Detection, processor: "claude" | "github", id: string) {
  const job = {
    ...newJob({ id, input: e.url ?? "", improve: true }, e, processor, deviceId(p.app), undefined),
    starting: true as const,
  };
  await p.save({ jobs: upsertJob(p.settings.jobs, job) });
}

/**
 * The first version is written; now the improvement job is sent with the ID that the note carries. If the request
 * fails, nobody improves the note: the reservation goes, the note is closed at once in the state it has without a job
 * (src/improve.ts `closeUnimproved`), and the notice offers "Retry".
 */
async function startImprovement(
  p: BetterCookingPlugin,
  e: Detection,
  saved: Saved,
  o: { job: string; processor: "claude" | "github"; format: NoteFormat },
): Promise<{ ok: true; message: string }> {
  const processor = processorName(o.processor);
  const sent = await p.sendJob(e, e.url ?? "", o.processor, undefined, { id: o.job });
  if (sent.ok) return { ok: true, message: tr("firstVersionSaved", { title: saved.title, processor }) };
  await p.save({ jobs: p.settings.jobs.filter((j) => j.id !== o.job) });
  const file = p.app.vault.getFileByPath(saved.path);
  const reason = tr("improveNotStarted", { why: sent.message ?? tr("unknown") });
  if (file) await writeIfChanged(p, file, (t) => closeUnimproved(t, o.job, reason, o.format));
  const message = tr("firstVersionNoJob", { title: saved.title, processor, why: sent.message ?? "" });
  noticeWithAction(message, { label: tr("retry"), run: () => void retryStart(p, e, saved, o) }, 15000);
  return { ok: true, message };
}

/** "Retry" in the notice after a failed start: a new run with a new job ID; the note gets it and looks like a first version again. */
async function retryStart(
  p: BetterCookingPlugin,
  e: Detection,
  saved: Saved,
  o: { job: string; processor: "claude" | "github"; format: NoteFormat },
) {
  const file = p.app.vault.getFileByPath(saved.path);
  const next = newJobId();
  if (!file) return;
  // The note must still carry the old ID (and "offen" is set again by the rebind); otherwise it was changed and nothing is started.
  const read = await p.app.vault.cachedRead(file);
  if (rebindJob(read, o.format, o.job, next) === null) return;
  await reserve(p, e, o.processor, next);
  await writeIfChanged(p, file, (t) => rebindJob(t, o.format, o.job, next));
  await startImprovement(p, e, saved, { ...o, job: next });
}
