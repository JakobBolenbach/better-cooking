// How a social media link is imported (issue #87, ADR 0005): which way for which processor setting, which address
// and which headers the one request uses, and the text that goes on to the rules or the own AI.
// Pure functions without Obsidian, tested in tests/socialFlow.test.ts.

import { SOCIAL_KINDS, type Detection, type Kind } from "./source";
import { isPublicAddress } from "./network";
import type { ActiveProcessor, Processor, Ready } from "./processor";
import type { SchemaRecipe } from "./schemaorg";
import type { SocialPage } from "./socialPage";
import { MAX_LINKS } from "./socialText";

export const isSocial = (kind: Kind) => SOCIAL_KINDS.includes(kind);

/**
 * The way for a social media link:
 *  - `processor`: a processor takes over Facebook, or Claude or GitHub were chosen but are not set up (null, the
 *    caller says so);
 *  - `local`: the plugin reads the public page itself and goes on like pasted text; `ai`: the text goes to the own
 *    AI (set up, and not "none"), otherwise to the offline rules; `fallback`: the processor that comes after it (only
 *    with "Automatic" or when Claude or GitHub were chosen, never with "own AI" or "none"): a recipe found here is a
 *    first version that it improves (ADR 0007, #133), and it takes over if nothing was found. `chosen`: Claude or
 *    GitHub were chosen on purpose, so every failure of the local reading goes to the processor, the own AI is not
 *    asked;
 *  - `facebook`: Facebook shows posts only to logged-in users, nothing to read here; the user pastes the text.
 */
export type SocialRoute =
  | { via: "processor"; processor: ActiveProcessor | null }
  | { via: "local"; ai: boolean; fallback: "claude" | "github" | null; chosen?: true; run?: RunRule }
  | { via: "facebook" };

/**
 * When a first version is followed by an improvement job (ADR 0007, #133): `always` with Claude or GitHub chosen on
 * purpose; `partial` with "Automatic" only if the local result is incomplete (only ingredients or only steps), so a
 * complete one costs no run. Absent: no first version (the setting "Erste Fassung sofort" is off, or no processor).
 */
export type RunRule = "always" | "partial";

/**
 * Route for a social media kind; null for anything else (websites, pasted text). `instant` is the setting "Erste Fassung
 * sofort aus dem Beitrag": off, a processor chosen on purpose gets the link without a local reading and "Automatic" behaves as before #133.
 */
export function socialRoute(kind: Kind, chosen: Processor, ready: Ready, instant = true): SocialRoute | null {
  if (!isSocial(kind)) return null;
  if (chosen === "claude" || chosen === "github") {
    if (!ready[chosen] || kind === "facebook" || !instant)
      return { via: "processor", processor: ready[chosen] ? chosen : null };
    return { via: "local", ai: false, fallback: chosen, chosen: true, run: "always" };
  }
  const fallback = chosen === "auto" ? (ready.claude ? "claude" : ready.github ? "github" : null) : null;
  if (kind === "facebook") return fallback ? { via: "processor", processor: fallback } : { via: "facebook" };
  const ai = ready.ai && (chosen === "ai" || chosen === "auto");
  return { via: "local", ai, fallback, ...(fallback && instant ? { run: "partial" as const } : {}) };
}

/** Why a local import failed: no recipe in it, the page could not be read, the own AI failed technically, or the recipe is saved already. */
export type FailReason = "noRecipe" | "unreadable" | "technical" | "duplicate";

/**
 * The processor that takes over after a local failure: only if the way has a fallback ("Automatic" or a chosen
 * processor that is set up) and only when there was nothing to read or no recipe in it. A technical failure of the own AI (key
 * rejected, rate limit, no connection) would only repeat at the processor, so the user sees the message instead; a duplicate is no failure to repair either.
 * With a processor chosen on purpose (`chosen`) the processor takes over after every failure but a duplicate: the page
 * that the plugin could not reach may still be reachable for the processor.
 */
export const fallbackAfter = (fallback: "claude" | "github" | null, why: FailReason, chosen = false) =>
  why === "noRecipe" || why === "unreadable" || (chosen && why === "technical") ? fallback : null;

/** A caption with ingredients and steps is a recipe in itself: no link is followed then. */
export const captionIsRecipe = (r: SchemaRecipe | undefined) => !!r && r.ingredients.length > 0 && r.steps.length > 0;

/**
 * What to try after the page was read, in this order: the links in the post (up to MAX_LINKS, only public addresses
 * of other sites, never short links or platforms) that may lead to a website with a recipe, then the post's text.
 * No link is looked at if the caption already holds a recipe (`captionRecipe`) or if reading websites in the plugin
 * is switched off while a processor is set up (`followLinks`, the setting "Rezeptseiten selbst lesen").
 */
export function socialPlan(
  page: SocialPage,
  captionRecipe: SchemaRecipe | undefined,
  followLinks = true,
): { links: string[]; text: boolean } {
  const skip = captionIsRecipe(captionRecipe) || !followLinks;
  const links = skip ? [] : (page.links ?? []).slice(0, MAX_LINKS).filter(isPublicAddress);
  return { links, text: !!page.text };
}

/** The text that goes to the rules or the AI: a video title (YouTube) is the first line, so it becomes the recipe title. */
export function socialText(page: SocialPage): string {
  return page.title ? `${page.title}\n\n${page.text}` : page.text;
}

const SAFARI_MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/**
 * The post's ID, to check it against the page: Instagram code, TikTok video number, YouTube video ID (all from the
 * key of src/source.ts) or the Pinterest pin number; undefined where the address has none (short links, pin.it).
 */
export function postId(e: Detection): string | undefined {
  if (e.kind === "pinterest") return /\/pin\/(?:[^/?#]*--)?(\d+)/.exec(e.url ?? "")?.[1];
  const prefix = `${e.kind}:`;
  return ["instagram", "tiktok", "youtube"].includes(e.kind) && e.key?.startsWith(prefix)
    ? e.key.slice(prefix.length)
    : undefined;
}

/**
 * Address of the page to read: for Instagram and YouTube rebuilt from the key (platform plus ID, see keyFrom in
 * src/source.ts: no user prefix, no tracking), otherwise the normalized address; undefined for Facebook and for links that are no post (a profile).
 */
export function socialPageUrl(e: Detection): string | undefined {
  const key = e.key ?? "";
  if (e.kind === "instagram")
    return key.startsWith("instagram:") ? `https://www.instagram.com/p/${key.slice(10)}/` : undefined;
  if (e.kind === "youtube")
    return key.startsWith("youtube:")
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(key.slice(8))}`
      : undefined;
  return e.kind === "facebook" ? undefined : e.url;
}

/** The second address for Instagram if the post page has no caption. */
export const instagramEmbedUrl = (pageUrl: string) => `${pageUrl.replace(/\/+$/, "")}/embed/captioned/`;

/**
 * Headers of the request. Instagram answers with the caption only to a request that looks like a navigation of a
 * mobile browser (tested 26.11.2026, ADR 0005), so it gets a mobile Safari user agent and `Sec-Fetch-Mode: navigate`.
 * Other platforms get a plain request. No cookies, no login, no tokens, for none of them.
 */
export function socialHeaders(kind: Kind): Record<string, string> {
  const base = { Accept: "text/html,application/xhtml+xml" };
  return kind === "instagram" ? { ...base, "User-Agent": SAFARI_MOBILE, "Sec-Fetch-Mode": "navigate" } : base;
}
