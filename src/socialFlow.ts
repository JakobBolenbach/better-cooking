// How a social media link is imported (issue #87, ADR 0005): which way for which processor setting, which address
// and which headers the one request uses, and the text that goes on to the rules or the own AI.
// Pure functions without Obsidian, tested in tests/socialFlow.test.ts.

import { SOCIAL_KINDS, type Detection, type Kind } from "./source";
import { isPublicAddress } from "./network";
import type { ActiveProcessor, Processor, Ready } from "./processor";
import type { SchemaRecipe } from "./schemaorg";
import type { SocialPage } from "./socialPage";

export const isSocial = (kind: Kind) => SOCIAL_KINDS.includes(kind);

/**
 * The way for a social media link:
 *  - `processor`: Claude or GitHub were chosen on purpose, or take over for Facebook (null: chosen but not set up,
 *    the caller says so);
 *  - `local`: the plugin reads the public page itself and goes on like pasted text; `ai`: the text goes to the own
 *    AI (set up, and not "none"), otherwise to the offline rules; `fallback`: the processor that takes over if the
 *    page gives no recipe (only with "Automatic", never when the user chose "own AI" or "none");
 *  - `facebook`: Facebook shows posts only to logged-in users, nothing to read here; the user pastes the text.
 */
export type SocialRoute =
  | { via: "processor"; processor: ActiveProcessor | null }
  | { via: "local"; ai: boolean; fallback: "claude" | "github" | null }
  | { via: "facebook" };

/** Route for a social media kind; null for anything else (websites, pasted text). */
export function socialRoute(kind: Kind, chosen: Processor, ready: Ready): SocialRoute | null {
  if (!isSocial(kind)) return null;
  if (chosen === "claude" || chosen === "github") return { via: "processor", processor: ready[chosen] ? chosen : null };
  const fallback = chosen === "auto" ? (ready.claude ? "claude" : ready.github ? "github" : null) : null;
  if (kind === "facebook") return fallback ? { via: "processor", processor: fallback } : { via: "facebook" };
  return { via: "local", ai: ready.ai && (chosen === "ai" || chosen === "auto"), fallback };
}

/** Why a local import failed: no recipe in it, the page could not be read, the own AI failed technically, or the recipe is saved already. */
export type FailReason = "noRecipe" | "unreadable" | "technical" | "duplicate";

/**
 * The processor that takes over after a local failure: only if the way has a fallback ("Automatic" with Claude or
 * GitHub set up) and only when there was nothing to read or no recipe in it. A technical failure of the own AI (key
 * rejected, rate limit, no connection) would only repeat at the processor, so the user sees the message instead; a duplicate is no failure to repair either.
 */
export const fallbackAfter = (fallback: "claude" | "github" | null, why: FailReason) =>
  why === "noRecipe" || why === "unreadable" ? fallback : null;

/** A caption with ingredients and steps is a recipe in itself: no link is followed then. */
export const captionIsRecipe = (r: SchemaRecipe | undefined) => !!r && r.ingredients.length > 0 && r.steps.length > 0;

/**
 * What to try after the page was read, in this order: the links in the post (up to three, only public addresses
 * of other sites, never short links or platforms) that may lead to a website with a recipe, then the post's text.
 * If the caption already holds a recipe (`captionRecipe`), the links are not looked at.
 */
export function socialPlan(
  page: SocialPage,
  captionRecipe: SchemaRecipe | undefined,
): { links: string[]; text: boolean } {
  const links = captionIsRecipe(captionRecipe) ? [] : (page.links ?? []).slice(0, 3).filter(isPublicAddress);
  return { links, text: !!page.text };
}

/** The text that goes to the rules or the AI: a video title (YouTube) is the first line, so it becomes the recipe title. */
export function socialText(page: SocialPage): string {
  return page.title ? `${page.title}\n\n${page.text}` : page.text;
}

const SAFARI_MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/** The post's ID: the Instagram code (`/p/<code>/`) or the Pinterest pin number; undefined for other kinds. */
export function postId(e: Detection): string | undefined {
  if (e.kind === "instagram") return e.key?.replace(/^instagram:/, "");
  if (e.kind === "pinterest") return /\/pin\/(\d+)/.exec(e.url ?? "")?.[1];
  return undefined;
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
