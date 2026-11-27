// Item-level diff of a list section (ingredients, steps, tips) for the recipe editor (issue #131). `parseRecipe` is
// lossy (checkboxes, `### Group` headings, hanging lines, hints), so a section is never written from parsed values:
// the old items are found in the raw lines, matched to the wanted items by their text (LCS, then moved ones), and
// only what differs is touched. An unchanged item keeps its raw lines; a changed one gets one rendered line; an
// inserted one is rendered; a removed one goes with its hanging lines; step numbers are changed only when the
// order or the count changed. Pure functions without Obsidian, tested in tests/sectionDiff.test.ts.
import { BULLET, NUMBERED, withoutHint } from "./parse";
import { bulletLine, groupLine, stepLine } from "./recipeNote";

export type ListKind = "ingredients" | "steps" | "tips";

/** What the section should contain, in order: group titles (ingredients only), items, steps. */
export type Want =
  { kind: "group"; title: string } | { kind: "item"; text: string } | { kind: "step"; title?: string; text: string };

// ------------------------------------------------------------------ Typed text

/** Start of a text that would be read as something else if it stood at the start of a line. */
const LEAD = /^(#|>|\||-\s|\+\s|\*\*|\*\s|\d+[.)](\s|$)|\[[ xX/-]\](\s|$)|!\[\[)/;

/** Line breaks become spaces (a line is one item); a start that looks like structure is escaped. Inline Markdown stays. */
export function safeText(s: string): string {
  const t = s.replace(/\s*[\r\n\u2028\u2029]+\s*/g, " ").trim();
  return LEAD.test(t) ? `\\${t}` : t;
}

/** The text of an item as typed: the escape of `safeText` taken off again. */
export const unescapeLead = (s: string): string => (s.startsWith("\\") && LEAD.test(s.slice(1)) ? s.slice(1) : s);

/** A group or step title: one line, no `*` (it is written in bold) and no colon at the end. */
export const cleanTitle = (s: string): string =>
  s
    .replace(/[\r\n\u2028\u2029]+/g, " ")
    .replace(/\*/g, "")
    .trim()
    .replace(/:$/, "")
    .trim();

// ------------------------------------------------------------------ Entries of the old section

interface Entry {
  type: "title" | "item";
  key: string;
  /** Line numbers of the section: the entry's own line first, then the lines hanging below it. */
  lines: number[];
}

const keyOf = (w: Want): string =>
  w.kind === "group" ? `G\0${w.title}` : w.kind === "item" ? `I\0${w.text}` : `S\0${w.title ?? ""}\0${w.text}`;

const GROUP_TITLE = [/^\s*\*\*(.+?)\*\*\s*:?\s*$/, /^\s*###\s+(.+)$/];

/** The entries of the raw lines, found like `parseRecipe` finds them (same patterns), so their keys equal the wanted ones. */
function entriesOf(lines: string[], kind: ListKind): Entry[] {
  const out: Entry[] = [];
  const steps: { title?: string; texts: string[] }[] = [];
  const last = () => out[out.length - 1];
  lines.forEach((z, i) => {
    if (!withoutHint(z)) return;
    if (kind === "ingredients") {
      const t = GROUP_TITLE.map((re) => re.exec(z)).find(Boolean);
      if (t)
        return void out.push({ type: "title", key: keyOf({ kind: "group", title: cleanTitle(t[1]) }), lines: [i] });
    }
    if (kind === "steps") {
      const m = NUMBERED.exec(z);
      if (m) {
        const bold = /^\*\*(.+?)\*\*\s*:?\s*(.*)$/.exec(m[1].trim());
        steps.push(bold ? { title: cleanTitle(bold[1]), texts: [bold[2].trim()] } : { texts: [m[1].trim()] });
        out.push({ type: "item", key: "", lines: [i] });
      } else if (z.trim() && out.length && !/^#/.test(z.trim()) && !/^!\[\[/.test(z.trim())) {
        steps[steps.length - 1].texts.push(z.trim());
        last().lines.push(i);
      }
      return;
    }
    const m = BULLET.exec(z);
    if (m) out.push({ type: "item", key: keyOf({ kind: "item", text: unescapeLead(m[1].trim()) }), lines: [i] });
    else if (z.trim() && last()?.type === "item" && /^\s{2,}/.test(z)) last().lines.push(i);
  });
  // A step's text is its own line and the lines hanging below it, joined by spaces (as the page shows it).
  out.forEach((e, n) => {
    if (kind !== "steps") return;
    const s = steps[n];
    const [first, ...rest] = s.texts;
    e.key = keyOf({ kind: "step", title: s.title, text: [unescapeLead(first), ...rest].join(" ").trim() });
  });
  return out;
}

// ------------------------------------------------------------------ Matching

/** Pairs (old index, new index) of a longest common subsequence of the keys. */
function lcs(a: string[], b: string[]): [number, number][] {
  const t = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out: [number, number][] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) out.push([i++, j++]);
    else if (t[i + 1][j] >= t[i][j + 1]) i++;
    else j++;
  }
  return out;
}

const words = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);

/** Is a new entry an edit of an old one (they share a word or a start, or one holds the other), not another entry? */
function similar(oldKey: string, newKey: string): boolean {
  const text = (k: string) => k.split("\0").slice(1).join(" ").trim().toLowerCase();
  const [a, b] = [text(oldKey), text(newKey)];
  if (!a || a.includes(b) || b.includes(a) || a.slice(0, 2) === b.slice(0, 2)) return true;
  const w = words(a);
  return [...words(b)].some((x) => w.has(x));
}

type How = "same" | "moved" | "paired";

/** For each new entry the old one it comes from, and how; missing: it is new. */
function match(old: Entry[], want: Want[]): ({ i: number; how: How } | undefined)[] {
  const keys = want.map(keyOf);
  const from: ({ i: number; how: How } | undefined)[] = keys.map(() => undefined);
  const used = new Set<number>();
  const base = lcs(
    old.map((e) => e.key),
    keys,
  );
  for (const [i, j] of base) {
    from[j] = { i, how: "same" };
    used.add(i);
  }
  keys.forEach((k, j) => {
    if (from[j]) return;
    const i = old.findIndex((e, n) => !used.has(n) && e.key === k);
    if (i >= 0) {
      from[j] = { i, how: "moved" };
      used.add(i);
    }
  });
  // What is left between two matches: a new entry of the same kind that looks like an edit takes the old one's place.
  const bounds: [number, number][] = [[-1, -1], ...base, [old.length, keys.length]];
  for (let g = 0; g + 1 < bounds.length; g++) {
    const [pi, pj] = bounds[g];
    const [ni, nj] = bounds[g + 1];
    for (let j = pj + 1; j < nj; j++) {
      if (from[j]) continue;
      const type = want[j].kind === "group" ? "title" : "item";
      for (let i = pi + 1; i < ni; i++) {
        if (used.has(i) || old[i].type !== type || !similar(old[i].key, keys[j])) continue;
        from[j] = { i, how: "paired" };
        used.add(i);
        break;
      }
    }
  }
  return from;
}

// ------------------------------------------------------------------ Writing

const render = (w: Want, n: number): string =>
  w.kind === "group"
    ? groupLine(cleanTitle(w.title))
    : w.kind === "item"
      ? bulletLine(safeText(w.text))
      : stepLine(n, { title: w.title && cleanTitle(w.title), text: safeText(w.text) }).trimEnd();

const NUMBER = /^(\s*)(\d+)([.)])/;

interface Out {
  text: string;
  /** A numbered step line (renumbered when the order or the count changed). */
  step?: boolean;
}

/** Where entries go into a section without entries: after the last line with content. */
function appendAt(lines: string[]): number {
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].trim()) return i + 1;
  return 0;
}

/**
 * The lines of a section with `want` instead of its items. Everything that is no item (hints, empty lines, free text,
 * a second list in the section) stays where it is. Hanging lines of an ingredient that was edited stay (the editor does
 * not show them); those of a step or tip are part of its text and are replaced with it.
 */
export function diffSection(lines: string[], kind: ListKind, want: Want[]): string[] {
  const old = entriesOf(lines, kind);
  const from = match(old, want);
  const steps = kind === "steps";
  const dropped = new Set(old.flatMap((e) => e.lines));
  const replaced = new Map<number, string>();
  const before = new Map<number, Out[]>();
  const put = (k: number, ...o: Out[]) => before.set(k, [...(before.get(k) ?? []), ...o]);
  const first = old.length ? Math.min(...old.map((e) => e.lines[0])) : appendAt(lines);
  // Where an entry goes that is not in place: after the last line of the nearest earlier entry that stays, else first.
  let cur = -1;
  want.forEach((w, j) => {
    const f = from[j];
    if (f && f.how !== "moved") {
      const [own, ...hanging] = old[f.i].lines;
      dropped.delete(own);
      if (f.how === "same" || kind === "ingredients") hanging.forEach((l) => dropped.delete(l));
      if (f.how === "paired") {
        const m = NUMBER.exec(lines[own]);
        const text = /^\s*/.exec(lines[own])![0] + render(w, Number(m?.[2]) || 1);
        replaced.set(own, steps && m?.[3] === ")" ? text.replace(/^(\s*\d+)\./, "$1)") : text);
      }
      cur = Math.max(own, ...(f.how === "same" || kind === "ingredients" ? hanging : []));
      return;
    }
    const block: Out[] = f
      ? old[f.i].lines.map((l, n) => ({ text: lines[l], step: steps && n === 0 }))
      : [...(w.kind === "group" && j > 0 ? [{ text: "" }] : []), { text: render(w, 0), step: steps }];
    put(cur < 0 ? first : cur + 1, ...block);
  });

  const out: Out[] = [];
  const own = new Set(old.map((e) => e.lines[0]));
  for (let k = 0; k <= lines.length; k++) {
    out.push(...(before.get(k) ?? []));
    if (k < lines.length && !dropped.has(k))
      out.push({ text: replaced.get(k) ?? lines[k], step: steps && own.has(k) && NUMBER.test(lines[k]) });
  }
  if (!old.length && want.length && appendAt(lines) === lines.length) out.push({ text: "" });
  const structure = from.some((f) => !f || f.how === "moved") || from.filter(Boolean).length < old.length;
  if (steps && structure) {
    let n = 0;
    for (const l of out)
      if (l.step) l.text = l.text.replace(NUMBER, (_m, ind: string, _n, d: string) => `${ind}${++n}${d}`);
  }
  return out.map((l) => l.text);
}
