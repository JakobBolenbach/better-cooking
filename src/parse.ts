// Reads a recipe note (fixed structure, docs/recipe-format.md) into the data model.
// Pure functions without Obsidian, so they can be tested with Vitest.
import { readResult } from "./quantities";
import { unescapeLead } from "./lineEscape";
import { checkImportedNote } from "./importCheck";
import type { Recipe, Step, Attempt, IngredientGroup } from "./types";
import {
  FIELD_PRESETS,
  NOTE_WORDS,
  importStateFrom,
  readField,
  statusFrom,
  type FieldId,
  type Fields,
  type NoteLang,
} from "./noteFormat";

type Fm = Record<string, string | string[]>;

/** Small frontmatter reader: `key: value`, lists with `  - x`, quotes. Enough for the recipe fields. */
export function readFrontmatter(text: string): { fm: Fm; bodyText: string } {
  const t = text.replace(/\r\n/g, "\n");
  if (!t.startsWith("---\n")) return { fm: {}, bodyText: t };
  // Search from index 3, so that empty frontmatter ("---\n---") is detected too.
  const end = t.indexOf("\n---", 3);
  if (end < 0) return { fm: {}, bodyText: t };
  const fm: Fm = {};
  let list: string | null = null;
  for (const line of t.slice(4, end).split("\n")) {
    const li = /^\s*-\s+(.*)$/.exec(line);
    if (li && list) {
      (fm[list] as string[]).push(unquote(li[1]));
      continue;
    }
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim();
    if (value === "") {
      fm[m[1]] = [];
      list = m[1];
    } else if (value.startsWith("[") && value.endsWith("]") && !value.startsWith("[[")) {
      fm[m[1]] = value
        .slice(1, -1)
        .split(",")
        .map((s) => unquote(s.trim()))
        .filter(Boolean);
      list = null;
    } else {
      fm[m[1]] = unquote(value);
      list = null;
    }
  }
  return { fm, bodyText: t.slice(end + 4).replace(/^\n+/, "") };
}

function unquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return t;
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const number = (v: string | string[] | undefined) => {
  const s = str(v);
  if (!s) return undefined;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

/** Link target from `![[target]]`, `[[target]]` or `![[target|width]]`. */
export const linkTarget = (s: string | undefined) => {
  if (!s) return undefined;
  const m = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/.exec(s);
  return m ? m[1].trim() : undefined;
};

/**
 * English section names and common variants, mapped to the German key (docs/recipe-format.md).
 * Notes may mix both languages; which names the plugin writes is set by the note format (noteFormat.ts).
 */
const SECTION_ALIASES: Record<string, string> = {
  ingredients: "zutaten",
  steps: "schritte",
  instructions: "schritte",
  directions: "schritte",
  method: "schritte",
  zubereitung: "schritte",
  tips: "tipps",
  notes: "notizen",
  attempts: "versuche",
  images: "bilder",
  photos: "bilder",
  timeline: "ablauf",
};

/** Key of a section: lower case, English names mapped to the German ones. */
export const sectionKey = (heading: string) => {
  const k = heading.trim().toLowerCase();
  return SECTION_ALIASES[k] ?? k;
};

/** Sections by `## Heading` (key via sectionKey). */
function sections(bodyText: string): { header: string[]; parts: Map<string, string[]> } {
  const header: string[] = [];
  const parts = new Map<string, string[]>();
  let current: string[] = header;
  for (const line of bodyText.split("\n")) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h && !line.startsWith("###")) {
      current = [];
      const key = sectionKey(h[1]);
      // If the same section appears twice (e.g. "Zutaten" and "Ingredients"), the first one counts.
      if (!parts.has(key)) parts.set(key, current);
      continue;
    }
    current.push(line);
  }
  return { header, parts };
}

/** A task-list box at the start of an item (`[ ]`, `[x]`, `[/]`, `[-]`); the fingerprint ignores it too (src/fingerprint.ts). */
export const CHECKBOX = String.raw`\[[ xX/-]\]`;
export const BULLET = new RegExp(String.raw`^\s*[-*]\s+(?:${CHECKBOX}\s+)?(.*)$`);
export const NUMBERED = new RegExp(String.raw`^\s*\d+[.)]\s+(?:${CHECKBOX}\s+)?(.*)$`);

const notEmpty = (s: string) => s.replace(/^[-*]\s*/, "").trim() !== "";
export const withoutHint = (z: string) => !z.trim().startsWith(">");

/** One entry of a list section (ingredient, group title, step, tip) with the lines it takes (indexes into the section). */
export interface ListEntry {
  type: "title" | "item";
  /** The entry's own line first, then the lines hanging below it. */
  lines: number[];
  /** Group title (type "title"), or the text of an item with its hanging lines joined (as the page shows it). */
  text: string;
  /** Bold title of a step. */
  title?: string;
  /** A marker without text (`- `, `1. `): a placeholder, not an item. */
  empty: boolean;
}

export type ListKind = "ingredients" | "steps" | "tips";

const GROUP_TITLES = [/^\s*\*\*(.+?)\*\*\s*:?\s*$/, /^\s*###\s+(.+)$/];

/**
 * The entries of a list section found by the one set of rules the page reads them by (`parseRecipe` is built on this)
 * and the recipe editor writes by (src/sectionDiff.ts). Hanging lines: of a step every later line with content that is
 * no heading or embed, of a tip and an ingredient every indented line; they belong to the entry above. Escaped starts
 * (`\## x`, see src/lineEscape.ts) are shown as typed.
 */
export function listEntries(lines: string[], kind: ListKind): ListEntry[] {
  const out: ListEntry[] = [];
  const last = () => out[out.length - 1];
  const hang = (z: string, i: number) => {
    const e = last();
    if (!e || e.type !== "item") return;
    e.lines.push(i);
    if (kind !== "ingredients") e.text += " " + z.trim();
  };
  lines.forEach((z, i) => {
    if (!withoutHint(z)) return;
    if (kind === "ingredients") {
      const t = GROUP_TITLES.map((re) => re.exec(z)).find(Boolean);
      if (t) return void out.push({ type: "title", lines: [i], text: t[1].replace(/:$/, "").trim(), empty: false });
    }
    if (kind === "steps") {
      const m = NUMBERED.exec(z);
      if (m) {
        const t = m[1].trim();
        const bold = /^\*\*(.+?)\*\*\s*:?\s*(.*)$/.exec(t);
        const text = bold ? bold[2].trim() : t;
        const title = bold ? bold[1].replace(/:$/, "").trim() : undefined;
        out.push({ type: "item", lines: [i], text: unescapeLead(text, true), title, empty: !text && !title });
      } else if (z.trim() && !/^#/.test(z.trim()) && !/^!\[\[/.test(z.trim())) hang(z, i);
      return;
    }
    const m = BULLET.exec(z);
    if (m) out.push({ type: "item", lines: [i], text: unescapeLead(m[1].trim()), empty: !m[1].trim() });
    else if (z.trim() && /^\s{2,}/.test(z)) hang(z, i);
  });
  return out;
}

function bulletList(lines: string[] | undefined): string[] {
  return listEntries(lines ?? [], "tips")
    .filter((e) => !e.empty)
    .map((e) => e.text);
}

function ingredients(lines: string[] | undefined): IngredientGroup[] {
  const groups: IngredientGroup[] = [];
  let g: IngredientGroup = { ingredients: [] };
  for (const e of listEntries(lines ?? [], "ingredients")) {
    if (e.type === "title") {
      if (g.ingredients.length || g.title) groups.push(g);
      g = { title: e.text, ingredients: [] };
    } else if (!e.empty) g.ingredients.push(e.text);
  }
  if (g.ingredients.length || g.title) groups.push(g);
  return groups.filter((x) => x.ingredients.length);
}

function steps(lines: string[] | undefined): Step[] {
  return listEntries(lines ?? [], "steps").map((e) =>
    e.title === undefined ? { text: e.text } : { title: e.title, text: e.text },
  );
}

function attempts(lines: string[] | undefined): Attempt[] {
  if (!lines) return [];
  const out: Attempt[] = [];
  for (const z of lines.filter(withoutHint)) {
    const h = /^###\s+(.+)$/.exec(z.trim());
    if (h) {
      out.push({ date: h[1].trim(), lines: [] });
      continue;
    }
    const m = /^\s*[-*]\s+(.*)$/.exec(z);
    if (m && m[1].trim() && out.length) out[out.length - 1].lines.push(m[1].trim());
  }
  return out.filter((v) => v.lines.length || v.date);
}

function embeds(lines: string[] | undefined): string[] {
  if (!lines) return [];
  return lines.map((z) => (/^\s*!\[\[/.test(z) ? linkTarget(z) : undefined)).filter((x): x is string => !!x);
}

/** Name of a note from its path: the file name without ".md". */
export const noteName = (path: string): string => (path.split("/").pop() ?? path).replace(/\.md$/i, "");

/** `fields`: own field names from the settings; German and English names are always read too. */
export function parseRecipe(path: string, text: string, modified = 0, fields: Fields = FIELD_PRESETS.de): Recipe {
  const { fm, bodyText } = readFrontmatter(text);
  const get = (id: FieldId) => readField(fm, fields, id) as string | string[] | undefined;
  const { header, parts } = sections(bodyText);
  const name = noteName(path);
  const h1 = header.find((z) => /^#\s+/.test(z));
  const title = h1 ? h1.replace(/^#\s+/, "").trim() : name;

  // Description: first paragraph in the header that is not an image, a key facts or source line, or a hint.
  const paragraph: string[] = [];
  for (const z of header) {
    const t = z.trim();
    if (!t) {
      if (paragraph.length) break;
      continue;
    }
    if (
      /^#\s/.test(t) ||
      /^!\[\[/.test(t) ||
      /^>/.test(t) ||
      /^\*\*(Ergebnis|Aktiv|Gesamt|Yield|Servings|Active|Total)/.test(t) ||
      /^(Quelle|Source):/i.test(t)
    ) {
      if (paragraph.length) break;
      continue;
    }
    paragraph.push(t);
  }

  const headerImage = embeds(header).find((b) => !/\.svg$/i.test(b));
  const timeline = embeds(parts.get("ablauf")).find((b) => /\.svg$/i.test(b));
  const result = str(get("yield"));
  const servingsNumber = number(get("servings"));
  const fromResult = readResult(result);
  const importState = importStateFrom(get("importState"));
  const job = str(get("job"));
  const findings = importState || job ? checkImportedNote(text) : [];
  return {
    path,
    name,
    title,
    status: statusFrom(get("status")) ?? "ausprobieren",
    category: str(get("category")),
    source: str(get("source")),
    author: str(get("author")),
    result,
    servings: servingsNumber ? { count: servingsNumber, unit: fromResult?.unit ?? "" } : fromResult,
    timeActive: number(get("timeActive")),
    timeTotal: number(get("timeTotal")),
    rating: number(get("rating")),
    lastMade: str(get("lastMade")),
    importState,
    importError: str(get("importError")),
    importHash: str(get("importHash")),
    job,
    created: str(get("created")),
    image: linkTarget(str(get("image"))) ?? headerImage,
    ...(str(get("translationOf")) ? { translationOf: linkTarget(str(get("translationOf"))) } : {}),
    ...(str(get("language")) ? { language: str(get("language")) } : {}),
    timeline,
    images: [...embeds(parts.get("bilder")), ...embeds(parts.get("bilder aus dem import"))],
    description: paragraph.length ? paragraph.join(" ") : undefined,
    ingredients: ingredients(parts.get("zutaten")),
    steps: steps(parts.get("schritte")),
    tips: bulletList(parts.get("tipps")).filter(notEmpty),
    attempts: attempts(parts.get("versuche")),
    notes: bulletList(parts.get("notizen")).filter(notEmpty),
    ...(findings.length ? { findings } : {}),
    modified,
  };
}

/** Date "today" as YYYY-MM-DD or DD.MM.YYYY in Europe/Berlin (device time). */
export function todayIso(d = new Date()): string {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export const isoToGerman = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A typed date to YYYY-MM-DD: "26.11.2026", "2026-11-26" or "26 Nov 2026" (what the interface shows in English).
 * Returns undefined for anything else or for days that do not exist.
 */
export function parseDateInput(input: string): string | undefined {
  const t = input.trim();
  let y: number, mo: number, d: number;
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  if (m) [d, mo, y] = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t))) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(\d{4})$/i.exec(t))) {
    mo = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    [d, y] = [+m[1], +m[3]];
  } else return undefined;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (!mo || date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return undefined;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Insert a new attempt at the top of `## Versuche` / `## Attempts` (after an introductory hint `> …`).
 * The labels follow the language of the existing section; if the section is missing, it is created
 * in `lang` before `## Notizen` / `## Notes` or at the end.
 */
export function insertAttempt(
  text: string,
  v: { date: string; modified?: string; result?: string; rating?: number },
  lang: NoteLang = "de",
): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((z) => /^##\s+(Versuche|Attempts)\s*$/i.test(z));
  const l = start < 0 ? lang : /attempts/i.test(lines[start]) ? "en" : "de";
  const w = NOTE_WORDS[l];
  const block = [`### ${v.date}`];
  if (v.modified?.trim()) block.push(`- ${w.changed}: ${singleLine(v.modified)}`);
  if (v.result?.trim()) block.push(`- ${w.result}: ${singleLine(v.result)}`);
  if (v.rating) block.push(`- ${w.rating}: ${v.rating}/5`);
  if (block.length === 1) block.push(`- ${w.made}`);
  if (start < 0) {
    const notes = lines.findIndex((z) => /^##\s+(Notizen|Notes)\s*$/i.test(z));
    const fresh = [`## ${w.attempts}`, ...block, ""];
    if (notes >= 0) lines.splice(notes, 0, ...fresh);
    else lines.push("", ...fresh);
    return lines.join("\n");
  }
  let i = start + 1;
  while (i < lines.length && (lines[i].trim() === "" || lines[i].trim().startsWith(">"))) i++;
  // Insertion point: after the hint and empty lines, before the first existing attempt or the next section.
  lines.splice(i, 0, ...block, "");
  // Exactly one empty line between hint and new block.
  if (lines[i - 1]?.trim() !== "") lines.splice(i, 0, "");
  return lines.join("\n");
}

const singleLine = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();
