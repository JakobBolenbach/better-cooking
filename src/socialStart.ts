// The start of a social media import in the plugin (issue #87, ADR 0005): which way the link takes (src/socialFlow.ts),
// the local reading (src/socialImport.ts) and what comes of it for the caller. Depends on Obsidian through the plugin.
import type BetterCookingPlugin from "./main";
import type { Detection } from "./source";
import type { NoteFormat } from "./noteFormat";
import type { ActiveProcessor } from "./processor";
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
    },
    e,
  );
  if (!r.ok) {
    const next = fallbackAfter(route.fallback, r.why);
    return next ? { processor: next, failure: r.detail } : { done: r };
  }
  // A cover address is remembered for "Fetch again", which only works for recipe websites.
  if (r.how === "website") await p.rememberCover(r.saved.path, r.saved.coverUrl);
  const message = r.how === "rules" ? tr("savedFromText", { title: r.saved.title }) : savedMessage(r.saved);
  return { done: { ok: true, message } };
}
