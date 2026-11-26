// Field names, values and headings of recipe notes in German or English, plus own field names (issue #1).
// Reading always accepts both languages (and the user's own names), so mixed collections keep working;
// the setting decides what the plugin writes. Pure functions without Obsidian, tested in tests/noteFormat.test.ts.

import type { Status } from "./types";
import { tr } from "./i18n";

export type NoteLang = "de" | "en";

export type FieldId =
  | "type"
  | "status"
  | "category"
  | "source"
  | "image"
  | "author"
  | "yield"
  | "servings"
  | "timeActive"
  | "timeTotal"
  | "rating"
  | "lastMade"
  | "importState"
  | "importError"
  | "job"
  | "created"
  | "updated"
  | "translationOf"
  | "language";

export type Fields = Record<FieldId, string>;

export const FIELD_PRESETS: Record<NoteLang, Fields> = {
  de: {
    type: "typ",
    status: "status",
    category: "kategorie",
    source: "quelle",
    image: "bild",
    author: "autor",
    yield: "ergebnis",
    servings: "portionen",
    timeActive: "zeit_aktiv",
    timeTotal: "zeit_gesamt",
    rating: "bewertung",
    lastMade: "zuletzt_gemacht",
    importState: "import",
    importError: "import_fehler",
    job: "auftrag",
    created: "erstellt",
    updated: "aktualisiert",
    translationOf: "uebersetzung_von",
    language: "sprache",
  },
  en: {
    type: "type",
    status: "status",
    category: "category",
    source: "source",
    image: "image",
    author: "author",
    yield: "yield",
    servings: "servings",
    timeActive: "time_active",
    timeTotal: "time_total",
    rating: "rating",
    lastMade: "last_made",
    importState: "import",
    importError: "import_error",
    job: "job",
    created: "created",
    updated: "updated",
    translationOf: "translation_of",
    language: "language",
  },
};

export const FIELD_IDS = Object.keys(FIELD_PRESETS.de) as FieldId[];

/** Status values as written in the frontmatter. The data model keeps the German value as its id. */
const STATUS_VALUES: Record<NoteLang, Record<Status, string>> = {
  de: { ausprobieren: "ausprobieren", bewaehrt: "bewaehrt", verworfen: "verworfen" },
  en: { ausprobieren: "to-try", bewaehrt: "proven", verworfen: "discarded" },
};

/** Import states; the data model keeps the German value. */
export type ImportState = "fertig" | "teilweise" | "fehler";
const IMPORT_VALUES: Record<NoteLang, Record<ImportState, string>> = {
  de: { fertig: "fertig", teilweise: "teilweise", fehler: "fehler" },
  en: { fertig: "done", teilweise: "partial", fehler: "failed" },
};

/** Words the plugin writes into the body of a note. */
export const NOTE_WORDS = {
  de: {
    type: "rezept",
    ingredients: "Zutaten",
    steps: "Schritte",
    tips: "Tipps",
    attempts: "Versuche",
    notes: "Notizen",
    images: "Bilder",
    yield: "Ergebnis",
    active: "Aktiv",
    total: "Gesamt",
    about: "ca.",
    source: "Quelle",
    changed: "Geändert",
    result: "Ergebnis",
    rating: "Bewertung",
    made: "Gemacht",
    and: "und",
    missing: "Die Seite enthält keine {what}.",
    shoppingList: "Einkaufsliste",
    mealPlan: "Wochenplan",
  },
  en: {
    type: "recipe",
    ingredients: "Ingredients",
    steps: "Steps",
    tips: "Tips",
    attempts: "Attempts",
    notes: "Notes",
    images: "Images",
    yield: "Yield",
    active: "Active",
    total: "Total",
    about: "about",
    source: "Source",
    changed: "Changed",
    result: "Result",
    rating: "Rating",
    made: "Made",
    and: "and",
    missing: "The page contains no {what}.",
    shoppingList: "Shopping list",
    mealPlan: "Meal plan",
  },
} as const;

export interface NoteFormat {
  lang: NoteLang;
  fields: Fields;
}

export interface NoteFormatResult {
  format: NoteFormat;
  /** Readable hints about override lines that were skipped. */
  hints: string[];
}

const NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** Format for a language plus own field names, one `fieldId: name` per line (e.g. `category: tags`). */
export function makeNoteFormat(lang: NoteLang, overrides = ""): NoteFormatResult {
  const fields: Fields = { ...FIELD_PRESETS[lang] };
  const hints: string[] = [];
  for (const raw of overrides.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf(":");
    const id = (i < 0 ? line : line.slice(0, i)).trim();
    const name = i < 0 ? "" : line.slice(i + 1).trim();
    if (!(FIELD_IDS as string[]).includes(id)) {
      hints.push(tr("fieldUnknown", { id: id.slice(0, 40), ids: FIELD_IDS.join(", ") }));
      continue;
    }
    if (!NAME.test(name)) {
      hints.push(tr("fieldInvalidName", { id }));
      continue;
    }
    fields[id as FieldId] = name;
  }
  const used = new Map<string, FieldId>();
  for (const id of FIELD_IDS) {
    const other = used.get(fields[id]);
    if (other) hints.push(tr("fieldTwice", { name: fields[id], a: other, b: id }));
    else used.set(fields[id], id);
  }
  return { format: { lang, fields }, hints };
}

export const DEFAULT_FORMAT: NoteFormat = { lang: "de", fields: FIELD_PRESETS.de };

/** All frontmatter names the plugin may write for a format (for the extra properties check). */
export const ownFieldNames = (f: NoteFormat): string[] => [
  ...new Set([...Object.values(f.fields), ...Object.values(FIELD_PRESETS.de), ...Object.values(FIELD_PRESETS.en)]),
];

/** Value of a field: the configured name first, then the German and the English name. */
export function readField(fm: Record<string, unknown>, f: Fields, id: FieldId): unknown {
  for (const k of [f[id], FIELD_PRESETS.de[id], FIELD_PRESETS.en[id]])
    if (fm[k] !== undefined && fm[k] !== "") return fm[k];
  return undefined;
}

/** Status from a frontmatter value in either language. */
export function statusFrom(v: unknown): Status | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  for (const lang of ["de", "en"] as NoteLang[])
    for (const [id, val] of Object.entries(STATUS_VALUES[lang])) if (val === s) return id as Status;
  return undefined;
}

export const statusValue = (f: NoteFormat, s: Status) => STATUS_VALUES[f.lang][s];

/** Import state from a frontmatter value in either language; unknown values stay as they are. */
export function importStateFrom(v: unknown): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  const s = v.trim().toLowerCase();
  for (const lang of ["de", "en"] as NoteLang[])
    for (const [id, val] of Object.entries(IMPORT_VALUES[lang])) if (val === s) return id;
  return v.trim();
}

export const importValue = (f: NoteFormat, s: ImportState) => IMPORT_VALUES[f.lang][s];

/**
 * Key to write a field into an existing note: the name the note already uses (own, German or English),
 * so a note never gets the same field twice; otherwise the configured name.
 */
export function keyFor(fm: Record<string, unknown>, f: Fields, id: FieldId): string {
  for (const k of [f[id], FIELD_PRESETS.de[id], FIELD_PRESETS.en[id]]) if (k in fm) return k;
  return f[id];
}

/** Status value for an existing note: in the language of the value it has, otherwise in the format's language. */
export function statusValueFor(existing: unknown, f: NoteFormat, s: Status): string {
  const v = typeof existing === "string" ? existing.trim().toLowerCase() : "";
  if (Object.values(STATUS_VALUES.de).includes(v) && !Object.values(STATUS_VALUES.en).includes(v))
    return STATUS_VALUES.de[s];
  if (Object.values(STATUS_VALUES.en).includes(v)) return STATUS_VALUES.en[s];
  return statusValue(f, s);
}
