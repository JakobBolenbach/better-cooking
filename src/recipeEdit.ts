// The recipe editor's logic (issue #131, part 2 of #118), pure and without Obsidian: the draft the editor works on,
// what changed, the checks, and the note text after saving. Only the parts the user changed are written, and only
// the items of a list that differ (src/sectionDiff.ts); attempts, notes, images, own sections and own frontmatter
// stay byte for byte. A part is written only if it still holds what the editor was opened with (compare and set);
// the service in src/recipeEditService.ts runs this inside one `vault.process`.
import { keyFor, NOTE_WORDS, readField, type FieldId, type NoteFormat, type NoteLang } from "./noteFormat";
import { parseRecipe, readFrontmatter, sectionKey } from "./parse";
import { joinNote, readHead, setValue, splitNote, type Section } from "./noteText";
import { keyFactsLine } from "./recipeNote";
import { LIMITS } from "./schemaorg";
import { cleanTitle, diffSection, unescapeLead, type ListKind, type Want } from "./sectionDiff";
import { setFactsLine, setTitleLine } from "./headEdit";
import { LIST_PARTS, fingerprints, formatHash, importedSection, storedField } from "./fingerprint";
import type { Recipe } from "./types";

export interface RecipeDraft {
  title: string;
  result?: string;
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
export type EditPart = "title" | "yield" | "times" | "category" | "ingredients" | "steps" | "tips";
const ORDER: readonly EditPart[] = ["title", "yield", "times", "category", "ingredients", "steps", "tips"];

type Field = "title" | "result" | "timeActive" | "timeTotal" | "category" | "ingredients" | "steps" | "tips";
const FIELDS: readonly Field[] = [
  "title",
  "result",
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
  timeActive: "times",
  timeTotal: "times",
  category: "category",
  ingredients: "ingredients",
  steps: "steps",
  tips: "tips",
};

export const MAX_MINUTES = 10_000;

// ------------------------------------------------------------------ The draft

/** The category field of a note if it is a non-empty YAML list. */
export function categoryListOf(text: string, fields: NoteFormat["fields"]): string[] | undefined {
  const v = readField(readFrontmatter(text).fm, fields, "category");
  return Array.isArray(v) && v.length ? v : undefined;
}

/** The draft of a recipe as the page shows it (what the editor starts with). */
export function draftOf(r: Recipe, categoryList?: string[]): RecipeDraft {
  return {
    title: r.title,
    result: r.result,
    timeActive: r.timeActive,
    timeTotal: r.timeTotal,
    category: r.category,
    ...(categoryList ? { categoryList } : {}),
    ingredients: r.ingredients.map((g) => ({ title: g.title, items: g.ingredients.map(unescapeLead) })),
    steps: r.steps.map((s) => ({ title: s.title, text: unescapeLead(s.text.trim()) })),
    tips: r.tips.map(unescapeLead),
  };
}

/** The draft of the note text, read like the page reads it. */
export const draftOfText = (text: string, fields: NoteFormat["fields"]): RecipeDraft =>
  draftOf(parseRecipe("", text, 0, fields), categoryListOf(text, fields));

const oneLine = (s: string | undefined) =>
  (s ?? "").replace(/[\s\u2028\u2029]*[\r\n\t\u2028\u2029]+[\s]*/g, " ").trim();
const orNone = (s: string) => s || undefined;
const minutes = (n: number | undefined) => (n && n > 0 ? n : undefined);

/** Lines of a text field, one entry per line: no empty lines, a typed list marker or checkbox taken off. */
export function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) =>
      l
        .trim()
        .replace(/^([-*•]\s+)?(\[[ xX/-]\]\s+)?/, "")
        .trim(),
    )
    .filter(Boolean);
}

/** Entries as they are compared and written: one line each, trimmed, nothing empty, no group without ingredients. */
export function normalizeDraft(d: RecipeDraft): RecipeDraft {
  return {
    title: oneLine(d.title),
    result: orNone(oneLine(d.result)),
    timeActive: minutes(d.timeActive),
    timeTotal: minutes(d.timeTotal),
    category: orNone(oneLine(d.category)),
    ...(d.categoryList ? { categoryList: d.categoryList } : {}),
    ingredients: d.ingredients
      .map((g) => ({ title: orNone(cleanTitle(g.title ?? "")), items: g.items.map(oneLine).filter(Boolean) }))
      .filter((g) => g.items.length),
    steps: d.steps
      .map((s) => ({ title: orNone(cleanTitle(s.title ?? "")), text: oneLine(s.text) }))
      .filter((s) => s.title || s.text),
    tips: d.tips.map(oneLine).filter(Boolean),
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

// ------------------------------------------------------------------ Checks

export type Issue =
  | { code: "title" }
  | { code: "time" }
  | { code: "groupName" }
  | { code: "ingredients" | "steps"; max: number }
  | { code: "stepText"; max: number };

/** What stops a save: no title, a time out of 0 to 10000, a group without a name after the first, more than the limits. */
export function validateDraft(draft: RecipeDraft): Issue[] {
  const d = normalizeDraft(draft);
  const issues: Issue[] = [];
  if (!d.title) issues.push({ code: "title" });
  if ([draft.timeActive, draft.timeTotal].some((t) => t !== undefined && !(t >= 0 && t <= MAX_MINUTES)))
    issues.push({ code: "time" });
  // A group without a name would be read as part of the group before it.
  if (d.ingredients.some((g, i) => i > 0 && !g.title)) issues.push({ code: "groupName" });
  if (d.ingredients.reduce((n, g) => n + g.items.length, 0) > LIMITS.ingredients)
    issues.push({ code: "ingredients", max: LIMITS.ingredients });
  if (d.steps.length > LIMITS.steps) issues.push({ code: "steps", max: LIMITS.steps });
  if (d.steps.some((s) => s.text.length > LIMITS.stepText)) issues.push({ code: "stepText", max: LIMITS.stepText });
  return issues;
}

// ------------------------------------------------------------------ Saving

export interface ApplyOptions {
  format: NoteFormat;
  today: string;
}

export type ApplyResult =
  | { ok: true; text: string; parts: EditPart[] }
  /** `conflict`: a part to write changed since the editor was opened; otherwise `issues` says what is wrong. */
  | { ok: false; conflict: boolean; issues?: Issue[] };

/** The wanted entries of a list part, in the order of the section. */
function wants(kind: ListKind, d: RecipeDraft): Want[] {
  if (kind === "steps") return d.steps.map((s) => ({ kind: "step", title: s.title, text: s.text }));
  if (kind === "tips") return d.tips.map((text) => ({ kind: "item", text }));
  return d.ingredients.flatMap((g): Want[] => [
    ...(g.title ? [{ kind: "group" as const, title: g.title }] : []),
    ...g.items.map((text): Want => ({ kind: "item", text })),
  ]);
}

/** The language of a note's own words: its headings, else its key facts line, else the format's. */
function noteLang(sections: Section[], facts: string | undefined, fallback: NoteLang): NoteLang {
  const names = sections.map((s) => /^##\s+(.+?)\s*$/.exec(s.heading)?.[1].toLowerCase() ?? "");
  const [de, en] = (["de", "en"] as const).map((l) =>
    [
      NOTE_WORDS[l].ingredients,
      NOTE_WORDS[l].steps,
      NOTE_WORDS[l].tips,
      NOTE_WORDS[l].attempts,
      NOTE_WORDS[l].notes,
    ].some((w) => names.includes(w.toLowerCase())),
  );
  if (de !== en) return de ? "de" : "en";
  if (facts) return /^\*\*(Yield|Servings|Active|Total)/.test(facts) ? "en" : "de";
  return fallback;
}

const FM_FIELDS: Partial<Record<Field, FieldId>> = {
  result: "yield",
  timeActive: "timeActive",
  timeTotal: "timeTotal",
  category: "category",
};

const fmValue = (f: Field, d: RecipeDraft): string => {
  const v = d[f as "result" | "timeActive" | "timeTotal" | "category"];
  return v === undefined ? "" : typeof v === "number" ? String(v) : JSON.stringify(v);
};

/**
 * The note text with the changes of `draft` against `base` written, or why not. `base` is what the editor was opened
 * with; a part to write must still equal it in `text` (compare and set), else nothing is written.
 */
export function applyDraft(text: string, base: RecipeDraft, draft: RecipeDraft, o: ApplyOptions): ApplyResult {
  const fields = changedFields(base, draft);
  if (!fields.length) return { ok: true, text, parts: [] };
  const issues = validateDraft(draft);
  if (issues.length) return { ok: false, conflict: false, issues };
  const [b, d] = [normalizeDraft(base), normalizeDraft(draft)];
  const now = normalizeDraft(draftOfText(text, o.format.fields));
  if (fields.some((f) => !same(now[f], b[f]))) return { ok: false, conflict: true };

  const f = o.format;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
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
  const facts = readHead(head).facts;
  const lang = noteLang(sections, facts, f.lang);
  if (fields.some((x) => x === "result" || x === "timeActive" || x === "timeTotal")) {
    const merged = parseRecipe("", ["---", ...(fm ?? []), "---"].join("\n"), 0, f.fields);
    head = setFactsLine(head, keyFactsLine(merged, lang));
  }

  const w = NOTE_WORDS[lang];
  const missing: Section[] = [];
  for (const part of LIST_PARTS) {
    if (!fields.includes(part)) continue;
    const section = importedSection(sections, part);
    if (section) section.lines = diffSection(section.lines, part, wants(part, d));
    else {
      const lines = diffSection([], part, wants(part, d));
      if (lines.length) missing.push({ heading: `## ${w[part]}`, key: sectionKey(w[part]), lines });
    }
  }
  const at = sections.findIndex((s) => s.key === "versuche" || s.key === "notizen");
  sections.splice(at < 0 ? sections.length : at, 0, ...missing);
  return { ok: true, text: joinNote(fm, head, sections, eol), parts: partsOf(fields) };
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
