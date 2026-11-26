// Helpers for reading the public pages of social media posts (issue #87): meta tags, JSON inside a page, text from
// HTML, the first link in a caption. Pure functions without Obsidian, tested in tests/socialPage.test.ts.
// Everything here treats the page as untrusted data: nothing is run, only strings are cut out.

import { isObject } from "./schemaorg";
import { isPlatformHost } from "./source";
import { isRedirectLink } from "./shortLinks";

export { metaContent, plainText } from "./htmlText";

/** A caption is cut here, like pasted text for a processor. */
export const MAX_CAPTION = 20_000;

/** Text of a caption: unified line breaks, no control characters, no runs of blank lines, cut to MAX_CAPTION. */
export function tidyText(s: string): string {
  // Cut first, then work: the rest of a huge page value is never run through the patterns.
  return s
    .slice(0, 2 * MAX_CAPTION)
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+\n/g, "\n")
    .replace(/[\p{Cc}\p{Cf}]/gu, (c) =>
      c === "\n" || c === "\u200d" ? c : /[\u00ad\u200b\u200c\u2060\ufeff]/.test(c) ? "" : " ",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CAPTION);
}

/**
 * The JSON value that follows `marker` (for example `ytInitialPlayerResponse =`) in a page: from the first `{` to its
 * matching `}`, strings respected. undefined if the marker is missing or the value does not parse.
 */
export function jsonAfter(html: string, marker: string): unknown {
  for (let pos = html.indexOf(marker); pos >= 0; pos = html.indexOf(marker, pos + 1)) {
    const start = pos + marker.length;
    const brace = /^\s*=?\s*\{/.exec(html.slice(start, start + 20));
    if (brace) return parseJson(balanced(html, start + brace[0].length - 1));
  }
  return undefined;
}

/** The first JSON object in a text (from its first `{` to the matching `}`); undefined if there is none or it does not parse. */
export function firstJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  return start < 0 ? undefined : parseJson(balanced(text, start));
}

/** The text from the `{` at `start` to its matching `}`, strings respected; "" if it never closes. */
function balanced(html: string, start: number): string {
  let depth = 0;
  let inString = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  return "";
}

export function parseJson(s: string): unknown {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return undefined;
  }
}

/** The content of `<script id="…">…</script>` as JSON; undefined if there is none or it does not parse. */
export function scriptJson(html: string, id: string): unknown {
  const m = new RegExp(`<script\\b[^>]*\\bid\\s*=\\s*["']${id}["'][^>]*>([\\s\\S]*?)</script>`, "i").exec(html);
  return m ? parseJson(m[1]) : undefined;
}

export type Obj = Record<string, unknown>;
export const isObj = isObject;
/** Value at a path of keys; undefined as soon as a step is not an object. */
export function at(x: unknown, ...path: string[]): unknown {
  let v = x;
  for (const k of path) v = isObj(v) ? v[k] : undefined;
  return v;
}
export const str = (x: unknown): string | undefined => (typeof x === "string" && x.trim() ? x.trim() : undefined);

/** Most links of a post that are looked at for a recipe. */
export const MAX_LINKS = 3;

const URL_IN_TEXT = /\b(?:https?:\/\/|www\.)[^\s<>"'\u201c\u201d\u201e]+/gi;

/**
 * The first links in a caption that may lead to a recipe, as http(s) addresses in the order of the text: "www."
 * gets https, trailing punctuation is cut. Links to any platform (src/source.ts) and known shorteners and bio pages
 * (src/shortLinks.ts) are left out, so only plain addresses of other sites remain.
 */
export function externalLinks(text: string, max = MAX_LINKS): string[] {
  const out: string[] = [];
  for (const m of text.slice(0, MAX_CAPTION).matchAll(URL_IN_TEXT)) {
    const raw = m[0].replace(/[.,;:!?)\]}\u00bb\u2026]+$/, "");
    let u: URL;
    try {
      u = new URL(/^https?:/i.test(raw) ? raw : `https://${raw}`);
    } catch {
      continue;
    }
    if ((u.protocol !== "https:" && u.protocol !== "http:") || !u.hostname.includes(".")) continue;
    const link = u.toString();
    if (isPlatformHost(u.hostname) || isRedirectLink(link) || out.includes(link)) continue;
    out.push(link);
    if (out.length >= max) break;
  }
  return out;
}
