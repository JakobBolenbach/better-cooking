// Item-level diff of a list section (ingredients, steps, tips) for the recipe editor (issue #131). `parseRecipe` is
// lossy (checkboxes, `### Group` headings, hanging lines, hints), so a section is never written from parsed values:
// the old entries come from the parser's own function (`listEntries` in src/parse.ts, lines included), are matched to
// the wanted items by their text (LCS, then moved ones, then edits), and only what differs is touched. An unchanged
// item keeps its raw lines; a changed one keeps the start of its line (indentation, marker, checkbox, number) and gets
// the new text; an inserted one is rendered; a removed one goes with its hanging lines; step numbers are changed only
// when the order or the count changed. Everything the parser does not deliver stays where it is. Pure functions
// without Obsidian, tested in tests/sectionDiff.test.ts.
import { CHECKBOX, listEntries, type ListEntry, type ListKind } from "./parse";
import { bulletLine, groupLine, stepLine } from "./recipeNote";
import { cleanItem, cleanTitle, oneLine, safeText } from "./lineEscape";
import type { NoteLang } from "./noteFormat";
import { STEP_INGREDIENTS_WORD, TAIL, ingredientLine, joinItems, sameItems, writableItem } from "./stepIngredients";

/** What the section should contain, in order: group titles (ingredients only), items, steps. */
export type Want =
  | { kind: "group"; title: string }
  | { kind: "item"; text: string }
  /** `ingredients`: the items of the line "Zutaten: …" under the step (ADR 0009); none: no line. */
  | { kind: "step"; title?: string; text: string; ingredients?: string[] };

// ------------------------------------------------------------------ Keys

const keyOf = (type: "group" | "item" | "step", text: string, title?: string): string =>
  type === "group"
    ? `G\0${cleanTitle(text)}`
    : type === "item"
      ? `I\0${cleanItem(text)}`
      : `S\0${cleanTitle(title ?? "")}\0${oneLine(text)}`;

const wantKey = (w: Want): string =>
  w.kind === "group"
    ? keyOf("group", w.title)
    : w.kind === "item"
      ? keyOf("item", w.text)
      : keyOf("step", w.text, w.title);

interface Entry extends ListEntry {
  key: string;
}

/**
 * The old entries with the key their text matches by; a placeholder (marker without text) matches nothing. A group
 * heading with no ingredient below it (before the next heading or the end) is no entry: it stays as it is, with
 * whatever text or hint stands under it.
 */
function entriesOf(lines: string[], kind: ListKind): Entry[] {
  const all = listEntries(lines, kind);
  const withItems = all.filter(
    (e, i) => e.type !== "title" || all.slice(i + 1).find((x) => x.type === "title" || !x.empty)?.type === "item",
  );
  return withItems.map((e) => ({
    ...e,
    key: e.empty
      ? ""
      : e.type === "title"
        ? keyOf("group", e.text)
        : keyOf(kind === "steps" ? "step" : "item", e.text, e.title),
  }));
}

// ------------------------------------------------------------------ Matching

/** Pairs (a index, b index) of a longest common subsequence. */
export function lcs(a: string[], b: string[]): [number, number][] {
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

/** Words that tell items apart: letters only, no amounts and no units ("2 EL Öl" is "öl"). */
const UNITS = new Set(
  "g kg mg l ml dl cl el tl prise prisen stück stk pck pkg pck packung dose dosen glas bund zehe zehen scheibe scheiben tbsp tsp cup cups oz lb pinch can cans clove cloves slice slices piece pieces".split(
    " ",
  ),
);
const words = (key: string): string[] =>
  (
    key
      .split("\0")
      .slice(1)
      .join(" ")
      .toLowerCase()
      .match(/\p{L}+/gu) ?? []
  ).filter((w) => !UNITS.has(w));

/**
 * Is a new entry an edit of an old one? They share at least half of the words of the shorter one (amounts and units
 * left out); with no words on either side (only numbers) they do, a placeholder is edited by anything. When in doubt
 * it is a removal and an insertion, so the lines hanging below an item never move to an unrelated one.
 */
function similar(oldKey: string, newKey: string): boolean {
  if (!oldKey.split("\0").slice(1).join("").trim()) return true;
  const [a, b] = [words(oldKey), words(newKey)];
  if (!a.length || !b.length) return a.length === b.length;
  const shared = new Set(a.filter((w) => b.includes(w))).size;
  return shared >= Math.ceil(Math.min(new Set(a).size, new Set(b).size) / 2);
}

type How = "same" | "moved" | "paired";
type From = { i: number; how: How } | undefined;

/** For each wanted entry the old one it comes from, and how; undefined: it is new. */
function match(old: Entry[], want: Want[], kind: ListKind): From[] {
  const keys = want.map(wantKey);
  const from: From[] = keys.map(() => undefined);
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
    const i = from[j] ? -1 : old.findIndex((e, n) => !used.has(n) && e.key === k);
    if (i >= 0) {
      from[j] = { i, how: "moved" };
      used.add(i);
    }
  });
  // Between two matches, a group of old and new entries of one kind that are as many on both sides: edits, one to one.
  const bounds: [number, number][] = [[-1, -1], ...base, [old.length, keys.length]];
  for (let g = 0; g + 1 < bounds.length; g++) {
    for (const type of ["title", "item"] as const) {
      const olds = range(bounds[g][0], bounds[g + 1][0]).filter((i) => !used.has(i) && old[i].type === type);
      const news = range(bounds[g][1], bounds[g + 1][1]).filter(
        (j) => !from[j] && (want[j].kind === "group") === (type === "title"),
      );
      if (olds.length !== news.length) continue;
      news.forEach((j, n) => {
        // Only ingredients can be told apart by their words; steps and tips are paired by position.
        if (type === "title" || kind !== "ingredients" || similar(old[olds[n]].key, keys[j]))
          from[j] = { i: olds[n], how: "paired" };
      });
    }
  }
  return from;
}

const range = (from: number, to: number): number[] =>
  Array.from({ length: Math.max(0, to - from - 1) }, (_, n) => from + 1 + n);

// ------------------------------------------------------------------ Writing

const NUMBER = /^(\s*)(\d+)([.)])/;
/** The start of a list line: indentation, marker or number, and a checkbox. */
const PREFIX = new RegExp(String.raw`^\s*(?:[-*]|\d+[.)])\s+(?:${CHECKBOX}\s+)?`);

/** The new text of an entry on a line of its own, without a marker. */
const body = (w: Want): string =>
  w.kind === "group"
    ? cleanTitle(w.title)
    : w.kind === "item"
      ? safeText(w.text)
      : stepLine(1, { title: w.title && cleanTitle(w.title), text: safeText(w.text) })
          .trimEnd()
          .replace(/^1\.\s?/, "");

/** A new line for an entry (no old line to take the start from); a step gets its number when the section is numbered. */
const render = (w: Want): string =>
  w.kind === "group"
    ? groupLine(body(w))
    : w.kind === "item"
      ? bulletLine(body(w))
      : stepLine(0, { title: w.title && cleanTitle(w.title), text: safeText(w.text) }).trimEnd();

/** An edited entry on its old line: the start of that line stays, only the text after it is replaced. */
function rewrite(old: string, w: Want): string {
  if (w.kind === "group") {
    const hashes = /^\s*###\s+/.exec(old);
    return hashes ? hashes[0] + body(w) : groupLine(body(w));
  }
  const start = PREFIX.exec(old);
  return start ? start[0] + body(w) : render(w);
}

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

const HEADING = /^\s{0,3}#{1,6}\s/;

/** What changes in the lines of a step that stays, for its ingredients line (ADR 0009): lines to replace and to drop, a line to add. */
interface Ingredients {
  replace: [number, string][];
  drop: number[];
  add?: string;
}

/**
 * Compares the ingredients the editor shows with what the step has (its line or lines, or a list a version without this
 * reader joined into the text); only a difference is written: the first line is replaced (more lines go), a removed
 * list takes its lines, a new one is added after the step.
 */
function ingredientsEdit(old: Entry, w: Want, lines: string[], lang: NoteLang): Ingredients {
  const want = (w.kind === "step" ? (w.ingredients ?? []) : []).map(writableItem).filter(Boolean);
  const [first, ...more] = old.ingredientsLines ?? [];
  if (old.ingredients && sameItems(old.ingredients, want)) return { replace: [], drop: [] };
  if (old.tail) {
    const own = old.lines[0];
    return { replace: [[own, lines[own].replace(TAIL, "")]], drop: [], add: ingredientLine(want, lang) };
  }
  if (first === undefined) return { replace: [], drop: [], add: ingredientLine(want, lang) };
  if (!want.length) return { replace: [], drop: [first, ...more] };
  const head = /^(\s*[-*]\s+[^:]*:)/.exec(lines[first])?.[1] ?? `   - ${STEP_INGREDIENTS_WORD[lang]}:`;
  return { replace: [[first, `${head} ${joinItems(want)}`]], drop: more };
}

/**
 * Does the note count its steps anew in each phase (after a `###` heading)? Only if a phase after the first starts at
 * 1; steps that continue across a heading keep one count.
 */
function phased(lines: string[]): boolean {
  const starts: number[] = [];
  let open = true;
  for (const l of lines) {
    if (HEADING.test(l)) open = true;
    const m = NUMBER.exec(l);
    if (m && open) {
      starts.push(Number(m[2]));
      open = false;
    }
  }
  return starts.slice(1).some((n) => n === 1);
}

/**
 * The lines of a section with `want` instead of its items. Everything that is no entry (hints, empty lines, free text,
 * a second list in the section) stays where it is. Hanging lines of an ingredient that was edited stay (the editor does
 * not show them); those of a step or tip are part of its text and are replaced with it.
 */
export function diffSection(lines: string[], kind: ListKind, want: Want[], lang: NoteLang = "de"): string[] {
  const old = entriesOf(lines, kind);
  const from = match(old, want, kind);
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
    const ing = f && steps ? ingredientsEdit(old[f.i], w, lines, lang) : { replace: [], drop: [] };
    const added = f ? ing.add : w.kind === "step" ? ingredientLine(w.ingredients ?? [], lang) : undefined;
    if (f && f.how !== "moved") {
      const [own, ...hanging] = old[f.i].lines;
      const kept = f.how === "same" || kind === "ingredients" ? hanging : (old[f.i].ingredientsLines ?? []);
      dropped.delete(own);
      kept.forEach((l) => dropped.delete(l));
      ing.replace.forEach(([k, t]) => replaced.set(k, t));
      if (f.how === "paired") replaced.set(own, rewrite(lines[own], w));
      ing.drop.forEach((l) => dropped.add(l));
      cur = Math.max(own, ...kept);
      if (added) put(cur + 1, { text: added });
      return;
    }
    const block: Out[] = f
      ? movedBlock(old[f.i], lines, steps, ing)
      : [...(w.kind === "group" && j > 0 ? [{ text: "" }] : []), { text: render(w), step: steps }];
    if (added) block.push({ text: added });
    put(cur < 0 ? first : cur + 1, ...block);
  });
  return assemble(
    lines,
    old,
    before,
    dropped,
    replaced,
    from.some((f) => !f || f.how === "moved") || from.filter(Boolean).length < old.length,
    steps,
  );
}

/** The lines of an entry that moves, with its ingredients line changed as `ing` says. */
function movedBlock(e: Entry, lines: string[], steps: boolean, ing: Ingredients): Out[] {
  const change = new Map(ing.replace);
  return e.lines
    .filter((l) => !ing.drop.includes(l))
    .map((l) => ({ text: change.get(l) ?? lines[l], step: steps && l === e.lines[0] }));
}

/** The section's lines with the entries put in place and the old lines that are gone left out; steps renumbered if `renumber`. */
function assemble(
  lines: string[],
  old: Entry[],
  before: Map<number, Out[]>,
  dropped: Set<number>,
  replaced: Map<number, string>,
  renumber: boolean,
  steps: boolean,
): string[] {
  const out: Out[] = [];
  const own = new Set(old.map((e) => e.lines[0]));
  for (let k = 0; k <= lines.length; k++) {
    out.push(...(before.get(k) ?? []));
    if (k < lines.length && !dropped.has(k))
      out.push({ text: replaced.get(k) ?? lines[k], step: steps && own.has(k) && NUMBER.test(lines[k]) });
  }
  if (!old.length && before.size && appendAt(lines) === lines.length) out.push({ text: "" });
  if (steps && renumber) {
    const perPhase = phased(lines);
    let n = 0;
    for (const l of out) {
      if (perPhase && !l.step && HEADING.test(l.text)) n = 0;
      if (l.step) l.text = l.text.replace(NUMBER, (_m, ind: string, _n, d: string) => `${ind}${++n}${d}`);
    }
  }
  return out.map((l) => l.text);
}
