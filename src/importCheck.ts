// Checks an imported recipe note for content that does not belong into a recipe and could act inside the vault:
// code that other plugins run (Templater, Dataview), HTML that loads or runs something, links that trigger
// actions, embeds of other notes. Imported content is untrusted (SECURITY.md, issue #6).
// Pure functions without Obsidian, tested in tests/importCheck.test.ts.

import { tr, type Key } from "./i18n";

export type Finding = "templater" | "code" | "inlineQuery" | "html" | "link" | "embed";

export const FINDING_KEYS: Record<Finding, Key> = {
  templater: "findTemplater",
  code: "findCode",
  inlineQuery: "findInlineQuery",
  html: "findHtml",
  link: "findLink",
  embed: "findEmbed",
};

/** Findings as a readable list in the UI language. */
export const findingsText = (f: Finding[]) => f.map((x) => tr(FINDING_KEYS[x])).join(", ");

const IMAGE = /\.(jpe?g|png|webp|gif|avif|svg)$/i;

/** Tags that load, run or submit something; Obsidian allows some of them in notes. */
const HTML =
  /<\s*\/?\s*(script|iframe|object|embed|form|input|button|style|link|meta|base|frame|frameset|svg|math|video|audio|source)\b|\son[a-z]+\s*=/i;

/** Link targets other than web addresses, mail and in-note anchors: obsidian://, javascript:, file: … */
const LINK = /\]\(\s*<?\s*(?!https?:|mailto:|#)[a-z][a-z0-9+.-]*:/i;
const BARE_LINK = /(^|[\s(<])(obsidian|javascript|vbscript|data|file):/i;

/** Findings in a note's text, each kind at most once, in a fixed order. */
export function checkImportedNote(text: string): Finding[] {
  const t = text.replace(/\r\n/g, "\n");
  const found = new Set<Finding>();
  if (/<%[\s\S]*?%>|<%[*_+-]?/.test(t)) found.add("templater");
  if (/^\s*(```|~~~)/m.test(t)) found.add("code");
  if (/(^|[^\\])`\s*\$?=/m.test(t)) found.add("inlineQuery");
  if (HTML.test(t)) found.add("html");
  if (LINK.test(t) || BARE_LINK.test(t)) found.add("link");
  for (const m of t.matchAll(/!\[\[([^\]|#]*)/g)) if (!IMAGE.test(m[1].trim())) found.add("embed");
  const order: Finding[] = ["templater", "code", "inlineQuery", "html", "link", "embed"];
  return order.filter((f) => found.has(f));
}
