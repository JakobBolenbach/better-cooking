import { describe, expect, it } from "vitest";
import { backupName, planRefetch, updatedNote } from "../src/refetch";
import { recipeNote } from "../src/recipeNote";
import { insertAttempt, parseRecipe, readFrontmatter } from "../src/parse";
import { DEFAULT_FORMAT, makeNoteFormat } from "../src/noteFormat";
import type { SchemaRecipe } from "../src/schemaorg";

const SOURCE = "https://example.org/biskuit";
const old: SchemaRecipe = {
  title: "Biskuit",
  description: "Alt.",
  result: "1 Form",
  timeActive: 20,
  ingredients: ["4 Eier", "100 g Zucker"],
  steps: [{ text: "Eier trennen. Eiweiß und Zucker schlagen." }],
  images: [],
};
const fresh: SchemaRecipe = {
  title: "Einfacher Biskuit",
  description: "Neu.",
  result: "2 Portionen",
  timeActive: 25,
  timeTotal: 60,
  author: "Beispiel",
  ingredients: ["4 Eier", "100 g Zucker", "200 g Mehl"],
  steps: [
    { title: "Trennen", text: "Eier trennen." },
    { title: "Schlagen", text: "Eiweiß und Zucker schlagen." },
    { title: "Backen (30 Min.)", text: "30 Min. backen." },
  ],
  images: [],
};

/** A note the user has worked with: rating, attempts, own notes, an own section and an extra property. */
function usedNote(format = DEFAULT_FORMAT): string {
  let t = recipeNote(old, { source: SOURCE, image: "Biskuit Titelbild.jpg", today: "2026-11-01", format });
  t = t
    .replace("status: ausprobieren", "status: bewaehrt")
    .replace("bewertung:", "bewertung: 5")
    .replace("zuletzt_gemacht:", "zuletzt_gemacht: 2026-11-10")
    .replace("erstellt:", 'familie: "ja"\nerstellt:')
    .replace("## Notizen\n-", "## Notizen\n- Mit weniger Zucker.\n\n## Meine Torte\nZuerst Boden, dann Creme.");
  return insertAttempt(t, { date: "10.11.2026", result: "Luftig", rating: 5 });
}

describe("updatedNote", () => {
  const text = updatedNote(usedNote(), fresh, { format: DEFAULT_FORMAT, today: "2026-11-26" });
  const r = parseRecipe("Recipes/Biskuit.md", text);

  it("takes over the imported parts", () => {
    expect(r.title).toBe("Einfacher Biskuit");
    expect(r.description).toBe("Neu.");
    expect(r.result).toBe("2 Portionen");
    expect(r.timeActive).toBe(25);
    expect(r.timeTotal).toBe(60);
    expect(r.author).toBe("Beispiel");
    expect(r.ingredients[0].ingredients).toHaveLength(3);
    expect(r.steps.map((s) => s.title)).toEqual(["Trennen", "Schlagen", "Backen (30 Min.)"]);
    expect(r.source).toBe(SOURCE);
    expect(r.image).toBe("Biskuit Titelbild.jpg");
  });

  it("keeps status, rating, last made, attempts, notes, own sections and extra properties", () => {
    expect(r.status).toBe("bewaehrt");
    expect(r.rating).toBe(5);
    expect(r.lastMade).toBe("2026-11-10");
    expect(r.attempts).toEqual([{ date: "10.11.2026", lines: ["Ergebnis: Luftig", "Bewertung: 5/5"] }]);
    expect(r.notes).toEqual(["Mit weniger Zucker."]);
    expect(text).toContain('familie: "ja"');
    expect(text).toContain("## Meine Torte\nZuerst Boden, dann Creme.");
    expect(r.created).toBe("2026-11-01");
    expect(readFrontmatter(text).fm.aktualisiert).toBe("2026-11-26");
  });

  it("keeps the order of sections and writes each field once", () => {
    const heads = text.split("\n").filter((l) => l.startsWith("## "));
    expect(heads).toEqual(["## Zutaten", "## Schritte", "## Versuche", "## Notizen", "## Meine Torte"]);
    expect(text.match(/^zeit_gesamt:/gm)).toHaveLength(1);
  });

  it("does not blank values the page no longer gives", () => {
    const t = updatedNote(
      usedNote(),
      { ...fresh, result: undefined, timeActive: undefined, description: undefined },
      {
        format: DEFAULT_FORMAT,
        today: "2026-11-26",
      },
    );
    const x = parseRecipe("Recipes/Biskuit.md", t);
    expect(x.result).toBe("1 Form");
    expect(x.timeActive).toBe(20);
    expect(x.title).toBe("Einfacher Biskuit");
  });

  it("keeps sections the page gives nothing for", () => {
    const t = updatedNote(usedNote(), { ...fresh, steps: [] }, { format: DEFAULT_FORMAT, today: "2026-11-26" });
    expect(parseRecipe("Recipes/Biskuit.md", t).steps).toEqual([{ text: "Eier trennen. Eiweiß und Zucker schlagen." }]);
  });

  it("writes into the note's own field names and section language", () => {
    const en = makeNoteFormat("en").format;
    const enOld = recipeNote(old, { source: SOURCE, today: "2026-11-01", format: en });
    const t = updatedNote(enOld, fresh, { format: en, today: "2026-11-26" });
    expect(t).toContain("yield: ");
    expect(t).toContain("## Ingredients");
    expect(t).not.toContain("## Zutaten");
    expect(t).toContain("time_total: 60");
    expect(t.match(/^yield:/gm)).toHaveLength(1);
  });

  it("adds a field the note did not have, before the dates", () => {
    const without = usedNote().replace(/^autor:.*\n/m, "");
    const t = updatedNote(without, fresh, { format: DEFAULT_FORMAT, today: "2026-11-26" });
    expect(t).toMatch(/autor: "Beispiel"\nerstellt|autor: "Beispiel"\nfamilie/);
    expect(parseRecipe("x.md", t).author).toBe("Beispiel");
  });

  it("uses a new cover image and leaves the header embed otherwise", () => {
    const t = updatedNote(usedNote(), fresh, {
      format: DEFAULT_FORMAT,
      today: "2026-11-26",
      image: "Biskuit Titelbild 2.jpg",
    });
    expect(t).toContain('bild: "[[Biskuit Titelbild 2.jpg]]"');
    expect(t).toContain("![[Biskuit Titelbild 2.jpg]]");
    expect(t).not.toContain("![[Biskuit Titelbild.jpg]]");
  });
});

describe("planRefetch", () => {
  const o = { format: DEFAULT_FORMAT, today: "2026-11-26" };

  it("lists what changes with counts", () => {
    const { changes } = planRefetch("Recipes/Biskuit.md", usedNote(), fresh, o);
    expect(changes).toEqual([
      { part: "title" },
      { part: "description" },
      { part: "yield" },
      { part: "times" },
      { part: "ingredients", from: 2, to: 3 },
      { part: "steps", from: 1, to: 3 },
    ]);
  });

  it("finds no change when the page is the same, and returns the old text untouched", () => {
    const note = usedNote();
    const same = planRefetch("Recipes/Biskuit.md", note, old, o);
    expect(same.changes).toEqual([]);
    expect(same.text).toBe(note);
  });
});

describe("backupName", () => {
  it("names the old version with its date", () => {
    expect(backupName("Biskuit", "2026-11-26")).toBe("Biskuit (Vorversion 2026-11-26)");
  });
});
