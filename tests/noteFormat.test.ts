import { beforeEach, describe, expect, it } from "vitest";
import {
  FIELD_PRESETS,
  importStateFrom,
  keyFor,
  makeNoteFormat,
  ownFieldNames,
  readField,
  statusFrom,
  statusValueFor,
} from "../src/noteFormat";
import { insertAttempt, parseRecipe } from "../src/parse";
import { recipeNote } from "../src/recipeNote";
import { readExtraProperties } from "../src/extraProperties";
import { setLanguage } from "../src/i18n";
import type { SchemaRecipe } from "../src/schemaorg";

beforeEach(() => setLanguage("en"));

const en = makeNoteFormat("en").format;
const de = makeNoteFormat("de").format;

const soup: SchemaRecipe = {
  title: "Lentil soup",
  description: "Quick and warming.",
  category: "Soup",
  author: "Test Kitchen",
  result: "4 servings",
  timeActive: 20,
  timeTotal: 75,
  ingredients: ["200 g red lentils", "1 onion"],
  steps: [{ text: "Chop the onion." }, { title: "Simmer", text: "Cook for 20 minutes." }],
  images: [],
};

describe("makeNoteFormat", () => {
  it("takes own names over the preset", () => {
    const r = makeNoteFormat("en", "category: tags\n# comment\n\nrating: stars");
    expect(r.hints).toEqual([]);
    expect(r.format.fields.category).toBe("tags");
    expect(r.format.fields.rating).toBe("stars");
    expect(r.format.fields.source).toBe("source");
  });

  it("skips unknown fields, invalid names and a name used twice", () => {
    const r = makeNoteFormat("de", "colour: x\ncategory: mit leer\nrating: kategorie");
    expect(r.hints).toHaveLength(3);
    expect(r.format.fields.category).toBe("kategorie");
  });
});

describe("reading both languages", () => {
  it("reads values in German, English and under own names", () => {
    const fields = makeNoteFormat("de", "category: tags").format.fields;
    expect(readField({ tags: "Soup", kategorie: "Suppe" }, fields, "category")).toBe("Soup");
    expect(readField({ kategorie: "Suppe" }, fields, "category")).toBe("Suppe");
    expect(readField({ category: "Soup" }, fields, "category")).toBe("Soup");
    expect(readField({ category: "" }, fields, "category")).toBeUndefined();
  });

  it("normalizes status and import values", () => {
    expect(statusFrom("proven")).toBe("bewaehrt");
    expect(statusFrom("Verworfen")).toBe("verworfen");
    expect(statusFrom("maybe")).toBeUndefined();
    expect(importStateFrom("failed")).toBe("fehler");
    expect(importStateFrom("teilweise")).toBe("teilweise");
    expect(importStateFrom("odd")).toBe("odd");
  });

  it("parses an English note with own field names", () => {
    const text = [
      "---",
      "type: recipe",
      "status: proven",
      "tags: Soup",
      "rating: 4",
      "last_made: 2026-11-20",
      "import: partial",
      "---",
      "# Soup",
    ].join("\n");
    const r = parseRecipe("x.md", text, 1, makeNoteFormat("en", "category: tags").format.fields);
    expect(r.status).toBe("bewaehrt");
    expect(r.category).toBe("Soup");
    expect(r.rating).toBe(4);
    expect(r.lastMade).toBe("2026-11-20");
    expect(r.importState).toBe("teilweise");
  });
});

describe("writing", () => {
  it("writes an English note that reads back the same", () => {
    const note = recipeNote(soup, { source: "https://example.org/soup", today: "2026-11-26", format: en });
    expect(note).toContain('type: recipe\nstatus: to-try\ncategory: "Soup"');
    expect(note).toContain("time_active: 20\ntime_total: 75");
    expect(note).toContain("import: done");
    expect(note).toContain("**Yield:** 4 servings · **Active:** about 20 min · **Total:** about 1 h 15 min");
    expect(note).toContain("Source: [example.org](https://example.org/soup), Test Kitchen");
    expect(note).toMatch(/## Ingredients[\s\S]*## Steps[\s\S]*## Attempts[\s\S]*## Notes/);
    expect(note).not.toMatch(/zutaten|kategorie|ausprobieren/i);
    const r = parseRecipe("x.md", note, 1, en.fields);
    expect(r.status).toBe("ausprobieren");
    expect(r.category).toBe("Soup");
    expect(r.timeTotal).toBe(75);
    expect(r.ingredients[0].ingredients).toEqual(soup.ingredients);
    expect(r.steps[1]).toEqual({ title: "Simmer", text: "Cook for 20 minutes." });
    expect(r.description).toBe("Quick and warming.");
  });

  it("names the missing part in the note's language", () => {
    const note = recipeNote(
      { ...soup, steps: [] },
      { source: "https://example.org/x", today: "2026-11-26", format: en },
    );
    expect(note).toContain('import: partial\nimport_error: "The page contains no Steps."');
  });

  it("keeps the German format by default", () => {
    const note = recipeNote(soup, { source: "https://example.org/soup", today: "2026-11-26" });
    expect(note).toContain("typ: rezept\nstatus: ausprobieren\nkategorie:");
    expect(note).toContain("**Aktiv:** ca. 20 Min.");
  });

  it("uses own field names", () => {
    const f = makeNoteFormat("en", "category: tags").format;
    expect(recipeNote(soup, { source: "https://example.org/soup", today: "2026-11-26", format: f })).toContain(
      'tags: "Soup"',
    );
  });

  it("writes into the field a note already has", () => {
    expect(keyFor({ bewertung: 3 }, en.fields, "rating")).toBe("bewertung");
    expect(keyFor({ rating: 3 }, de.fields, "rating")).toBe("rating");
    expect(keyFor({}, en.fields, "rating")).toBe("rating");
    expect(statusValueFor("ausprobieren", en, "bewaehrt")).toBe("bewaehrt");
    expect(statusValueFor("to-try", de, "bewaehrt")).toBe("proven");
    expect(statusValueFor(undefined, en, "verworfen")).toBe("discarded");
  });

  it("writes attempts in the language of the section", () => {
    const english = "# X\n\n## Notes\n- a\n";
    const fresh = insertAttempt(english, { date: "26.11.2026", result: "good", rating: 4 }, "en");
    expect(fresh).toContain("## Attempts\n### 26.11.2026\n- Result: good\n- Rating: 4/5\n\n## Notes");
    const german = "# X\n\n## Versuche\n\n## Notizen\n";
    expect(insertAttempt(german, { date: "26.11.2026" }, "en")).toContain("### 26.11.2026\n- Gemacht");
  });
});

describe("extra properties", () => {
  it("must not override fields of either language or own names", () => {
    const own = ownFieldNames(makeNoteFormat("en", "category: tags").format);
    const r = readExtraProperties("rating: 5\nbewertung: 5\ntags: x\ncontext: private", own);
    expect(r.properties).toEqual([["context", "private"]]);
    expect(r.hints).toHaveLength(3);
  });
});

it("presets cover the same fields", () => {
  expect(Object.keys(FIELD_PRESETS.en)).toEqual(Object.keys(FIELD_PRESETS.de));
});

describe("hint about missing parts for pasted text (#116)", () => {
  it("says text instead of page", () => {
    const o = { today: "2026-11-26", fromText: true };
    expect(recipeNote({ ...soup, steps: [] }, { ...o, format: en })).toContain(
      'import_error: "The text contains no steps."',
    );
    expect(recipeNote({ ...soup, steps: [] }, o)).toContain("Der Text enthält keine Schritte.");
  });
});
