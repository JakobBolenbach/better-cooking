// How a recipe was read (ADR 0008, issue #155): the field, who writes it, what edits keep, how the page shows it.
import { describe, expect, it } from "vitest";
import { readWayFrom, wayOfNote, READ_WAYS } from "../src/readWay";
import { recipeNote } from "../src/recipeNote";
import { parseRecipe } from "../src/parse";
import { DEFAULT_FORMAT, FIELD_PRESETS, makeNoteFormat } from "../src/noteFormat";
import { fingerprints, formatHash, storedHashes } from "../src/fingerprint";
import { planRefetch, updatedNote } from "../src/refetch";
import { applyDraft, draftOfText } from "../src/recipeEdit";
import type { SchemaRecipe } from "../src/schemaorg";

const r: SchemaRecipe = {
  title: "Biskuit",
  ingredients: ["4 Eier", "100 g Zucker"],
  steps: [{ text: "Eier trennen." }],
  images: [],
};
const page: SchemaRecipe = { ...r, description: "Neu.", ingredients: ["4 Eier", "100 g Zucker", "200 g Mehl"] };
const F = DEFAULT_FORMAT.fields;
const EN = makeNoteFormat("en").format;
const o = { today: "2026-12-01" };
const read = (t: string, f = F) => parseRecipe("R/Biskuit.md", t, 0, f);

describe("the field", () => {
  it("has a name per note format and a fixed set of values", () => {
    expect(FIELD_PRESETS.de.importVia).toBe("import_weg");
    expect(FIELD_PRESETS.en.importVia).toBe("import_via");
    expect([...READ_WAYS]).toEqual(["page", "rules", "ai", "processor"]);
  });

  it("reads known values only, in any case", () => {
    expect(readWayFrom(" Page ")).toBe("page");
    expect(readWayFrom("ai")).toBe("ai");
    expect(readWayFrom("magic")).toBeUndefined();
    expect(readWayFrom(undefined)).toBeUndefined();
  });

  it("is written by the plugin's note builder in both languages and read back", () => {
    for (const way of READ_WAYS) {
      expect(recipeNote(r, { ...o, via: way })).toContain(`import_weg: ${way}\n`);
      const en = recipeNote(r, { ...o, via: way, format: EN });
      expect(en).toContain(`import_via: ${way}\n`);
      expect(read(en, EN.fields).importVia).toBe(way);
    }
    expect(recipeNote(r, o)).not.toContain("import_weg");
  });

  it("does not count in the fingerprint", () => {
    const a = recipeNote(r, { ...o, via: "page" });
    const b = recipeNote(r, { ...o, via: "ai" });
    const c = recipeNote(r, o);
    expect(fingerprints(a, F)).toEqual(fingerprints(b, F));
    expect(storedHashes(read(a))).toEqual(storedHashes(read(c)));
  });

  it("shows a note with a job ID and no field as processor's, older notes as unknown", () => {
    expect(wayOfNote({ job: "rz-abc" })).toBe("processor");
    expect(wayOfNote({ importVia: "rules", job: "rz-abc" })).toBe("rules");
    expect(wayOfNote({})).toBeUndefined();
    expect(wayOfNote({ job: "  " })).toBeUndefined();
  });
});

describe("Fetch again, improvements", () => {
  const imported = recipeNote(r, { source: "https://example.org/b", ...o, via: "rules" });

  it("updates the way of the new reading and keeps the fingerprint rules", () => {
    const next = updatedNote(imported, page, { format: DEFAULT_FORMAT, ...o, via: "ai" });
    expect(next).toContain("import_weg: ai\n");
    expect(next).not.toContain("import_weg: rules");
    expect(read(next).importVia).toBe("ai");
  });

  it("adds the field to a note that had none, and leaves it alone without a way", () => {
    const plain = imported.replace(/import_weg: rules\n/, "");
    expect(updatedNote(plain, page, { format: DEFAULT_FORMAT, ...o, via: "processor" })).toContain(
      "import_weg: processor\n",
    );
    expect(updatedNote(imported, page, { format: DEFAULT_FORMAT, ...o })).toContain("import_weg: rules\n");
  });

  it("is no change by itself: a run with nothing new writes nothing", () => {
    const p = planRefetch(imported, r, { format: DEFAULT_FORMAT, ...o, replace: [], via: "page" });
    expect(p.changes).toEqual([]);
    expect(p.text).toBe(imported);
  });

  it("is no hand edit: the parts are not edited after the way changed", () => {
    const next = updatedNote(imported, page, { format: DEFAULT_FORMAT, ...o, via: "page" });
    expect(planRefetch(next, page, { format: DEFAULT_FORMAT, ...o, replace: [] }).edited).toEqual([]);
  });
});

describe("the editor", () => {
  const note = recipeNote(r, { source: "https://example.org/b", ...o, via: "ai" });

  it("keeps the field and does not take it for an edit", () => {
    const base = draftOfText(note, F);
    const draft = structuredClone(base);
    draft.title = "Biskuit klassisch";
    const res = applyDraft(note, base, draft, { format: DEFAULT_FORMAT, today: "2026-12-02" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.text).toContain("import_weg: ai\n");
      expect(read(res.text).importVia).toBe("ai");
      expect(res.text).toContain(`import_hash: ${formatHash(storedHashes(read(note)))}`);
    }
  });

  it("finds no change when only the field differs", () => {
    const other = note.replace("import_weg: ai", "import_weg: page");
    expect(draftOfText(note, F)).toEqual(draftOfText(other, F));
  });
});
