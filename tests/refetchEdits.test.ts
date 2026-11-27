// "Fetch again" and hand edits (ADR 0006, issue #130): parts the user changed since the import are kept.
import { describe, expect, it } from "vitest";
import { changesBetween, planRefetch, replacedParts, updatedNote } from "../src/refetch";
import { fingerprints, storedHashes } from "../src/fingerprint";
import { recipeNote } from "../src/recipeNote";
import { parseRecipe } from "../src/parse";
import { DEFAULT_FORMAT, makeNoteFormat } from "../src/noteFormat";
import type { SchemaRecipe } from "../src/schemaorg";

const SOURCE = "https://example.org/biskuit";
const first: SchemaRecipe = {
  title: "Biskuit",
  description: "Alt.",
  result: "1 Form",
  timeActive: 20,
  ingredients: ["4 Eier", "100 g Zucker"],
  steps: [{ text: "Eier trennen. Eiweiß und Zucker schlagen." }],
  tips: ["Ofen vorheizen."],
  images: [],
};
const page: SchemaRecipe = {
  ...first,
  title: "Einfacher Biskuit",
  description: "Neu.",
  result: "2 Portionen",
  timeActive: 25,
  ingredients: ["4 Eier", "100 g Zucker", "200 g Mehl"],
  steps: [
    { title: "Trennen", text: "Eier trennen." },
    { title: "Schlagen", text: "Eiweiß und Zucker schlagen." },
  ],
  tips: undefined,
};
const F = DEFAULT_FORMAT.fields;
const o = { format: DEFAULT_FORMAT, today: "2026-11-27" };
const imported = (format = DEFAULT_FORMAT) => recipeNote(first, { source: SOURCE, today: "2026-11-01", format });
const edit = (t: string) => t.replace("- 100 g Zucker", "- 80 g Zucker");
const read = (t: string) => parseRecipe("Recipes/Biskuit.md", t, 0, F);
const plan = (text: string, p = page, extra: object = {}) => planRefetch("a.md", text, p, { ...o, ...extra });

describe("planRefetch with a stored fingerprint", () => {
  it("names the parts edited by hand and nothing else", () => {
    expect(plan(imported()).edited).toEqual([]);
    const p = plan(edit(imported()));
    expect(p.edited).toEqual(["ingredients"]);
    expect(p.kept).toEqual(["ingredients"]);
    expect(p.changes.map((c) => c.part)).toEqual(
      expect.arrayContaining(["title", "description", "yield", "times", "ingredients", "steps"]),
    );
  });

  it("keeps an edited part by default and replaces the rest", () => {
    const r = read(plan(edit(imported())).text);
    expect(r.ingredients[0].ingredients).toEqual(["4 Eier", "80 g Zucker"]);
    expect(r.steps.map((s) => s.title)).toEqual(["Trennen", "Schlagen"]);
    expect(r.title).toBe("Einfacher Biskuit");
    expect(r.tips).toEqual(["Ofen vorheizen."]);
  });

  it("replaces an edited part when the user says so", () => {
    const p = plan(edit(imported()), page, { replace: ["ingredients"] });
    expect(p.kept).toEqual([]);
    expect(read(p.text).ingredients[0].ingredients).toEqual(["4 Eier", "100 g Zucker", "200 g Mehl"]);
    expect(plan(p.text).edited).toEqual([]);
  });

  it("keeps title, description, yield and times in header and fields", () => {
    const text = imported().replace("# Biskuit", "# Mein Biskuit").replace("Alt.", "Meine Beschreibung.");
    const edited = text.replace(/^ergebnis:.*$/m, 'ergebnis: "3 Formen"').replace(/^zeit_aktiv:.*$/m, "zeit_aktiv: 30");
    const p = plan(edited);
    expect(p.edited).toEqual(["title", "description", "yield", "times"]);
    const r = read(p.text);
    expect([r.title, r.description, r.result, r.timeActive]).toEqual([
      "Mein Biskuit",
      "Meine Beschreibung.",
      "3 Formen",
      30,
    ]);
    expect(r.ingredients[0].ingredients).toHaveLength(3);
  });

  it("a deleted title stays deleted when the edit is kept, and is replaced when asked", () => {
    const text = imported().replace("# Biskuit\n", "");
    expect(plan(text).edited).toEqual(["title"]);
    expect(plan(text).text).not.toMatch(/^# /m);
    expect(plan(text, page, { replace: ["title"] }).text).toMatch(/^# Einfacher Biskuit$/m);
  });

  it("a kept part keeps its stored fingerprint, so the edit is still found; replaced parts get the new one", () => {
    const text = edit(imported());
    const t = plan(text).text;
    const stored = storedHashes(read(t));
    const before = storedHashes(read(text));
    expect(stored.ingredients).toBe(before.ingredients);
    expect(stored.steps).toBe(fingerprints(t, F).steps);
    expect(stored.steps).not.toBe(before.steps);
    expect(plan(t).edited).toEqual(["ingredients"]);
  });

  it("writes the fingerprint only for parts really replaced", () => {
    // no tips from the page: stored tips stay; placeholder title: stored title stays; no steps: stored steps stay
    const t = updatedNote(imported(), { ...page, title: "Rezept", steps: [], tips: undefined }, o);
    const was = storedHashes(read(imported()));
    const now = storedHashes(read(t));
    expect([now.title, now.steps, now.tips]).toEqual([was.title, was.steps, was.tips]);
    expect(now.ingredients).toBe(fingerprints(t, F).ingredients);
    expect(plan(t, { ...page, title: "Rezept", steps: [] }).edited).toEqual([]);
  });

  it("a second section of the same name is not replaced and not hashed", () => {
    const text = imported() + "\n## Zutaten\n- 1 Prise Salz\n";
    const t = plan(text).text;
    expect(t).toContain("## Zutaten\n- 1 Prise Salz");
    expect(plan(t).edited).toEqual([]);
  });

  it("formatting differences are no edit and no change", () => {
    const text = imported().replace("- 4 Eier", "- [x]   4 Eier").replace("1. Eier", "1.   Eier");
    expect(plan(text).edited).toEqual([]);
    expect(changesBetween(imported(), text, F)).toEqual([]);
  });

  it("writes nothing when only kept parts differ", () => {
    const text = edit(imported());
    const same: SchemaRecipe = { ...first, ingredients: ["4 Eier", "100 g Zucker", "200 g Mehl"] };
    const p = plan(text, same);
    expect(p.changes.map((c) => c.part)).toEqual(["ingredients"]);
    expect(p.text).toBe(text);
  });
});

describe("replacedParts", () => {
  it("is what the source gave minus the kept parts", () => {
    expect([...replacedParts(page)].sort()).toEqual(
      ["description", "ingredients", "steps", "times", "title", "yield"].sort(),
    );
    expect([...replacedParts({ ...page, title: "Rezept", steps: [] }, ["yield"])].sort()).toEqual(
      ["description", "ingredients", "times"].sort(),
    );
  });
});

describe("planRefetch without a stored fingerprint", () => {
  const bare = () => edit(imported()).replace(/^import_hash:.*\n/m, "");
  it("behaves as before: nothing is known as edited, everything is replaced", () => {
    const p = plan(bare());
    expect(p.edited).toEqual([]);
    expect(read(p.text).ingredients[0].ingredients).toHaveLength(3);
  });

  it("a broken, folded or foreign value counts as none", () => {
    for (const v of ["import_hash: kaputt=", 'import_hash: "v2;title:abc"', 'import_hash: >-\n  "v1;title:abc"'])
      expect(plan(edit(imported()).replace(/^import_hash:.*$/m, v)).edited).toEqual([]);
  });

  it("the first fetch writes the fingerprint of the replaced parts", () => {
    const t = updatedNote(bare(), page, o);
    expect(storedHashes(read(t)).ingredients).toBeDefined();
    expect(t.match(/^import_hash:/gm)).toHaveLength(1);
  });
});

describe("the fingerprint field", () => {
  it("is written under an own name when the note or the format has one", () => {
    const format = makeNoteFormat("de", "importHash: fingerabdruck").format;
    const own = recipeNote(first, { source: SOURCE, today: "2026-11-01", format });
    const t = planRefetch("a.md", edit(own), page, { format, today: "2026-11-27" }).text;
    expect(t.match(/^fingerabdruck:/gm)).toHaveLength(1);
    expect(t).not.toContain("import_hash");
    expect(planRefetch("a.md", t, page, { format, today: "2026-11-27" }).edited).toEqual(["ingredients"]);
  });

  it("an English note keeps its name and is not given a second field", () => {
    const en = makeNoteFormat("en").format;
    const t = updatedNote(recipeNote(first, { source: SOURCE, today: "2026-11-01", format: en }), page, o);
    expect(t.match(/^import_hash:/gm)).toHaveLength(1);
  });

  it("is not added to a note without frontmatter", () => {
    expect(updatedNote("# Biskuit\n\n## Zutaten\n- 4 Eier\n", page, o)).not.toContain("import_hash");
  });
});
