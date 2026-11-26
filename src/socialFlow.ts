// How a social media link is imported (issue #87, ADR 0005): which way for which processor setting, which address
// and which headers the one request uses, and the text that goes on to the rules or the own AI.
// Pure functions without Obsidian, tested in tests/socialFlow.test.ts.

import type { Kind } from "./source";
import type { ActiveProcessor, Processor, Ready } from "./processor";
import type { SocialPage } from "./socialPage";

export const SOCIAL_KINDS: Kind[] = ["instagram", "tiktok", "youtube", "pinterest", "facebook"];
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

/** What the next step is after the page was read: follow the link to a recipe website, or use the text. */
export type SocialStep = { do: "website"; link: string } | { do: "text" } | { do: "nothing" };

/** A link in the post comes first (a website with schema.org gives the best recipe); the text is the fallback. */
export function nextSocialStep(page: SocialPage): SocialStep {
  if (page.link) return { do: "website", link: page.link };
  return page.text ? { do: "text" } : { do: "nothing" };
}

/** The text that goes to the rules or the AI: a video title (YouTube) is the first line, so it becomes the recipe title. */
export function socialText(page: SocialPage): string {
  return page.title ? `${page.title}\n\n${page.text}` : page.text;
}

const SAFARI_MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/** Address of the page to read: the post itself, without tracking and user prefixes; undefined if there is no reader. */
export function socialPageUrl(kind: Kind, url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  const part = u.pathname.split("/").filter(Boolean);
  if (kind === "instagram") {
    const i = part.findIndex((t) => ["p", "reel", "reels", "tv"].includes(t));
    if (i < 0 || !part[i + 1]) return undefined;
    return `https://www.instagram.com/${part[i] === "p" ? "p" : "reel"}/${part[i + 1]}/`;
  }
  if (kind === "youtube" && u.hostname.toLowerCase() === "youtu.be" && part[0])
    return `https://www.youtube.com/watch?v=${encodeURIComponent(part[0])}`;
  if (kind === "youtube") u.hostname = "www.youtube.com";
  return kind === "facebook" ? undefined : u.toString();
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
