// Text and meta tags from HTML, shared by the recipe website import (src/schemaorg.ts) and the social media import
// (src/socialText.ts). Pure functions; the page is untrusted, so only strings are cut out, nothing is run.

import { ownValue } from "./ownKeys";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  deg: "°",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  bdquo: "„",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  times: "×",
  middot: "·",
  shy: "",
};

export function entities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ownValue(ENTITIES, e) ?? whole;
  });
}

/** HTML as plain text: tags removed, entities decoded (also double-encoded ones); `keepLines` keeps line breaks. */
export function plainText(html: string, keepLines = false): string {
  const withoutTags = (s: string) => s.replace(/<[^>]*>/g, " ");
  let s = html.replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n");
  s = withoutTags(entities(withoutTags(s)));
  if (!keepLines) s = s.replace(/\s+/g, " ");
  return s;
}

/** Contents of the meta tags named in `names` (property or name attribute), entities decoded, empty ones left out. */
export function metaContents(html: string, names: string[]): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const name = /(?:property|name)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i.exec(tag);
    if (!names.includes((name?.[1] ?? name?.[2] ?? name?.[3] ?? "").toLowerCase())) continue;
    const content = /content\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const value = entities(content?.[1] ?? content?.[2] ?? "").trim();
    if (value) out.push(value);
  }
  return out;
}

/** Content of the first meta tag named `name`; undefined if there is none. */
export const metaContent = (html: string, name: string): string | undefined => metaContents(html, [name])[0];
