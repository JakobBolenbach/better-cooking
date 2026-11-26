// Helpers for reading the public pages of social media posts (issue #87): meta tags, JSON inside a page, text from
// HTML, the first link in a caption. Pure functions without Obsidian, tested in tests/socialPage.test.ts.
// Everything here treats the page as untrusted data: nothing is run, only strings are cut out.

import { entities } from "./schemaorg";

/** A caption is cut here, like pasted text for a processor. */
export const MAX_CAPTION = 20_000;

/** Content of the first meta tag named `name` (property or name attribute), entities decoded; undefined if empty. */
export function metaContent(html: string, name: string): string | undefined {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const attr = /(?:property|name)\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    if ((attr?.[1] ?? attr?.[2])?.toLowerCase() !== name) continue;
    const content = /content\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const value = entities(content?.[1] ?? content?.[2] ?? "").trim();
    if (value) return value;
  }
  return undefined;
}

/** HTML fragment as plain text: line breaks kept, tags removed, entities decoded. */
export function htmlText(fragment: string): string {
  const lines = fragment.replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n").replace(/<[^>]*>/g, "");
  return entities(lines);
}

/** Text of a caption: unified line breaks, no control characters, no runs of blank lines, cut to MAX_CAPTION. */
export function tidyText(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+\n/g, "\n")
    .replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === "\n" ? c : c === "­" || c === "‍" ? "" : " "))
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CAPTION);
}

/**
 * The JSON value that follows `marker` (for example `ytInitialPlayerResponse =`) in a page: from the first `{` to its
 * matching `}`, strings respected. undefined if the marker is missing or the value does not parse.
 */
export function jsonAfter(html: string, marker: string): unknown {
  for (let at = html.indexOf(marker); at >= 0; at = html.indexOf(marker, at + 1)) {
    const start = at + marker.length;
    const brace = /^\s*=?\s*\{/.exec(html.slice(start, start + 20));
    if (brace) return parseJson(balanced(html, start + brace[0].length - 1));
  }
  return undefined;
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
export const isObj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);
/** Value at a path of keys; undefined as soon as a step is not an object. */
export function at(x: unknown, ...path: string[]): unknown {
  let v = x;
  for (const k of path) v = isObj(v) ? v[k] : undefined;
  return v;
}
export const str = (x: unknown): string | undefined => (typeof x === "string" && x.trim() ? x.trim() : undefined);

/** Hosts that belong to a platform: a link to them is no link to a recipe. */
export const OWN_HOSTS: Record<string, string[]> = {
  instagram: ["instagram.com", "cdninstagram.com", "facebook.com", "fb.me", "fb.com", "meta.com"],
  tiktok: ["tiktok.com", "tiktokcdn.com", "tiktokcdn-eu.com", "tiktokv.com"],
  youtube: ["youtube.com", "youtu.be", "ytimg.com", "google.com", "goo.gl"],
  pinterest: ["pinterest.com", "pinterest.de", "pinimg.com", "pin.it"],
};

const URL_IN_TEXT = /\b(?:https?:\/\/|www\.)[^\s<>"'“”„]+/gi;

/**
 * The first link in a caption that does not belong to the platform itself, as an http(s) address; "www." gets
 * https. Trailing punctuation is cut. undefined if there is none. Only http(s) is ever returned.
 */
export function firstExternalLink(text: string, kind: string): string | undefined {
  const own = OWN_HOSTS[kind] ?? [];
  for (const m of text.matchAll(URL_IN_TEXT)) {
    const raw = m[0].replace(/[.,;:!?)\]}»…]+$/, "");
    let u: URL;
    try {
      u = new URL(/^https?:/i.test(raw) ? raw : `https://${raw}`);
    } catch {
      continue;
    }
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if ((u.protocol !== "https:" && u.protocol !== "http:") || !host.includes(".")) continue;
    if (own.some((d) => host === d || host.endsWith(`.${d}`))) continue;
    return u.toString();
  }
  return undefined;
}
