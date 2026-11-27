// The recipe editor's logic (issue #131, part 2 of #118), pure and without Obsidian: the draft the editor works on,
// what changed, the checks, and the note text after saving. Only the parts the user changed are written, and only
// the items of a list that differ (src/sectionDiff.ts); attempts, notes, images, own sections and own frontmatter
// stay byte for byte. A part is written only if it still holds what the editor was opened with (compare and set);
// the service in src/recipeEditService.ts runs this inside one `vault.process`.
import { FIELD_PRESETS, keyFor, NOTE_WORDS, readField, type FieldId, type NoteFormat } from "./noteFormat";
import type { Key } from "./i18n";
import { parseRecipe, readFrontmatter, sectionKey } from "./parse";
import { joinNote, noteLangOf, readHead, setValue, splitNote, type Section } from "./noteText";
import { keyFactsLine, yaml } from "./recipeNote";
import { LIMITS } from "./schemaorg";
import { cleanItem, cleanTitle, oneLine } from "./lineEscape";
import { diffSection, type Want } from "./sectionDiff";
import type { ListKind } from "./parse";
import { withEndings } from "./lineEndings";
import { setFactsLine, setTitleLine } from "./headEdit";
import { LIST_PARTS, fingerprints, formatHash, importedSection, storedField } from "./fingerprint";
import type { Recipe } from "./types";

export interface RecipeDraft {
  title: string;
  result?: string;
  /** The number of servings the note keeps in its own field (it drives the servings control). */
  servings?: number;
  /** The note has such a field (even an empty one): the editor shows it. */
  servingsField?: boolean;
  timeActive?: number;
  timeTotal?: number;
  category?: string;
  /** The category field of the note is a YAML list (an own name such as `tags`): shown, never changed. */
  categoryList?: string[];
  ingredients: { title?: string; items: string[] }[];
  steps: { title?: string; text: string }[];
  tips: string[];
}

/** What the editor reports as changed, in the order the notice names them. */
export type EditPart = "title" | "yield" | "servings" | "times" | "category" | "ingredients" | "steps" | "tips";
const ORDER: readonly EditPart[] = ["title", "yield", "servings", "times", "category", "ingredients", "steps", "tips"];

type Field =
  "title" | "result" | "servings" | "timeActive" | "timeTotal" | "category" | "ingredients" | "steps" | "tips";
const FIELDS: readonly Field[] = [
  "title",
  "result",
  "servings",
  "timeActive",
  "timeTotal",
  "category",
  "ingredients",
  "steps",
  "tips",
];
const PART_OF: Record<Field, EditPart> = {
  title: "title",
  result: "yield",
  servings: "servings",
  timeActive: "times",
  timeTotal: "times",
  category: "category",
  ingredients: "ingredients",
  steps: "steps",
  tips: "tips",
};

export const MAX_MINUTES = 10_000;
export const MAX_SERVINGS = 1000;

/** The words of each part for the notice and the conflict rows. */
export const PART_LABEL: Record<EditPart, Key> = {
  title: "editPartTitle",
  yield: "editPartYield",
  servings: "editPartServings",
  times: "editPartTimes",
  category: "editPartCategory",
  ingredients: "editPartIngredients",
  steps: "editPartSteps",
  tips: "editPartTips",
};

/** A typed number: empty is none, a plain number is itself, anything else is NaN (the checks say so). */
export function typedNumber(s: string): number | undefined {
  const t = s.trim().replace(",", ".");
  return t === "" ? undefined : /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

// ------------------------------------------------------------------ The draft

/** The category field of a note if it is a non-empty YAML list. */
export function categoryListOf(text: string, fields: NoteFormat["fields"]): string[] | undefined {
  const v = readField(readFrontmatter(text).fm, fields, "category");
  return Array.isArray(v) && v.length ? v : undefined;
}

/** The servings field of a note (`servings`, `portionen`): whether it has one, and its number if it is one. */
function servingsOf(text: string, fields: NoteFormat["fields"]): { has: boolean; n?: number } {
  const fm = readFrontmatter(text).fm;
  const v = readField(fm, fields, "servings");
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  const has = [fields.servings, FIELD_PRESETS.de.servings, FIELD_PRESETS.en.servings].some((k) => k in fm);
  return { has, n: Number.isFinite(n) && n > 0 ? n : undefined };
}

/** The draft of a recipe as the page shows it (what the editor starts with). */
export function draftOf(
  r: Recipe,
  extra: { categoryList?: string[]; servings?: { has: boolean; n?: number } } = {},
): RecipeDraft {
  return {
    title: r.title,
    result: r.result,
    ...(extra.servings?.has ? { servingsField: true, servings: extra.servings.n } : {}),
    timeActive: r.timeActive,
    timeTotal: r.timeTotal,
    category: r.category,
    ...(extra.categoryList ? { categoryList: extra.categoryList } : {}),
    ingredients: r.ingredients.map((g) => ({ title: g.title, items: g.ingredients })),
    steps: r.steps.map((s) => ({ title: s.title, text: s.text.trim() })),
    tips: r.tips,
  };
}

/**
 * The draft of the note text, read like the page reads it. `path` gives the title of a note without a `# ` line (its
 * file name), which then stays unwritten unless the user changes the title.
 */
export const draftOfText = (text: string, fields: NoteFormat["fields"], path = ""): RecipeDraft =>
  draftOf(parseRecipe(path, text, 0, fields), {
    categoryList: categoryListOf(text, fields),
    servings: servingsOf(text, fields),
  });

const orNone = (s: string) => s || undefined;
/** Zero is no time; a number that is not valid stays, so the check can name it instead of it being dropped. */
const minutes = (n: number | undefined) => (n === 0 ? undefined : n);

/** Lines of a text field, one entry per line: no empty lines, a typed list marker or checkbox taken off. */
export const linesOf = (text: string): string[] => text.split(/\r?\n/).map(cleanItem).filter(Boolean);

/**
 * Entries as they are compared and written, for the base and the draft alike (so a freshly opened editor never differs
 * from itself): one line each, trimmed, a typed marker or checkbox off, nothing empty, no group without ingredients.
 */
export function normalizeDraft(d: RecipeDraft): RecipeDraft {
  return {
    title: oneLine(d.title),
    result: orNone(oneLine(d.result)),
    ...(d.servingsField ? { servingsField: true, servings: d.servings } : {}),
    timeActive: minutes(d.timeActive),
    timeTotal: minutes(d.timeTotal),
    category: orNone(oneLine(d.category)),
    ...(d.categoryList ? { categoryList: d.categoryList } : {}),
    ingredients: d.ingredients
      .map((g) => ({ title: orNone(cleanTitle(g.title ?? "")), items: g.items.map(cleanItem).filter(Boolean) }))
      .filter((g) => g.items.length),
    steps: d.steps
      .map((s) => ({ title: orNone(cleanTitle(s.title ?? "")), text: oneLine(s.text) }))
      .filter((s) => s.title || s.text),
    tips: d.tips.map(cleanItem).filter(Boolean),
  };
}

// ------------------------------------------------------------------ What changed

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function changedFields(base: RecipeDraft, draft: RecipeDraft): Field[] {
  const [a, b] = [normalizeDraft(base), normalizeDraft(draft)];
  return FIELDS.filter((f) => !(f === "category" && a.categoryList) && !same(a[f], b[f]));
}

const partsOf = (fields: Field[]): EditPart[] => ORDER.filter((p) => fields.some((f) => PART_OF[f] === p));

/** The parts of the draft that differ from the base (the draft the editor was opened with). */
export const draftChanges = (base: RecipeDraft, draft: RecipeDraft): EditPart[] => partsOf(changedFields(base, draft));

/** One part of a draft as plain text (for showing the note's new version of a part in a conflict). */
export function partText(draft: RecipeDraft, part: EditPart): string {
  const d = normalizeDraft(draft);
  const show = (v: string | number | undefined) => (v === undefined ? "" : String(v));
  switch (part) {
    case "title":
      return d.title;
    case "yield":
      return show(d.result);
    case "servings":
      return show(d.servings);
    case "times":
      return [d.timeActive, d.timeTotal].map(show).join(" / ");
    case "category":
      return show(d.category);
    case "ingredients":
      return d.ingredients
        .map((g) => [g.title ? `${g.title}:` : "", ...g.items.map((i) => `- ${i}`)].filter(Boolean).join("\n"))
        .join("\n");
    case "steps":
      return d.steps.map((x, i) => `${i + 1}. ${x.title ? `${x.title}: ` : ""}${x.text}`).join("\n");
    case "tips":
      return d.tips.map((t) => `- ${t}`).join("\n");
  }
}

// ------------------------------------------------------------------ Checks

export type Issue =
  | { code: "title" | "time" | "servings" | "groupName" }
  | { code: "ingredients" | "steps" | "stepText"; max: number }
  /** The note's frontmatter is read differently by the editor's two readers: it is not safe to write. */
  | { code: "format" };

/**
 * What stops a save: no title, a time out of 0 to 10000, servings that are no positive number, a group without a name
 * after the first, more than the limits. Only the parts in `only` are checked (the changed ones); without it all.
 */
export function validateDraft(draft: RecipeDraft, only?: EditPart[]): Issue[] {
  const on = (p: EditPart) => !only || only.includes(p);
  const d = normalizeDraft(draft);
  const issues: Issue[] = [];
  if (on("title") && !d.title) issues.push({ code: "title" });
  const bad = (t: number | undefined) => t !== undefined && !(t > 0 && t <= MAX_MINUTES);
  if (on("times") && (bad(d.timeActive) || bad(d.timeTotal))) issues.push({ code: "time" });
  // Servings must be a positive number (empty clears the field).
  if (on("servings") && d.servings !== undefined && !(d.servings > 0 && d.servings <= MAX_SERVINGS))
    issues.push({ code: "servings" });
  if (on("ingredients")) {
    // A group without a name would be read as part of the group before it.
    if (d.ingredients.some((g, i) => i > 0 && !g.title)) issues.push({ code: "groupName" });
    if (d.ingredients.reduce((n, g) => n + g.items.length, 0) > LIMITS.ingredients)
      issues.push({ code: "ingredients", max: LIMITS.ingredients });
  }
  if (on("steps")) {
    if (d.steps.length > LIMITS.steps) issues.push({ code: "steps", max: LIMITS.steps });
    if (d.steps.some((s) => s.text.length > LIMITS.stepText)) issues.push({ code: "stepText", max: LIMITS.stepText });
  }
  return issues;
}

// ------------------------------------------------------------------ Saving

export interface ApplyOptions {
  format: NoteFormat;
  today: string;
  /** Path of the note: its name is the title of a note without a `# ` line. */
  path?: string;
}

export type ApplyResult =
  | { ok: true; text: string; parts: EditPart[] }
  /** A part to write changed since the editor was opened: `parts` says which, `base` is the note as it is now. */
  | { ok: false; conflict: true; parts: EditPart[]; base: RecipeDraft }
  | { ok: false; conflict: false; issues: Issue[] };

/** The wanted entries of a list part, in the order of the section. */
function wants(kind: ListKind, d: RecipeDraft): Want[] {
  if (kind === "steps") return d.steps.map((s) => ({ kind: "step", title: s.title, text: s.text }));
  if (kind === "tips") return d.tips.map((text) => ({ kind: "item", text }));
  return d.ingredients.flatMap((g): Want[] => [
    ...(g.title ? [{ kind: "group" as const, title: g.title }] : []),
    ...g.items.map((text): Want => ({ kind: "item", text })),
  ]);
}

const FM_FIELDS: Partial<Record<Field, FieldId>> = {
  result: "yield",
  servings: "servings",
  timeActive: "timeActive",
  timeTotal: "timeTotal",
  category: "category",
};

const fmValue = (f: Field, d: RecipeDraft): string => {
  const v = d[f as "result" | "servings" | "timeActive" | "timeTotal" | "category"];
  return v === undefined ? "" : typeof v === "number" ? String(v) : yaml(v);
};

/** Do the frontmatter readers of the editor (splitNote and parse.ts) agree where the frontmatter ends? */
function readersAgree(text: string): boolean {
  const note = splitNote(text);
  const body = joinNote(null, note.head, note.sections, "\n");
  return body.replace(/^\n+/, "") === readFrontmatter(text).bodyText.replace(/^\n+/, "");
}

/** A new section goes in its place of Ingredients, Steps, Tips relative to the sections the note has. */
function insertSection(sections: Section[], s: Section): void {
  const rank = (key: string) => CANONICAL.indexOf(key);
  const mine = rank(s.key);
  const later = sections.findIndex((x) => rank(x.key) > mine);
  const earlier = sections.reduce((at, x, i) => (rank(x.key) >= 0 && rank(x.key) < mine ? i : at), -1);
  const attempts = sections.findIndex((x) => x.key === "versuche" || x.key === "notizen");
  const at = later >= 0 ? later : earlier >= 0 ? earlier + 1 : attempts >= 0 ? attempts : sections.length;
  sections.splice(at, 0, s);
}
const CANONICAL = ["zutaten", "schritte", "tipps"];

/**
 * The note text with the changes of `draft` against `base` written, or why not. `base` is what the editor was opened
 * with; a part to write must still equal it in `text` (compare and set), else nothing is written.
 */
export function applyDraft(rawText: string, base: RecipeDraft, draft: RecipeDraft, o: ApplyOptions): ApplyResult {
  const fields = changedFields(base, draft);
  if (!fields.length) return { ok: true, text: rawText, parts: [] };
  const issues = validateDraft(draft, partsOf(fields));
  if (issues.length) return { ok: false, conflict: false, issues };
  // A byte order mark stays where it is; the rest is read without it.
  const bom = rawText.startsWith("\uFEFF") ? "\uFEFF" : "";
  const text = rawText.slice(bom.length);
  if (!readersAgree(text)) return { ok: false, conflict: false, issues: [{ code: "format" }] };
  const [b, d] = [normalizeDraft(base), normalizeDraft(draft)];
  const current = draftOfText(text, o.format.fields, o.path);
  const now = normalizeDraft(current);
  const clash = fields.filter((f) => !same(now[f], b[f]));
  if (clash.length) return { ok: false, conflict: true, parts: partsOf(clash), base: current };

  const f = o.format;
  const note = splitNote(text);
  const recipe = parseRecipe("", text, 0, f.fields);
  const parsed = note.fm ? readFrontmatter(text).fm : {};

  let fm = note.fm;
  const setField = (id: FieldId, value: string) => {
    fm = setValue(fm ?? [], keyFor(parsed, f.fields, id), value);
  };
  for (const field of fields) if (FM_FIELDS[field]) setField(FM_FIELDS[field], fmValue(field, d));
  // Hand edits of an imported note count from now on (ADR 0006): without a fingerprint the state before the edit is
  // its baseline. An existing one stays (the edited part now differs from it); another version is never overwritten.
  const stored = storedField(recipe);
  if ((recipe.importState || recipe.job) && !stored.foreign && !Object.keys(stored.hashes).length)
    setField("importHash", formatHash(fingerprints(text, f.fields, recipe), stored.extra));
  setField("updated", o.today);

  let head = note.head;
  if (fields.includes("title")) head = setTitleLine(head, d.title);
  const sections = note.sections.map((s) => ({ ...s }));
  const lang = noteLangOf(sections, readHead(head).facts, f.lang);
  if (fields.some((x) => x === "result" || x === "timeActive" || x === "timeTotal")) {
    const merged = parseRecipe("", ["---", ...(fm ?? []), "---"].join("\n"), 0, f.fields);
    head = setFactsLine(head, keyFactsLine(merged, lang));
  }

  for (const part of LIST_PARTS) {
    if (!fields.includes(part)) continue;
    const section = importedSection(sections, part);
    if (section) section.lines = diffSection(section.lines, part, wants(part, d));
    else {
      const lines = diffSection([], part, wants(part, d));
      const heading = NOTE_WORDS[lang][part];
      if (lines.length) insertSection(sections, { heading: `## ${heading}`, key: sectionKey(heading), lines });
    }
  }
  const next = withEndings(text, joinNote(fm, head, sections, "\n"));
  return { ok: true, text: bom + next, parts: partsOf(fields) };
}

// ------------------------------------------------------------------ Undo

/** What a save remembers for "Undo": the note before and exactly what the save wrote. */
export interface EditToken {
  before: string;
  after: string;
}

/** The note before the edit, but only while it is still exactly what the edit wrote (compare and set); else undefined. */
export const undoEdit = (current: string, token: EditToken): string | undefined =>
  current === token.after ? token.before : undefined;
