// "Fetch again" and hand edits (ADR 0006, issue #130): parts the user changed since the import are kept.
import { describe, expect, it } from "vitest";
import { planRefetch, updatedNote } from "../src/refetch";
import { fingerprints, parseHash } from "../src/fingerprint";
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
const o = { format: DEFAULT_FORMAT, today: "2026-11-27" };
const imported = (format = DEFAULT_FORMAT) => recipeNote(first, { source: SOURCE, today: "2026-11-01", format });
const edit = (t: string) => t.replace("- 100 g Zucker", "- 80 g Zucker");
const read = (t: string) => parseRecipe("Recipes/Biskuit.md", t, 0, DEFAULT_FORMAT.fields);

describe("planRefetch with a stored fingerprint", () => {
  it("names the parts edited by hand and nothing else", () => {
    expect(planRefetch("a.md", imported(), page, o).edited).toEqual([]);
    const plan = planRefetch("a.md", edit(imported()), page, o);
    expect(plan.edited).toEqual(["ingredients"]);
    expect(plan.changes.map((c) => c.part)).toEqual(
      expect.arrayContaining(["title", "description", "yield", "times", "ingredients", "steps"]),
    );
  });

  it("replaces an edited part when the user says so", () => {
    const t = planRefetch("a.md", edit(imported()), page, o).text;
    expect(read(t).ingredients[0].ingredients).toEqual(["4 Eier", "100 g Zucker", "200 g Mehl"]);
    expect(planRefetch("a.md", t, page, o).edited).toEqual([]);
  });

  it("keeps an edited part otherwise and replaces the rest", () => {
    const t = planRefetch("a.md", edit(imported()), page, { ...o, keep: ["ingredients"] }).text;
    const r = read(t);
    expect(r.ingredients[0].ingredients).toEqual(["4 Eier", "80 g Zucker"]);
    expect(r.steps.map((s) => s.title)).toEqual(["Trennen", "Schlagen"]);
    expect(r.title).toBe("Einfacher Biskuit");
    expect(r.tips).toEqual(["Ofen vorheizen."]);
  });

  it("keeps title, description, yield and times in header and fields", () => {
    const text = imported().replace("# Biskuit", "# Mein Biskuit").replace("Alt.", "Meine Beschreibung.");
    const edited = text.replace(/^ergebnis:.*$/m, 'ergebnis: "3 Formen"').replace(/^zeit_aktiv:.*$/m, "zeit_aktiv: 30");
    const plan = planRefetch("a.md", edited, page, { ...o, keep: ["title", "description", "yield", "times"] });
    expect(plan.edited).toEqual(["title", "description", "yield", "times"]);
    const r = read(plan.text);
    expect([r.title, r.description, r.result, r.timeActive]).toEqual([
      "Mein Biskuit",
      "Meine Beschreibung.",
      "3 Formen",
      30,
    ]);
    expect(r.ingredients[0].ingredients).toHaveLength(3);
  });

  it("keeps the fingerprint of kept parts at what the page had, so the edit is still found next time", () => {
    const t = planRefetch("a.md", edit(imported()), page, { ...o, keep: ["ingredients"] }).text;
    const stored = parseHash(read(t).importHash);
    const now = fingerprints(read(recipeNote(page, { source: SOURCE, today: "2026-11-27" })));
    expect(stored.ingredients).toBe(now.ingredients);
    expect(stored.steps).toBe(now.steps);
    expect(planRefetch("a.md", t, page, o).edited).toEqual(["ingredients"]);
  });

  it("updates the fingerprint of replaced parts to the new value and leaves parts the page does not give", () => {
    const t = planRefetch("a.md", imported(), page, o).text;
    const r = read(t);
    expect(parseHash(r.importHash)).toEqual({ ...fingerprints(r), tips: parseHash(read(imported()).importHash).tips });
    expect(planRefetch("a.md", t, page, o).edited).toEqual([]);
  });

  it("writes nothing when only kept parts differ", () => {
    const text = edit(imported());
    const same: SchemaRecipe = { ...first, ingredients: ["4 Eier", "100 g Zucker", "200 g Mehl"] };
    const plan = planRefetch("a.md", text, same, { ...o, keep: ["ingredients"] });
    expect(plan.changes.map((c) => c.part)).toEqual(["ingredients"]);
    expect(plan.text).toBe(text);
  });
});

describe("planRefetch without a stored fingerprint", () => {
  const bare = () => edit(imported()).replace(/^import_hash:.*\n/m, "");
  it("behaves as before: nothing is known as edited, everything is replaced", () => {
    const plan = planRefetch("a.md", bare(), page, o);
    expect(plan.edited).toEqual([]);
    expect(read(plan.text).ingredients[0].ingredients).toHaveLength(3);
  });

  it("a broken value counts as none", () => {
    const broken = edit(imported()).replace(/^import_hash:.*$/m, "import_hash: kaputt=");
    expect(planRefetch("a.md", broken, page, o).edited).toEqual([]);
  });

  it("the first fetch writes the fingerprint", () => {
    const t = updatedNote(bare(), page, o);
    expect(read(t).importHash).toContain("ingredients=");
    expect(t.match(/^import_hash:/gm)).toHaveLength(1);
  });
});

describe("the fingerprint field", () => {
  it("is written under an own name when the note or the format has one", () => {
    const format = makeNoteFormat("de", "importHash: fingerabdruck").format;
    const own = recipeNote(first, { source: SOURCE, today: "2026-11-01", format });
    const t = updatedNote(edit(own), page, { format, today: "2026-11-27", keep: ["ingredients"] });
    expect(t.match(/^fingerabdruck:/gm)).toHaveLength(1);
    expect(t).not.toContain("import_hash");
    expect(planRefetch("a.md", t, page, { format, today: "2026-11-27" }).edited).toEqual(["ingredients"]);
  });

  it("an English note keeps its name and is not given a second field", () => {
    const en = makeNoteFormat("en").format;
    const t = updatedNote(recipeNote(first, { source: SOURCE, today: "2026-11-01", format: en }), page, {
      format: DEFAULT_FORMAT,
      today: "2026-11-27",
    });
    expect(t.match(/^import_hash:/gm)).toHaveLength(1);
  });

  it("is not added to a note without frontmatter", () => {
    expect(updatedNote("# Biskuit\n\n## Zutaten\n- 4 Eier\n", page, o)).not.toContain("import_hash");
  });
});
