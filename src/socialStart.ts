// The start of a social media import in the plugin (issue #87, ADR 0005): which way the link takes (src/socialFlow.ts),
// the local reading (src/socialImport.ts) and what comes of it for the caller. Depends on Obsidian through the plugin.
import type BetterCookingPlugin from "./main";
import type { Detection } from "./source";
import type { NoteFormat } from "./noteFormat";
import { newJobId, processorName, type ActiveProcessor } from "./processor";
import { markImproveFailed } from "./improve";
import { writeIfChanged } from "./improveTarget";
import type { Saved } from "./localImport";
import { AI_KEY_ID } from "./ai";
import { readPageLocally } from "./extraProperties";
import { savedMessage } from "./localImport";
import { fallbackAfter } from "./socialFlow";
import { importSocial } from "./socialImport";
import { tr } from "./i18n";

/**
 * Social media link (src/socialFlow.ts): the plugin reads the post itself unless Claude or GitHub were chosen on
 * purpose. Gives the final answer (`done`), or the processor that takes over (with the local reason after a
 * failed reading), or undefined for anything that is no social media link.
 */
export async function importSocialPost(
  p: BetterCookingPlugin,
  e: Detection,
  info: ReturnType<BetterCookingPlugin["processorInfo"]>,
  format: NoteFormat,
  recipes: { source?: string }[],
): Promise<
  { done: { ok: boolean; message?: string } } | { processor: ActiveProcessor | null; failure?: string } | undefined
> {
  const route = info.route(e.kind);
  if (!route) return undefined;
  if (route.via === "facebook") return { done: { ok: false, message: tr("socialFacebook") } };
  if (route.via === "processor") return { processor: route.processor };
  // A processor is set up: what the plugin reads is only a first version, and this job improves it (ADR 0007, #133).
  const job = route.fallback ? newJobId() : undefined;
  const r = await importSocial(
    {
      app: p.app,
      folder: p.settings.folder,
      format,
      extraProperties: p.extraProperties(format),
      ai: route.ai ? { settings: p.ai(), key: p.secret(AI_KEY_ID) } : undefined,
      recipes,
      followLinks: readPageLocally(p.settings.readWebsitesLocally, !!info.active),
      job,
    },
    e,
  );
  if (!r.ok) {
    const next = fallbackAfter(route.fallback, r.why, route.chosen);
    return next ? { processor: next, failure: r.detail } : { done: r };
  }
  if (r.firstVersion && job && route.fallback)
    return { done: await startImprovement(p, e, r.saved, { job, processor: route.fallback, format }) };
  // A cover address is remembered for "Fetch again", which only works for recipe websites.
  if (r.how === "website") await p.rememberCover(r.saved.path, r.saved.coverUrl);
  const message = r.how === "rules" ? tr("savedFromText", { title: r.saved.title }) : savedMessage(r.saved);
  return { done: { ok: true, message } };
}

/**
 * The first version is written; now the improvement job starts with the ID that the note carries. If the request
 * fails, nobody improves the note: it is closed at once as "teilweise" with the reason (compare-and-set on the job ID
 * and "offen"), and the user is told.
 */
async function startImprovement(
  p: BetterCookingPlugin,
  e: Detection,
  saved: Saved,
  o: { job: string; processor: "claude" | "github"; format: NoteFormat },
): Promise<{ ok: true; message: string }> {
  const processor = processorName(o.processor);
  // The note says "offen" before the job is remembered: it is not shown as stale for that moment.
  p.improve.starting.add(o.job);
  try {
    const sent = await p.sendJob(e, e.url ?? "", o.processor, undefined, { id: o.job });
    if (sent.ok) return { ok: true, message: tr("firstVersionSaved", { title: saved.title, processor }) };
    const file = p.app.vault.getFileByPath(saved.path);
    const reason = tr("improveNotStarted", { why: sent.message ?? tr("unknown") });
    if (file) await writeIfChanged(p, file, (t) => markImproveFailed(t, o.job, reason, o.format));
    return { ok: true, message: tr("firstVersionNoJob", { title: saved.title, processor, why: sent.message ?? "" }) };
  } finally {
    p.improve.starting.delete(o.job);
  }
}
