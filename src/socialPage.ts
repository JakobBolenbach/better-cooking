// Reads what the public page of a social media post carries (issue #87, ADR 0005): the caption, the cover image,
// the links to a recipe. One pure parser per platform, input is the page's text (HTML or JSON inside it), output
// a SocialPage or null. The formats are not documented by the platforms and change from time to time: every
// parser returns null instead of guessing, and tests/fixtures/social/ holds one small example per format.
// Pure functions without Obsidian, tested in tests/socialPage.test.ts. Page content is untrusted (SECURITY.md).

import { INSTAGRAM_PREFIX } from "./caption";
import {
  at,
  externalLinks,
  firstJsonObject,
  isObj,
  jsonAfter,
  metaContent,
  MAX_CAPTION,
  plainText,
  scriptJson,
  str,
  tidyText,
  type Obj,
} from "./socialText";

export interface SocialPage {
  /** The caption or description, line breaks kept; may be empty if only a link was found (Pinterest). */
  text: string;
  /** Address of the cover image (http or https). */
  image?: string;
  /** Up to three links in the post that may lead to a recipe (http or https, no platform, no short link), in order. */
  links?: string[];
  title?: string;
  author?: string;
}

const webAddress = (x: unknown): string | undefined => {
  const s = str(x);
  return s && /^https?:\/\//i.test(s) ? s : undefined;
};

/** The page as the result: null without text and without link; the links are taken from the text if not given. */
function result(p: Omit<SocialPage, "links"> & { links?: string[] }): SocialPage | null {
  const text = tidyText(p.text);
  const links = p.links ?? externalLinks(text);
  if (!text && !links.length) return null;
  const image = webAddress(p.image);
  return {
    text,
    ...(image ? { image } : {}),
    ...(links.length ? { links } : {}),
    ...(p.title ? { title: p.title } : {}),
    ...(p.author ? { author: p.author } : {}),
  };
}

/** The caption in quotes; a period after the closing quote belongs to the prefix format, not to the caption. */
const QUOTES = /^["“„”]\s*([\s\S]*?)\s*(?:["“”]\.?)?$/;
/** Where the prefix can be: it is looked for only here, so a long caption is never run through the pattern. */
const PREFIX_AREA = 300;

/**
 * Instagram post, reel or tv page (mobile browser request): og:description without its prefix, og:image. A login
 * wall or a page of another post answers with generic tags: the page counts only if the prefix is there or if
 * `og:url` names the post (`postId`).
 */
export function parseInstagramPage(html: string, postId?: string): SocialPage | null {
  const description = metaContent(html, "og:description");
  if (!description) return null;
  const prefix = INSTAGRAM_PREFIX.exec(description.slice(0, PREFIX_AREA));
  const url = metaContent(html, "og:url") ?? "";
  if (!prefix && !(postId && url.includes(`/${postId}`))) return null;
  const rest = prefix ? description.slice(prefix[0].length) : description;
  const text = QUOTES.exec(rest.slice(0, MAX_CAPTION + 20))?.[1] ?? rest;
  const author = prefix?.[1] ?? /^(.+?)\s+(?:on|auf)\s+Instagram\b/.exec(metaContent(html, "og:title") ?? "")?.[1];
  return result({ text, image: metaContent(html, "og:image"), author });
}

/** Instagram embed page (`/embed/captioned/`): the caption with its line breaks, the user and the image. */
export function parseInstagramEmbed(html: string): SocialPage | null {
  const start = html.search(/class\s*=\s*["']Caption["']/);
  if (start < 0) return null;
  const area = html.slice(start, start + 2 * MAX_CAPTION + 2000);
  const comments = area.indexOf("CaptionComments");
  const block = (comments < 0 ? area : area.slice(0, area.lastIndexOf("<", comments))).replace(/^[^>]*>/, "");
  const user = /<a\b[^>]*CaptionUsername[^>]*>([\s\S]*?)<\/a>/i.exec(block);
  const caption = plainText(user ? block.replace(user[0], "") : block, true).replace(/[ \t]{2,}/g, " ");
  const image = /<img\b[^>]*EmbeddedMediaImage[^>]*\ssrc\s*=\s*"([^"]*)"/i.exec(html)?.[1];
  return result({
    text: caption,
    image: image ? plainText(image) : undefined,
    author: user ? plainText(user[1]).trim() || undefined : undefined,
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
export function parseTiktok(html: string, id?: string): SocialPage | null {
  const item = tiktokItem(html);
  // The video's own ID must be the one asked for (a page of another video is no answer).
  if (!item || (id && str(item.id) !== id)) return null;
  const video = at(item, "video");
  const image = str(at(video, "cover")) ?? str(at(video, "originCover")) ?? str(at(video, "dynamicCover"));
  const author = str(at(item, "author", "nickname")) ?? str(at(item, "author", "uniqueId")) ?? str(item.author);
  return result({ text: str(item.desc) ?? "", image, author });
}

/** YouTube watch or Shorts page: title, full description and author from `ytInitialPlayerResponse`, large thumbnail. */
export function parseYoutube(html: string, id?: string): SocialPage | null {
  const details = at(jsonAfter(html, "ytInitialPlayerResponse"), "videoDetails");
  if (!isObj(details) || (id && str(details.videoId) !== id)) return null;
  const thumbnails = at(details, "thumbnail", "thumbnails");
  const last = Array.isArray(thumbnails) ? (thumbnails[thumbnails.length - 1] as unknown) : undefined;
  return result({
    text: str(details.shortDescription) ?? "",
    title: str(details.title),
    author: str(details.author),
    image: metaContent(html, "og:image") ?? str(at(last, "url")),
  });
}

/** `/pin/123/` and the canonical form `/pin/some-title--123/`. */
const PIN_ID = /\/pin\/(?:[^/?#]*--)?(\d+)/;

/** The pin's number from the loaded page (`og:url` or canonical): a short link (pin.it) shows it only after its redirect. */
function pinIdOfPage(html: string): string | undefined {
  const canonical = [...html.matchAll(/<link\b[^>]*>/gi)].find((m) => /rel\s*=\s*["']canonical["']/i.test(m[0]))?.[0];
  const href = canonical ? /href\s*=\s*["']([^"']+)["']/i.exec(canonical)?.[1] : undefined;
  for (const url of [metaContent(html, "og:url"), href]) {
    const id = PIN_ID.exec(url ?? "")?.[1];
    if (id) return id;
  }
  return undefined;
}

/** The link of the pin object with this ID, anywhere in the data; related pins next to it are not looked at. */
function pinLink(x: unknown, id: string, depth = 0): string | undefined {
  if (depth > 40) return undefined;
  if (Array.isArray(x)) {
    for (const v of x) {
      const link = pinLink(v, id, depth + 1);
      if (link) return link;
    }
    return undefined;
  }
  if (!isObj(x)) return undefined;
  if ((x.id === id || x.entityId === id) && str(x.link)) return str(x.link);
  for (const v of Object.values(x)) {
    const link = pinLink(v, id, depth + 1);
    if (link) return link;
  }
  return undefined;
}

/**
 * Pinterest pin page: the outbound link of the pin itself. The data of the page is parsed and the object whose `id`
 * is the pin's (`pinId` from the address, otherwise from `og:url` or canonical of the loaded page) gives the link, so
 * the link of a related pin never wins. Without a sure pin ID nothing is followed. Links to Pinterest (any
 * country) and short links are not taken (src/source.ts, src/shortLinks.ts).
 */
export function parsePinterest(html: string, pinId?: string): SocialPage | null {
  const id = pinId ?? pinIdOfPage(html);
  if (!id) return null;
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (!m[1].includes(id)) continue;
    const link = pinLink(firstJsonObject(m[1]), id);
    const links = link ? externalLinks(link, 1) : [];
    if (links.length) return result({ text: "", links });
  }
  return null;
}

/**
 * Reads the answer of a platform's page. `id`: the post's ID from its address (Instagram, TikTok, YouTube, Pinterest), checked against the page.
 * Instagram: the post page, or the embed page if the first one has no caption. Facebook has no parser (login
 * wall); other kinds give null.
 */
export function parseSocialPage(kind: string, html: string, id?: string): SocialPage | null {
  switch (kind) {
    case "instagram":
      return parseInstagramPage(html, id) ?? parseInstagramEmbed(html);
    case "tiktok":
      return parseTiktok(html, id);
    case "youtube":
      return parseYoutube(html, id);
    case "pinterest":
      return parsePinterest(html, id);
    default:
      return null;
  }
}
