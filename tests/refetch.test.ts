import { describe, expect, it } from "vitest";
import {
  backupName,
  backupText,
  canRefetch,
  coverChanged,
  moveCover,
  planRefetch,
  pruneCovers,
  updatedNote,
} from "../src/refetch";
import { firstFree } from "../src/folder";
import { cleanCoverUrls } from "../src/migrate";
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

describe("header", () => {
  const o = { format: DEFAULT_FORMAT, today: "2026-11-26" };
  const head = (t: string) => t.slice(t.indexOf("\n---\n", 4) + 5, t.indexOf("## Zutaten"));

  it("keeps the old title when the source has none (placeholder), and the old description when it gives none", () => {
    const t = updatedNote(usedNote(), { ...fresh, title: "Rezept", description: undefined }, o);
    expect(head(t)).toContain("# Biskuit\n");
    expect(head(t)).toContain("Alt.");
    expect(parseRecipe("x.md", t).title).toBe("Biskuit");
  });

  it("takes yield and times from the merged frontmatter and keeps lines the user added", () => {
    const own = usedNote().replace("Quelle:", "Eigene Zeile über der Quelle.\n\nQuelle:");
    const t = updatedNote(own, { ...fresh, result: undefined, timeTotal: 90 }, o);
    expect(head(t)).toContain("**Ergebnis:** 1 Form · **Aktiv:** ca. 25 Min. · **Gesamt:** ca. 1 Std. 30 Min.");
    expect(head(t)).toContain("Eigene Zeile über der Quelle.");
    expect(head(t)).toContain("Quelle: [example.org]");
    expect(head(t).match(/^\*\*Ergebnis/gm)).toHaveLength(1);
  });
});

describe("fields the user may own", () => {
  const o = { format: DEFAULT_FORMAT, today: "2026-11-26" };

  it("category and author are only filled when empty and never into an own field name", () => {
    const format = makeNoteFormat("de", "category: tags").format;
    const base = recipeNote(old, { source: SOURCE, today: "2026-11-01", format });
    const own = base.replace("tags: \n", "tags:\n  - Kuchen\n  - Sonntag\n").replace(/^autor:.*$/m, 'autor: "Oma"');
    const t = updatedNote(own, { ...fresh, category: "Torte", author: "Beispiel" }, { ...o, format });
    expect(t).toContain("tags:\n  - Kuchen\n  - Sonntag\n");
    expect(t).not.toContain("Torte");
    expect(t).toContain('autor: "Oma"');
    expect(t.match(/^tags:/gm)).toHaveLength(1);
    // an own field name stays untouched even when it is empty; a standard name is filled
    const empty = updatedNote(base, { ...fresh, category: "Torte" }, { ...o, format });
    expect(empty).not.toContain("Torte");
    expect(empty).toContain("tags: \n");
    const standard = updatedNote(usedNote(), { ...fresh, category: "Torte" }, o);
    expect(standard).toContain('kategorie: "Torte"');
  });

  it("import state is written only where the note has it", () => {
    const manual = usedNote()
      .replace(/^import:.*\n/m, "")
      .replace(/^import_fehler:.*\n/m, "");
    const t = updatedNote(manual, { ...fresh, truncated: ["steps"] }, o);
    expect(t).not.toMatch(/^import/m);
    const withState = updatedNote(usedNote(), { ...fresh, truncated: ["steps"] }, o);
    expect(withState).toMatch(/^import: teilweise$/m);
    expect(withState).toContain("Zu lang, gekürzt: Schritte.");
  });
});

describe("canRefetch", () => {
  const imported = { source: "https://example.org/a", importState: "fertig", job: undefined, translationOf: undefined };
  it("only imported notes with a recipe page as source", () => {
    expect(canRefetch(imported)).toEqual({ ok: true });
    expect(canRefetch({ ...imported, importState: undefined, job: "rz-1" })).toEqual({ ok: true });
    expect(canRefetch({ ...imported, source: undefined })).toEqual({ ok: false, reason: "refetchNoSource" });
    expect(canRefetch({ ...imported, translationOf: "Original" })).toEqual({ ok: false, reason: "refetchTranslation" });
    expect(canRefetch({ ...imported, source: "https://www.instagram.com/p/abc/" })).toEqual({
      ok: false,
      reason: "refetchPagesOnly",
    });
    expect(canRefetch({ ...imported, importState: undefined })).toEqual({ ok: false, reason: "refetchNotImported" });
  });
});

describe("backup", () => {
  it("drops the job ID and marks the note as an old version; the rest stays", () => {
    const withJob = usedNote().replace("erstellt:", "auftrag: rz-abc\nerstellt:");
    const b = backupText(withJob, "Biskuit", DEFAULT_FORMAT);
    expect(b).not.toContain("auftrag:");
    expect(b).toContain('vorversion: "[[Biskuit]]"');
    expect(b).toContain("## Versuche");
    expect(b).toContain("## Meine Torte\nZuerst Boden, dann Creme.");
    expect(parseRecipe("x.md", b).job).toBeUndefined();
    const en = backupText(withJob, "Biskuit", makeNoteFormat("en").format);
    expect(en).toContain('previous_version: "[[Biskuit]]"');
  });
});

describe("cover image", () => {
  it("loads another image only when the address changed; with no earlier address only if the note has none", () => {
    expect(coverChanged({ image: "a.jpg" }, "https://x/a.jpg", "https://x/a.jpg")).toBe(false);
    expect(coverChanged({ image: "a.jpg" }, "https://x/a.jpg", "https://x/b.jpg")).toBe(true);
    expect(coverChanged({ image: "a.jpg" }, undefined, "https://x/b.jpg")).toBe(false);
    expect(coverChanged({ image: undefined }, undefined, "https://x/b.jpg")).toBe(true);
    expect(coverChanged({ image: "a.jpg" }, "https://x/a.jpg", undefined)).toBe(false);
  });
  it("remembered addresses in the settings are cleaned", () => {
    expect(cleanCoverUrls({ "R/a.md": "https://x/a.jpg", "R/b.md": "javascript:1", "R/c.md": 5 })).toEqual({
      "R/a.md": "https://x/a.jpg",
    });
    expect(cleanCoverUrls("nope")).toEqual({});
  });
});

describe("note details", () => {
  const o = { format: DEFAULT_FORMAT, today: "2026-11-26" };
  it("replaces only the first of two sections with the same name", () => {
    const twice = usedNote().replace("## Versuche", "## Zutaten\n- Eigene Liste\n\n## Versuche");
    const t = updatedNote(twice, fresh, o);
    expect(t.match(/^## Zutaten/gm)).toHaveLength(2);
    expect(t).toContain("## Zutaten\n- Eigene Liste");
    expect(t).toContain("- 200 g Mehl");
  });
  it("keeps Windows line endings", () => {
    const crlf = usedNote().replace(/\n/g, "\r\n");
    const t = updatedNote(crlf, fresh, o);
    expect(t).toContain("\r\n");
    expect(t.replace(/\r\n/g, "")).not.toContain("\n");
    expect(parseRecipe("x.md", t).steps).toHaveLength(3);
  });
  it("finds free names the same way everywhere", () => {
    const taken = new Set(["A", "A 2"]);
    expect(
      firstFree(
        (i) => (i === 1 ? "A" : `A ${i}`),
        (n) => taken.has(n),
      ),
    ).toBe("A 3");
    expect(
      firstFree(
        (i) => `B${i}`,
        () => false,
      ),
    ).toBe("B1");
  });
});

describe("description lines", () => {
  const o = { format: DEFAULT_FORMAT, today: "2026-11-26" };
  const noDescription = () => recipeNote({ ...old, description: undefined }, { source: SOURCE, today: "2026-11-01" });

  it("an own hint line in the header stays when the note had no description", () => {
    const own = noDescription().replace("## Zutaten", "> Meine Anmerkung zum Rezept\n\n## Zutaten");
    const t = updatedNote(own, fresh, o);
    expect(t).toContain("> Meine Anmerkung zum Rezept");
    expect(parseRecipe("x.md", t).description).toBe("Neu.");
  });

  it("a paragraph after the description stays", () => {
    const own = usedNote().replace("Alt.\n", "Alt.\n\nMeine eigene Anmerkung.\n");
    const t = updatedNote(own, fresh, o);
    expect(t).toContain("Meine eigene Anmerkung.");
    expect(t).not.toContain("Alt.");
    expect(parseRecipe("x.md", t).description).toBe("Neu.");
  });

  it("without a new description the old one stays untouched", () => {
    const t = updatedNote(usedNote(), { ...fresh, description: undefined }, o);
    expect(parseRecipe("x.md", t).description).toBe("Alt.");
  });
});

describe("remembered cover addresses follow their notes", () => {
  const map = { "R/a.md": "https://x/a.jpg", "R/b.md": "https://x/b.jpg" };
  it("rename moves, delete removes, unknown notes change nothing", () => {
    expect(moveCover(map, "R/a.md", "R/c.md")).toEqual({ "R/b.md": "https://x/b.jpg", "R/c.md": "https://x/a.jpg" });
    expect(moveCover(map, "R/a.md")).toEqual({ "R/b.md": "https://x/b.jpg" });
    expect(moveCover(map, "R/zzz.md", "R/y.md")).toBe(map);
  });
  it("prunes notes that no longer exist", () => {
    expect(pruneCovers(map, (p) => p === "R/b.md")).toEqual({ "R/b.md": "https://x/b.jpg" });
  });
});
