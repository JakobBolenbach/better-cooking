// Pure text helpers for recipe notes: split a note into frontmatter, header and sections, read and set frontmatter
// values, sort the header lines. No Obsidian, no recipe logic; used by src/refetch.ts. Tested through
// tests/refetch.test.ts.
import { sectionKey } from "./parse";

export interface Section {
  heading: string;
  key: string;
  lines: string[];
}

export function splitNote(text: string): { fm: string[] | null; head: string[]; sections: Section[] } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let fm: string[] | null = null;
  let body = lines;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) {
      fm = lines.slice(1, end);
      body = lines.slice(end + 1);
    }
  }
  const head: string[] = [];
  const sections: Section[] = [];
  let current = head;
  for (const line of body) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h && !line.startsWith("###")) {
      const s: Section = { heading: line, key: sectionKey(h[1]), lines: [] };
      sections.push(s);
      current = s.lines;
    } else current.push(line);
  }
  return { fm, head, sections };
}

// ------------------------------------------------------------------ Frontmatter

/** Raw value of `key: value` in frontmatter lines. */
export function rawValue(fm: string[], key: string): string | undefined {
  const m = fm.map((l) => new RegExp(`^${key}:[ \\t]*(.*)$`).exec(l)).find(Boolean);
  return m?.[1];
}

/**
 * Sets `key: value` in the frontmatter lines. What belonged to the old key goes with it: a list under it, indented
 * continuation lines and the lines of a block scalar (`>`, `>-`, `|`, `|-`).
 */
export function setValue(fm: string[], key: string, value: string): string[] {
  const i = fm.findIndex((l) => new RegExp(`^${key}:`).test(l));
  if (i < 0) {
    const before = fm.findIndex((l) => /^(erstellt|created|aktualisiert|updated):/.test(l));
    const out = [...fm];
    out.splice(before < 0 ? out.length : before, 0, `${key}: ${value}`);
    return out;
  }
  let end = i + 1;
  while (end < fm.length && /^(\s+\S|-\s)/.test(fm[end])) end++;
  return [...fm.slice(0, i), `${key}: ${value}`, ...fm.slice(end)];
}

export interface Head {
  title?: string;
  image?: string;
  description: string[];
  facts?: string;
  source?: string;
  other: string[];
}

/**
 * Sorts the lines between the frontmatter and the first section like `parseRecipe` reads them: the description is
 * the first paragraph of plain lines; title, cover embed, yield line, source line, hints (`>`) and every later
 * paragraph are not part of it. Whatever is not claimed stays in `other`, so only real description lines are replaced.
 */
export function readHead(head: string[]): Head {
  const out: Head = { description: [], other: [] };
  let done = false;
  for (const line of head) {
    const t = line.trim();
    if (!t) {
      if (out.description.length) done = true;
      continue;
    }
    const excluded = /^#\s/.test(t) || /^!\[\[/.test(t) || /^>/.test(t) || FACTS.test(t) || SOURCE.test(t);
    if (!excluded) {
      (done ? out.other : out.description).push(line);
      continue;
    }
    if (out.description.length) done = true;
    if (/^#\s/.test(t) && out.title === undefined) out.title = line;
    else if (/^!\[\[/.test(t) && out.image === undefined && !/\.svg\b/i.test(t)) out.image = line;
    else if (FACTS.test(t) && out.facts === undefined) out.facts = line;
    else if (SOURCE.test(t) && out.source === undefined) out.source = line;
    else out.other.push(line);
  }
  return out;
}

export const FACTS = /^\*\*(Ergebnis|Aktiv|Gesamt|Yield|Servings|Active|Total)/;
export const SOURCE = /^(Quelle|Source):/i;

/** The parts of a note as one text again, with the line ending of the old note. */
export function joinNote(fm: string[] | null, head: string[], sections: Section[], eol: string): string {
  return [...(fm ? ["---", ...fm, "---"] : []), ...head, ...sections.flatMap((s) => [s.heading, ...s.lines])].join(eol);
}
