// Reads what the public page of a social media post carries (issue #87, ADR 0005): the caption, the cover image,
// the links to a recipe. One pure parser per platform, input is the page's text (HTML or JSON inside it), output
// a SocialPage or null. The formats are not documented by the platforms and change from time to time: every
// parser returns null instead of guessing, and tests/fixtures/social/ holds one small example per format.
// Pure functions without Obsidian, tested in tests/socialPage.test.ts. Page content is untrusted (SECURITY.md).

import {
  at,
  externalLinks,
  isObj,
  jsonAfter,
  metaContent,
  MAX_CAPTION,
  parseJson,
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
  /** The first of `links`. */
  link?: string;
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
function result(p: Omit<SocialPage, "link" | "links"> & { links?: string[] }): SocialPage | null {
  const text = tidyText(p.text);
  const links = p.links ?? externalLinks(text);
  if (!text && !links.length) return null;
  const image = webAddress(p.image);
  return {
    text,
    ...(image ? { image } : {}),
    ...(links.length ? { link: links[0], links } : {}),
    ...(p.title ? { title: p.title } : {}),
    ...(p.author ? { author: p.author } : {}),
  };
}

// "1,409 likes, 18 comments - user on July 15, 2026: "caption"" and the German "1.409 Likes, 18 Kommentare – user am
// 15. Juli 2026: „…“" (“ ” „ are the typographic quotes). The digits in front tell the prefix from a
// caption that happens to contain " - ".
const IG_PREFIX = /^(?=[^:"“„\n]*\d)[^:"“„\n]{0,120}?\s[-–—]\s+([\w.]+)\s+(?:on|am)\s+[^:"“„\n]{3,40}:\s*/;
/** The caption in quotes; a period after the closing quote belongs to the prefix format, not to the caption. */
const QUOTES = /^["“„”]\s*([\s\S]*?)\s*(?:["“”]\.?)?$/;
/** Where the prefix can be: it is looked for only here, so a long caption is never run through the pattern. */
const PREFIX_AREA = 200;

/**
 * Instagram post, reel or tv page (mobile browser request): og:description without its prefix, og:image. A login
 * wall or a page of another post answers with generic tags: the page counts only if the prefix is there or if
 * `og:url` names the post (`postId`).
 */
export function parseInstagramPage(html: string, postId?: string): SocialPage | null {
  const description = metaContent(html, "og:description");
  if (!description) return null;
  const prefix = IG_PREFIX.exec(description.slice(0, PREFIX_AREA));
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
export function parseTiktok(html: string): SocialPage | null {
  const item = tiktokItem(html);
  if (!item) return null;
  const video = at(item, "video");
  const image = str(at(video, "cover")) ?? str(at(video, "originCover")) ?? str(at(video, "dynamicCover"));
  const author = str(at(item, "author", "nickname")) ?? str(at(item, "author", "uniqueId")) ?? str(item.author);
  return result({ text: str(item.desc) ?? "", image, author });
}

/** YouTube watch or Shorts page: title, full description and author from `ytInitialPlayerResponse`, large thumbnail. */
export function parseYoutube(html: string): SocialPage | null {
  const details = at(jsonAfter(html, "ytInitialPlayerResponse"), "videoDetails");
  if (!isObj(details)) return null;
  const thumbnails = at(details, "thumbnail", "thumbnails");
  const last = Array.isArray(thumbnails) ? (thumbnails[thumbnails.length - 1] as unknown) : undefined;
  return result({
    text: str(details.shortDescription) ?? "",
    title: str(details.title),
    author: str(details.author),
    image: metaContent(html, "og:image") ?? str(at(last, "url")),
  });
}

/** The `<script>` that contains the position `at` of a page. */
function scriptAround(html: string, pos: number): string {
  const start = html.lastIndexOf("<script", pos);
  const end = html.indexOf("</script>", pos);
  return start < 0 || end < 0 ? "" : html.slice(start, end);
}

/**
 * Pinterest pin page: the pin's outbound link, the first `"link"` value that leads away from Pinterest (any
 * country, src/source.ts) and is no short link. With the pin's ID (`pinId`, from the address) it must sit in the same
 * script as the pin itself, so the link of a related pin is not taken.
 */
export function parsePinterest(html: string, pinId?: string): SocialPage | null {
  for (const m of html.matchAll(/"link"\s*:\s*("(?:[^"\\]|\\.)*")/g)) {
    const links = externalLinks(str(parseJson(m[1])) ?? "", 1);
    if (!links.length) continue;
    if (pinId && !scriptAround(html, m.index).includes(pinId)) continue;
    return result({ text: "", links });
  }
  return null;
}

/**
 * Reads the answer of a platform's page. `id`: the post's ID from its address (Instagram post, Pinterest pin).
 * Instagram: the post page, or the embed page if the first one has no caption. Facebook has no parser (login
 * wall); other kinds give null.
 */
export function parseSocialPage(kind: string, html: string, id?: string): SocialPage | null {
  switch (kind) {
    case "instagram":
      return parseInstagramPage(html, id) ?? parseInstagramEmbed(html);
    case "tiktok":
      return parseTiktok(html);
    case "youtube":
      return parseYoutube(html);
    case "pinterest":
      return parsePinterest(html, id);
    default:
      return null;
  }
}
