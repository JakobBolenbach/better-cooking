// Reads what the public page of a social media post carries (issue #87, ADR 0005): the caption, the cover image,
// the link to a recipe. One pure parser per platform, input is the page's text (HTML or JSON inside it), output
// a SocialPage or null. The formats are not documented by the platforms and change from time to time: every
// parser returns null instead of guessing, and tests/fixtures/social/ holds one small example per format.
// Pure functions without Obsidian, tested in tests/socialPage.test.ts. Page content is untrusted (SECURITY.md).

import {
  at,
  firstExternalLink,
  htmlText,
  isObj,
  jsonAfter,
  metaContent,
  parseJson,
  scriptJson,
  str,
  tidyText,
} from "./socialText";
import type { Obj } from "./socialText";

export interface SocialPage {
  /** The caption or description, line breaks kept; may be empty if only a link was found (Pinterest). */
  text: string;
  /** Address of the cover image (http or https). */
  image?: string;
  /** First link in the text that does not belong to the platform (http or https); for Pinterest the pin's link. */
  link?: string;
  title?: string;
  author?: string;
}

const webAddress = (x: unknown): string | undefined => {
  const s = str(x);
  return s && /^https?:\/\//i.test(s) ? s : undefined;
};

/** The page as the result: null without text and without link; the link is taken from the text if not given. */
function result(kind: string, p: Omit<SocialPage, "link"> & { link?: string }): SocialPage | null {
  const text = tidyText(p.text);
  const link = p.link ?? firstExternalLink(text, kind);
  if (!text && !link) return null;
  return {
    text,
    ...(webAddress(p.image) ? { image: webAddress(p.image) } : {}),
    ...(link ? { link } : {}),
    ...(p.title ? { title: p.title } : {}),
    ...(p.author ? { author: p.author } : {}),
  };
}

// "1,409 likes, 18 comments - user on July 15, 2026: "caption"" and the German "1.409 Likes, 18 Kommentare – user am
// 15. Juli 2026: „…“". The digits in front distinguish the prefix from a caption that happens to contain " - ".
const IG_PREFIX = /^(?=[^:"“„\n]*\d)[^:"“„\n]{0,120}?\s[-–—]\s+([\w.]+)\s+(?:on|am)\s+[^:"“„\n]{3,40}:\s*/;
const QUOTES = /^["“„”]\s*([\s\S]*?)\s*["“”]?$/;

/** Instagram post, reel or tv page (mobile browser request): og:description without its prefix, og:image. */
export function parseInstagramPage(html: string): SocialPage | null {
  const description = metaContent(html, "og:description");
  if (!description) return null;
  const prefix = IG_PREFIX.exec(description);
  const rest = prefix ? description.slice(prefix[0].length) : description;
  const text = QUOTES.exec(rest)?.[1] ?? rest;
  const author = prefix?.[1] ?? /^(.+?)\s+(?:on|auf)\s+Instagram\b/.exec(metaContent(html, "og:title") ?? "")?.[1];
  return result("instagram", { text, image: metaContent(html, "og:image"), author });
}

/** Instagram embed page (`/embed/captioned/`): the caption with its line breaks, the user and the image. */
export function parseInstagramEmbed(html: string): SocialPage | null {
  const start = html.search(/class\s*=\s*["']Caption["']/);
  if (start < 0) return null;
  const comments = html.indexOf("CaptionComments", start);
  const end = comments < 0 ? -1 : html.lastIndexOf("<", comments);
  const block = html.slice(start, end < 0 ? start + 60_000 : end).replace(/^[^>]*>/, "");
  const user = /<a\b[^>]*CaptionUsername[^>]*>([\s\S]*?)<\/a>/i.exec(block);
  const caption = htmlText(user ? block.replace(user[0], "") : block);
  const image = /<img\b[^>]*EmbeddedMediaImage[^>]*\ssrc\s*=\s*"([^"]*)"/i.exec(html)?.[1];
  return result("instagram", {
    text: caption,
    image: image ? htmlText(image) : undefined,
    author: user ? htmlText(user[1]).trim() || undefined : undefined,
  });
}

/** Item of a TikTok page: new format (`__UNIVERSAL_DATA_FOR_REHYDRATION__`, any "video detail" scope) or the old `SIGI_STATE`. */
function tiktokItem(html: string): Obj | undefined {
  const scope = at(scriptJson(html, "__UNIVERSAL_DATA_FOR_REHYDRATION__"), "__DEFAULT_SCOPE__");
  for (const part of isObj(scope) ? Object.values(scope) : []) {
    const item = at(part, "itemInfo", "itemStruct");
    if (isObj(item)) return item;
  }
  const old = at(scriptJson(html, "SIGI_STATE"), "ItemModule");
  const first = isObj(old) ? Object.values(old)[0] : undefined;
  return isObj(first) ? first : undefined;
}

/** TikTok video page: caption (`desc`), cover image and author from the rehydration JSON. */
export function parseTiktok(html: string): SocialPage | null {
  const item = tiktokItem(html);
  if (!item) return null;
  const video = at(item, "video");
  const image = str(at(video, "cover")) ?? str(at(video, "originCover")) ?? str(at(video, "dynamicCover"));
  const author = str(at(item, "author", "nickname")) ?? str(at(item, "author", "uniqueId")) ?? str(item.author);
  return result("tiktok", { text: str(item.desc) ?? "", image, author });
}

/** YouTube watch or Shorts page: title, full description and author from `ytInitialPlayerResponse`, large thumbnail. */
export function parseYoutube(html: string): SocialPage | null {
  const details = at(jsonAfter(html, "ytInitialPlayerResponse"), "videoDetails");
  if (!isObj(details)) return null;
  const thumbnails = at(details, "thumbnail", "thumbnails");
  const last = Array.isArray(thumbnails) ? (thumbnails[thumbnails.length - 1] as unknown) : undefined;
  return result("youtube", {
    text: str(details.shortDescription) ?? "",
    title: str(details.title),
    author: str(details.author),
    image: metaContent(html, "og:image") ?? str(at(last, "url")),
  });
}

/** Pinterest pin page: the pin's outbound link (the first `"link"` value that points away from Pinterest). */
export function parsePinterest(html: string): SocialPage | null {
  for (const m of html.matchAll(/"link"\s*:\s*("(?:[^"\\]|\\.)*")/g)) {
    const link = firstExternalLink(str(parseJson(m[1])) ?? "", "pinterest");
    if (link) return result("pinterest", { text: "", link });
  }
  return null;
}

/**
 * Reads the answer of a platform's page. Instagram: the post page, or the embed page if the first one has no
 * caption. Facebook has no parser (login wall); other kinds give null.
 */
export function parseSocialPage(kind: string, html: string): SocialPage | null {
  switch (kind) {
    case "instagram":
      return parseInstagramPage(html) ?? parseInstagramEmbed(html);
    case "tiktok":
      return parseTiktok(html);
    case "youtube":
      return parseYoutube(html);
    case "pinterest":
      return parsePinterest(html);
    default:
      return null;
  }
}
