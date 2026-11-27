// The options of a proposal merge (ADR 0007) in planRefetch: import state, error and timeline.
import { describe, expect, it } from "vitest";
import { planRefetch } from "../src/refetch";
import { recipeNote } from "../src/recipeNote";
import { parseRecipe } from "../src/parse";
import { DEFAULT_FORMAT, makeNoteFormat } from "../src/noteFormat";
import type { SchemaRecipe } from "../src/schemaorg";

const r: SchemaRecipe = {
  title: "Brot",
  ingredients: ["500 g Mehl"],
  steps: [{ text: "Backen." }],
  images: [],
};
const base = recipeNote(r, { today: "2026-11-01", format: DEFAULT_FORMAT }).replace(/import: \w+/, "import: offen");
const o = { format: DEFAULT_FORMAT, today: "2026-11-27", replace: [] };

describe("planRefetch with improve options", () => {
  it("writes the import state even when no recipe part changes", () => {
    const plan = planRefetch(base, r, { ...o, improve: { state: "fertig" } });
    expect(plan.changes).toEqual([]);
    expect(parseRecipe("x", plan.text).importState).toBe("fertig");
  });
  it("does not write when nothing at all would change", () => {
    const same = base.replace("import: offen", "import: fertig");
    expect(planRefetch(same, r, { ...o, improve: { state: "fertig" } }).text).toBe(same);
  });
  it("sets and clears the reason", () => {
    const partial = planRefetch(base, r, { ...o, improve: { state: "teilweise", error: "Mengen fehlen" } }).text;
    expect(parseRecipe("x", partial).importError).toBe("Mengen fehlen");
    const clean = planRefetch(partial, r, { ...o, improve: { state: "fertig" } }).text;
    expect(parseRecipe("x", clean).importError).toBeUndefined();
    expect(parseRecipe("x", clean).importState).toBe("fertig");
  });
  it("adds the fields to a note that has none, in the language of the format", () => {
    const bare =
      "---\ntyp: rezept\nauftrag: rz-1\n---\n# Brot\n\n## Zutaten\n- 500 g Mehl\n\n## Schritte\n1. Backen.\n";
    const en = makeNoteFormat("en").format;
    const text = planRefetch(bare, r, {
      format: en,
      today: "2026-11-27",
      replace: [],
      improve: { state: "teilweise", error: "x" },
    }).text;
    expect(text).toContain("import: partial");
    expect(text).toContain('import_error: "x"');
    expect(text.match(/^auftrag:/gm)).toHaveLength(1);
  });
  it("adds the timeline before the ingredients only if the note has none", () => {
    const text = planRefetch(base, r, { ...o, improve: { state: "fertig", timeline: "Brot Ablauf.svg" } }).text;
    expect(parseRecipe("x", text).timeline).toBe("Brot Ablauf.svg");
    expect(text.indexOf("## Ablauf")).toBeLessThan(text.indexOf("## Zutaten"));
    const again = planRefetch(text, r, { ...o, improve: { state: "fertig", timeline: "Anderes.svg" } }).text;
    expect(parseRecipe("x", again).timeline).toBe("Brot Ablauf.svg");
  });
  it("leaves import fields alone without the option, as Fetch again always did", () => {
    const plan = planRefetch(base, r, o);
    expect(plan.text).toBe(base);
  });
});
