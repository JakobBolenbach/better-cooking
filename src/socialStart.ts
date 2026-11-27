// The start of a social media import in the plugin (issue #87, ADR 0005): which way the link takes (src/socialFlow.ts),
// the local reading (src/socialImport.ts) and what comes of it for the caller. For a first version (#133, ADR 0007) it
// also reserves the improvement job before the note is written, sends it afterwards, and closes the note if that fails.
// Depends on Obsidian through the plugin.
import { Notice } from "obsidian";
import type BetterCookingPlugin from "./main";
import type { Detection } from "./source";
import type { NoteFormat } from "./noteFormat";
import { newJobId, processorName, type ActiveProcessor } from "./processor";
import type { ImportResult, LocalMiss } from "./types";
import { release, reserve, sendReserved, startOnNote } from "./improveStart";
import { noticeWithAction } from "./notice";
import { AI_KEY_ID } from "./ai";
import { readPageLocally } from "./extraProperties";
import { savedMessage, type Saved } from "./localImport";
import { fallbackAfter } from "./socialFlow";
import { localMiss } from "./socialOutcome";
import { importSocial } from "./socialImport";
import { tr } from "./i18n";

/**
 * Social media link (src/socialFlow.ts): the plugin reads the post itself unless Claude or GitHub were chosen on
 * purpose and "Erste Fassung sofort" is off. Gives the final answer (`done`), or the processor that takes over (with
 * the local reason after a failed reading, #156), or undefined for anything that is no social media link.
 */
export async function importSocialPost(
  p: BetterCookingPlugin,
  e: Detection,
  info: ReturnType<BetterCookingPlugin["processorInfo"]>,
  format: NoteFormat,
  recipes: { source?: string }[],
): Promise<{ done: ImportResult } | { processor: ActiveProcessor | null; local?: LocalMiss } | undefined> {
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
          await reserve(p, { e, input: e.url ?? "", processor, id });
          reserved = id;
        },
      },
      e,
    );
    if (!r.ok) {
      const next = fallbackAfter(route.fallback, r.why, route.chosen);
      return next ? { processor: next, local: localMiss(r.why, !!route.run) } : { done: r };
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
  const sent = await sendReserved(p, {
    e,
    input: e.url ?? "",
    processor: o.processor,
    format: o.format,
    id: o.job,
    path: saved.path,
  });
  if (sent.unsure) return { ok: true, warning: true, message: sent.message };
  if (sent.ok) return { ok: true, message: tr("firstVersionSaved", { title: saved.title, processor }) };
  // The dialog gets the message; the notice only offers the retry.
  noticeWithAction(
    tr("improveRetryAsk", { processor }),
    {
      label: tr("retry"),
      run: () => void retryStart(p, e, saved, o).catch(() => new Notice(tr("improveRetryFailed"))),
    },
    15000,
  );
  return {
    ok: true,
    warning: true,
    message: tr("firstVersionNoJob", { title: saved.title, processor, why: sent.message }),
  };
}

/**
 * "Retry" in the notice after a failed start: a new run with a new job ID on the note, with the common start (it is
 * bound by compare-and-set on the ID it carries; if it was changed meanwhile nothing is started).
 */
async function retryStart(
  p: BetterCookingPlugin,
  e: Detection,
  saved: Saved,
  o: { job: string; processor: "claude" | "github"; format: NoteFormat },
) {
  const file = p.app.vault.getFileByPath(saved.path);
  if (!file) return void new Notice(tr("improveRetryChanged"));
  const r = await startOnNote(p, {
    file,
    expected: o.job,
    e,
    input: e.url ?? "",
    processor: o.processor,
    format: o.format,
  });
  new Notice(r.message, 8000);
}
