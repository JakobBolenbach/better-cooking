import { describe, expect, it } from "vitest";
import {
  applyDraft,
  categoryListOf,
  draftChanges,
  draftOfText,
  linesOf,
  normalizeDraft,
  undoEdit,
  validateDraft,
  type RecipeDraft,
} from "../src/recipeEdit";
import { DEFAULT_FORMAT, makeNoteFormat } from "../src/noteFormat";
import { fingerprints, formatHash, readStored } from "../src/fingerprint";
import { parseRecipe } from "../src/parse";
import { setFactsLine, setTitleLine } from "../src/headEdit";
import { noteLangOf } from "../src/noteText";
import { withEndings } from "../src/lineEndings";

const F = DEFAULT_FORMAT.fields;
const opts = { format: DEFAULT_FORMAT, today: "2026-12-01" };

const IMPORTED = `---
typ: rezept
status: ausprobieren
kategorie: Brot
quelle: "https://example.org/x"
ergebnis: "4 Brötchen"
zeit_aktiv: 20
zeit_gesamt: 55
import: fertig
eigenes_feld: bleibt
erstellt: 2026-11-26
aktualisiert: 2026-11-26
---
# Brötchen

Knusprig und einfach.

**Ergebnis:** 4 Brötchen · **Aktiv:** ca. 20 Min. · **Gesamt:** ca. 55 Min.

Quelle: [example.org](https://example.org/x)

## Zutaten
- [x] 500 g Mehl
  Type 550
### Teig
- 1 Würfel Hefe
- 1 TL Salz

## Schritte
1. **Kneten:** Alles kneten.
2. [ ] Gehen lassen.
3. Backen.

## Tipps
- Mit Wasser besprühen.

## Versuche
> Neueste oben.
### 01.11.2026
- Geändert: mehr Salz

## Notizen
- Schmeckt gut
`;

/** The same note, not imported (no import fingerprint is involved). */
const NOTE = IMPORTED.replace("import: fertig\n", "");

const draft = (text = NOTE): RecipeDraft => draftOfText(text, F);
const edit = (text: string, f: (d: RecipeDraft) => void, format = DEFAULT_FORMAT) => {
  const base = draftOfText(text, format.fields);
  const next = structuredClone(base);
  f(next);
  return { base, next, r: applyDraft(text, base, next, { format, today: "2026-12-01" }) };
};
const written = (text: string, f: (d: RecipeDraft) => void, format = DEFAULT_FORMAT) => {
  const { r } = edit(text, f, format);
  if (!r.ok) throw new Error("not ok: " + JSON.stringify(r));
  return r;
};
/** The lines that differ, as removed and added. */
const diff = (a: string, b: string) => {
  const [x, y] = [a.split("\n"), b.split("\n")];
  return { removed: x.filter((l) => !y.includes(l)).sort(), added: y.filter((l) => !x.includes(l)).sort() };
};
/** Which lines were removed and added, in any order. */
const lines = (removed: string[], added: string[]) => ({ removed: [...removed].sort(), added: [...added].sort() });

describe("draft", () => {
  it("reads the note like the page does and sees no change in itself", () => {
    const d = draft();
    expect(d.title).toBe("Brötchen");
    expect(d.ingredients).toEqual([
      { title: undefined, items: ["500 g Mehl"] },
      { title: "Teig", items: ["1 Würfel Hefe", "1 TL Salz"] },
    ]);
    expect(draftChanges(d, structuredClone(d))).toEqual([]);
    const r = applyDraft(NOTE, d, d, opts);
    expect(r).toEqual({ ok: true, text: NOTE, parts: [] });
  });

  it("textarea lines: one entry per line, typed markers are taken off", () => {
    expect(linesOf("- a\n\n * b  \n[ ] c\n  d")).toEqual(["a", "b", "c", "d"]);
  });

  it("a YAML list as category is read-only", () => {
    const text = NOTE.replace("kategorie: Brot", "tags:\n  - Brot\n  - Frühstück");
    const fmt = makeNoteFormat("de", "category: tags").format;
    expect(categoryListOf(text, fmt.fields)).toEqual(["Brot", "Frühstück"]);
    const { base, next } = edit(text, (d) => (d.category = "Anderes"), fmt);
    expect(base.categoryList).toEqual(["Brot", "Frühstück"]);
    expect(draftChanges(base, next)).toEqual([]);
    expect(applyDraft(text, base, next, { ...opts, format: fmt })).toEqual({ ok: true, text, parts: [] });
  });
});

describe("only changed parts are written", () => {
  it("an ingredient edit changes that line and `updated`, nothing else", () => {
    const r = written(NOTE, (d) => (d.ingredients[1].items[1] = "2 TL Salz"));
    expect(r.parts).toEqual(["ingredients"]);
    expect(diff(NOTE, r.text)).toEqual(
      lines(["- 1 TL Salz", "aktualisiert: 2026-11-26"], ["- 2 TL Salz", "aktualisiert: 2026-12-01"]),
    );
  });

  it("attempts, notes and own frontmatter stay byte for byte, also with CRLF", () => {
    const crlf = NOTE.replace(/\n/g, "\r\n");
    const r = written(crlf, (d) => {
      d.steps[1].text = "Eine Stunde gehen lassen.";
      d.tips.push("Heiß servieren.");
    });
    expect(r.parts).toEqual(["steps", "tips"]);
    expect(r.text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    const lf = r.text.replace(/\r\n/g, "\n");
    expect(lf).toContain("eigenes_feld: bleibt\n");
    expect(lf).toContain(
      "## Versuche\n> Neueste oben.\n### 01.11.2026\n- Geändert: mehr Salz\n\n## Notizen\n- Schmeckt gut\n",
    );
    expect(diff(NOTE, lf)).toEqual(
      lines(
        ["2. [ ] Gehen lassen.", "aktualisiert: 2026-11-26"],
        ["2. [ ] Eine Stunde gehen lassen.", "- Heiß servieren.", "aktualisiert: 2026-12-01"],
      ),
    );
  });

  it("an unchanged checkbox, hanging line and ### group heading survive an edit of a neighbour", () => {
    const r = written(NOTE, (d) => d.ingredients[1].items.push("1 EL Öl"));
    expect(r.text).toContain("- [x] 500 g Mehl\n  Type 550\n### Teig\n- 1 Würfel Hefe\n- 1 TL Salz\n- 1 EL Öl\n");
  });

  it("steps: an inserted step renumbers the numbers only", () => {
    const r = written(NOTE, (d) => d.steps.splice(1, 0, { text: "Falten." }));
    expect(r.text).toContain("1. **Kneten:** Alles kneten.\n2. Falten.\n3. [ ] Gehen lassen.\n4. Backen.\n");
  });

  it("title: only the H1 line, the file is not renamed (no path involved)", () => {
    const r = written(NOTE, (d) => (d.title = "Frühstücksbrötchen"));
    expect(r.parts).toEqual(["title"]);
    expect(diff(NOTE, r.text).added).toEqual(lines([], ["# Frühstücksbrötchen", "aktualisiert: 2026-12-01"]).added);
    expect(setTitleLine(["", "Text"], "T")).toEqual(["# T", "", "Text"]);
    expect(setTitleLine([], "T")).toEqual(["# T"]);
  });

  it("a section the note does not have yet is created before the attempts", () => {
    const text = NOTE.replace("## Tipps\n- Mit Wasser besprühen.\n\n", "");
    const r = written(text, (d) => d.tips.push("Neu"));
    expect(r.text).toContain("\n## Tipps\n- Neu\n\n## Versuche\n");
  });

  it("the new section gets the language of the note", () => {
    const en = `---\ntype: recipe\nimport: done\nupdated: 2026-01-01\n---\n# Bread\n\n## Ingredients\n- Flour\n\n## Steps\n1. Bake.\n\n## Notes\n- x\n`;
    const fmt = makeNoteFormat("de").format;
    const r = written(en, (d) => d.tips.push("Be patient"), fmt);
    expect(r.text).toContain("## Tips\n- Be patient\n\n## Notes");
  });

  it("typed text cannot create a section or a list item", () => {
    const r = written(NOTE, (d) => d.steps.push({ text: "x\n## Neu\n- y" }));
    expect(r.text).toContain("4. x ## Neu - y\n");
    expect(r.text.match(/^## /gm)).toHaveLength(5);
  });

  it("an item typed as `## X` is written escaped and read back as typed", () => {
    const r = written(NOTE, (d) => d.tips.push("## X"));
    expect(r.text).toContain("- \\## X\n");
    expect(draftOfText(r.text, F).tips).toEqual(["Mit Wasser besprühen.", "## X"]);
  });
});

describe("frontmatter and the key facts line", () => {
  it("yield and times: fields under the note's names, the facts line rebuilt in the note's language", () => {
    const r = written(NOTE, (d) => {
      d.result = "6 Brötchen";
      d.timeTotal = 70;
    });
    expect(r.parts).toEqual(["yield", "times"]);
    expect(diff(NOTE, r.text)).toEqual(
      lines(
        [
          'ergebnis: "4 Brötchen"',
          "zeit_gesamt: 55",
          "**Ergebnis:** 4 Brötchen · **Aktiv:** ca. 20 Min. · **Gesamt:** ca. 55 Min.",
          "aktualisiert: 2026-11-26",
        ],
        [
          'ergebnis: "6 Brötchen"',
          "zeit_gesamt: 70",
          "**Ergebnis:** 6 Brötchen · **Aktiv:** ca. 20 Min. · **Gesamt:** ca. 1 Std. 10 Min.",
          "aktualisiert: 2026-12-01",
        ],
      ),
    );
  });

  it("an English note gets an English facts line, also when the setting says German", () => {
    const en = NOTE.replace("typ: rezept", "type: recipe")
      .replace("ergebnis:", "yield:")
      .replace("zeit_aktiv:", "time_active:")
      .replace("zeit_gesamt:", "time_total:")
      .replace(/\*\*Ergebnis:\*\*.*/, "**Yield:** 4 rolls · **Active:** about 20 min")
      .replace("## Zutaten", "## Ingredients");
    const r = written(en, (d) => (d.timeActive = 25));
    expect(r.text).toContain("**Yield:** 4 Brötchen · **Active:** about 25 min · **Total:** about 55 min");
    expect(r.text).toContain("time_active: 25\n");
  });

  it("the facts line is left alone when neither yield nor times changed", () => {
    const r = written(NOTE, (d) => (d.category = "Frühstück"));
    expect(r.text).toContain("**Ergebnis:** 4 Brötchen · **Aktiv:** ca. 20 Min.");
    expect(diff(NOTE, r.text).added).toEqual(lines([], ['kategorie: "Frühstück"', "aktualisiert: 2026-12-01"]).added);
  });

  it("own field names are used; a missing field is added before `created`", () => {
    const fmt = makeNoteFormat("de", "yield: ertrag\ntimeActive: dauer").format;
    const text = NOTE.replace("ergebnis:", "ertrag:").replace("zeit_aktiv:", "dauer:");
    const r = written(
      text,
      (d) => {
        d.result = "2 Brote";
        d.timeActive = 30;
      },
      fmt,
    );
    expect(r.text).toContain('ertrag: "2 Brote"\ndauer: 30\n');
    expect(r.text).not.toContain("ergebnis:");
    const none = written(NOTE.replace(/kategorie: Brot\n/, ""), (d) => (d.category = "Brot"));
    expect(none.text).toContain('kategorie: "Brot"\nerstellt:');
  });

  it("clearing a value leaves an empty field and removes the facts", () => {
    const r = written(NOTE, (d) => {
      d.result = "";
      d.timeActive = undefined;
      d.timeTotal = undefined;
    });
    expect(r.text).toContain("ergebnis: \nzeit_aktiv: \nzeit_gesamt: \n");
    expect(r.text).not.toContain("**Ergebnis:**");
    expect(parseRecipe("", r.text, 0, F).timeTotal).toBeUndefined();
  });

  it("setFactsLine: a missing line goes above the source line", () => {
    expect(setFactsLine(["# T", "", "Text", "", "Quelle: x", ""], "**Ergebnis:** 2")).toEqual([
      "# T",
      "",
      "Text",
      "",
      "**Ergebnis:** 2",
      "",
      "Quelle: x",
      "",
    ]);
    expect(setFactsLine(["# T", ""], "**Ergebnis:** 2")).toEqual(["# T", "", "**Ergebnis:** 2", ""]);
  });
});

describe("conflicts", () => {
  it("a part that changed since the editor was opened stops the save", () => {
    const base = draft();
    const next = structuredClone(base);
    next.steps[0].text = "Anders kneten.";
    const changed = NOTE.replace("3. Backen.", "3. Backen, 20 Min.");
    const r = applyDraft(changed, base, next, opts);
    expect(r).toMatchObject({ ok: false, conflict: true, parts: ["steps"] });
    expect(r.ok === false && r.conflict && r.base.steps[2].text).toBe("Backen, 20 Min.");
  });

  it("a part the user did not change may have changed elsewhere", () => {
    const base = draft();
    const next = structuredClone(base);
    next.tips.push("Neu");
    const changed = NOTE.replace("3. Backen.", "3. Backen, 20 Min.");
    const r = applyDraft(changed, base, next, opts);
    expect(r.ok && r.text).toContain("3. Backen, 20 Min.");
    expect(r.ok && r.text).toContain("- Neu");
  });

  it("invalid drafts are not written", () => {
    const base = draft();
    const next = structuredClone(base);
    next.title = " ";
    expect(applyDraft(NOTE, base, next, opts)).toEqual({ ok: false, conflict: false, issues: [{ code: "title" }] });
  });
});

describe("validation", () => {
  it("title, times, group names and the limits", () => {
    const d = draft();
    expect(validateDraft(d)).toEqual([]);
    expect(validateDraft({ ...d, title: "" })).toContainEqual({ code: "title" });
    expect(validateDraft({ ...d, timeActive: 10_001 })).toContainEqual({ code: "time" });
    expect(validateDraft({ ...d, timeTotal: -1 })).toContainEqual({ code: "time" });
    expect(validateDraft({ ...d, timeTotal: 10_000 })).toEqual([]);
    expect(validateDraft({ ...d, ingredients: [{ title: "A", items: ["a"] }, { items: ["b"] }] })).toContainEqual({
      code: "groupName",
    });
    expect(validateDraft({ ...d, ingredients: [{ title: "A", items: ["a"] }, { items: [] }] })).toEqual([]);
    expect(validateDraft({ ...d, steps: Array.from({ length: 81 }, () => ({ text: "x" })) })).toContainEqual({
      code: "steps",
      max: 80,
    });
    expect(validateDraft({ ...d, steps: [{ text: "x".repeat(4001) }] })).toContainEqual({
      code: "stepText",
      max: 4000,
    });
    expect(
      validateDraft({ ...d, ingredients: [{ items: Array.from({ length: 151 }, (_, i) => `z${i}`) }] }),
    ).toContainEqual({
      code: "ingredients",
      max: 150,
    });
  });
});

describe("import fingerprint (ADR 0006)", () => {
  const stored = (text: string) => readStored(/^import_hash: (.*)$/m.exec(text)?.[1]);

  it("the first edit of an imported note without a hash writes the baseline of the state before the edit", () => {
    const r = written(IMPORTED, (d) => (d.ingredients[1].items[1] = "2 TL Salz"));
    expect(stored(r.text).hashes).toEqual(fingerprints(IMPORTED, F));
    expect(r.text).toContain('import_hash: "v1;');
    // the edited part now differs from the baseline: an edit by hand
    expect(fingerprints(r.text, F).ingredients).not.toBe(stored(r.text).hashes.ingredients);
    expect(fingerprints(r.text, F).steps).toBe(stored(r.text).hashes.steps);
  });

  it("a job (processor import) counts as imported too; a broken value is a missing one", () => {
    const job = IMPORTED.replace("import: fertig", 'auftrag: "abc"\nimport_hash: "v1;title"');
    const r = written(job, (d) => d.tips.push("x"));
    expect(stored(r.text).hashes).toEqual(fingerprints(job, F));
    expect(r.text.match(/import_hash:/g)).toHaveLength(1);
  });

  it("an existing hash stays as it is; unknown parts are kept; a foreign version is never overwritten", () => {
    const own = formatHash({ title: "abc", steps: "x1" }, ["images:1z"]);
    const t1 = IMPORTED.replace("import: fertig", `import: fertig\nimport_hash: ${own}`);
    expect(written(t1, (d) => d.tips.push("x")).text).toContain(`import_hash: ${own}\n`);
    const foreign = 'import_hash: "v2;title:abc"';
    const t2 = IMPORTED.replace("import: fertig", `import: fertig\n${foreign}`);
    expect(written(t2, (d) => d.tips.push("x")).text).toContain(`${foreign}\n`);
  });

  it("a note that was not imported gets no hash", () => {
    const own = NOTE;
    expect(written(own, (d) => d.tips.push("x")).text).not.toContain("import_hash");
  });

  it("no hash is written when nothing is written", () => {
    expect(applyDraft(IMPORTED, draft(IMPORTED), draft(IMPORTED), opts)).toMatchObject({ text: IMPORTED });
  });
});

describe("undo", () => {
  it("only while the note is exactly what the edit wrote", () => {
    const r = written(NOTE, (d) => d.tips.push("x"));
    const token = { before: NOTE, after: r.text };
    expect(undoEdit(r.text, token)).toBe(NOTE);
    expect(undoEdit(r.text + "\n- mehr", token)).toBeUndefined();
    expect(undoEdit(NOTE, token)).toBeUndefined();
  });
});

describe("round trips go through draftOfText (H1)", () => {
  const TIPS = NOTE.replace("- Mit Wasser besprühen.", "- Mit Wasser besprühen\n  und abdecken.\n- Zweiter Tipp");
  it("a tip with hanging lines is unchanged in the draft, and an edit of a neighbour leaves it alone", () => {
    expect(draftOfText(TIPS, F).tips).toEqual(["Mit Wasser besprühen und abdecken.", "Zweiter Tipp"]);
    const r = written(TIPS, (d) => (d.tips[1] = "Dritter Tipp"));
    expect(r.text).toContain("- Mit Wasser besprühen\n  und abdecken.\n- Dritter Tipp\n");
  });

  it("opening and saving without a change writes nothing, whatever the notes' formatting is", () => {
    const odd = NOTE.replace("- 1 Würfel Hefe", "- • 200 g Mehl")
      .replace("- 1 TL Salz", "- \\- x")
      .replace("3. Backen.", "3.\tBacken\t.");
    expect(odd).toContain("3.\tBacken\t.");
    expect(odd).toContain("- • 200 g Mehl");
    expect(odd).toContain("- \\- x");
    const d = draftOfText(odd, F);
    expect(d.steps[2].text).toBe("Backen\t.");
    expect(draftChanges(d, structuredClone(d))).toEqual([]);
    expect(applyDraft(odd, d, structuredClone(d), opts)).toEqual({ ok: true, text: odd, parts: [] });
    // the editor state is made of the normalised base: no marker, no escape, no tab
    const n = normalizeDraft(d);
    expect(n.ingredients[1].items).toEqual(["200 g Mehl", "x"]);
    expect(draftChanges(d, n)).toEqual([]);
  });
});

describe("title (H2)", () => {
  it("a note without a `# ` line shows its file name and is saved without one unless the title changes", () => {
    const text = NOTE.replace(/# Brötchen\n\n/, "");
    expect(text).not.toMatch(/^# /m);
    const base = draftOfText(text, F, "Recipes/Brötchen-Rezept.md");
    expect(base.title).toBe("Brötchen-Rezept");
    const next = structuredClone(base);
    next.tips.push("x");
    const r = applyDraft(text, base, next, { ...opts, path: "Recipes/Brötchen-Rezept.md" });
    expect(r.ok && r.text).not.toMatch(/^# /m);
    next.title = "Neu";
    const w = applyDraft(text, base, next, { ...opts, path: "Recipes/Brötchen-Rezept.md" });
    expect(w.ok && w.text).toMatch(/^# Neu\n\n/m);
  });

  it("an empty title only matters when the title was changed", () => {
    const base = draftOfText(NOTE, F);
    expect(validateDraft({ ...base, title: "" }, ["tips"])).toEqual([]);
    expect(validateDraft({ ...base, title: "" }, ["title"])).toEqual([{ code: "title" }]);
  });
});

describe("servings field (M8)", () => {
  const S = NOTE.replace("zeit_aktiv: 20", "portionen: 4\nzeit_aktiv: 20");
  it("is part of the draft only if the note has the field, and is written under its name", () => {
    expect(draftOfText(NOTE, F).servings).toBeUndefined();
    expect(draftOfText(S, F).servings).toBe(4);
    const r = written(S, (d) => (d.servings = 6));
    expect(r.parts).toEqual(["servings"]);
    expect(r.text).toContain("portionen: 6\n");
    expect(r.text).toContain("**Ergebnis:** 4 Brötchen");
  });
});

describe("safety of the whole note (N1, N2, N3, N6)", () => {
  it("a byte order mark stays", () => {
    const r = written("﻿" + NOTE, (d) => d.tips.push("x"));
    expect(r.text.startsWith("﻿---\n")).toBe(true);
  });

  it("a frontmatter the two readers see differently is not written", () => {
    const odd = NOTE.replace("aktualisiert: 2026-11-26\n---", "aktualisiert: 2026-11-26\n---  ");
    const base = draftOfText(odd, F);
    const next = structuredClone(base);
    next.tips.push("x");
    expect(applyDraft(odd, base, next, opts)).toEqual({ ok: false, conflict: false, issues: [{ code: "format" }] });
  });

  it("lines that did not change keep their own ending, new lines get the common one", () => {
    const mixed = NOTE.replace(/\n/g, "\r\n").replace("- Mit Wasser besprühen.\r\n", "- Mit Wasser besprühen.\n");
    const r = written(mixed, (d) => d.tips.push("Neu"));
    expect(r.text).toContain("- Mit Wasser besprühen.\n- Neu\r\n");
    expect(r.text).toContain("# Brötchen\r\n\r\n");
  });

  it("new sections go in the order Ingredients, Steps, Tips", () => {
    const text = NOTE.replace(/## Zutaten[\s\S]*?(?=## Schritte)/, "").replace(/## Tipps[\s\S]*?(?=## Versuche)/, "");
    const r = written(text, (d) => {
      d.tips = ["T"];
      d.ingredients = [{ items: ["Z"] }];
    });
    expect(r.text.match(/^## .*$/gm)).toEqual(["## Zutaten", "## Schritte", "## Tipps", "## Versuche", "## Notizen"]);
  });

  it("only the changed parts are checked", () => {
    const base = draftOfText(NOTE, F);
    const next = { ...structuredClone(base), timeActive: 99999 };
    expect(applyDraft(NOTE, next, { ...next, tips: ["x"] }, opts)).toMatchObject({ ok: true });
  });
});

describe("round 3", () => {
  it("a byte order mark does not hide the frontmatter (M4)", () => {
    const bom = "\uFEFF" + NOTE;
    expect(draftOfText(bom, F).result).toBe("4 Brötchen");
    expect(parseRecipe("", bom, 0, F).category).toBe("Brot");
    const r = written(bom, (d) => (d.result = "8 Brötchen"));
    expect(r.text.startsWith("\uFEFF---\n")).toBe(true);
    expect(r.text).toContain('ergebnis: "8 Brötchen"\n');
    expect(r.text).toContain("**Ergebnis:** 8 Brötchen");
  });

  it("the language of a note with headings of both languages comes from its key facts line (M6)", () => {
    const mixed = [{ heading: "## Zutaten" }, { heading: "## Steps" }];
    expect(noteLangOf(mixed, "**Yield:** 4", "de")).toBe("en");
    expect(noteLangOf(mixed, "**Ergebnis:** 4", "en")).toBe("de");
    expect(noteLangOf(mixed, undefined, "en")).toBe("en");
    expect(noteLangOf([{ heading: "## Steps" }], "**Ergebnis:** 4", "de")).toBe("en");
    expect(noteLangOf([], undefined, "de")).toBe("de");
  });

  it("an escaped ingredient is shown without the backslash by the page's reader (M6)", () => {
    expect(parseRecipe("", "## Zutaten\n- \\- 5 °C Wasser\n- \\## X\n").ingredients[0].ingredients).toEqual([
      "- 5 °C Wasser",
      "## X",
    ]);
  });

  it("the servings field is shown while the key exists, even when empty (N3); zero is no number", () => {
    const empty = NOTE.replace("zeit_aktiv: 20", "portionen:\nzeit_aktiv: 20");
    const d = draftOfText(empty, F);
    expect(d.servingsField).toBe(true);
    expect(d.servings).toBeUndefined();
    const r = written(empty, (x) => (x.servings = 4));
    expect(r.text).toContain("portionen: 4\n");
    expect(validateDraft({ ...d, servings: 0 }, ["servings"])).toEqual([{ code: "servings" }]);
    expect(validateDraft({ ...d, servings: 1001 }, ["servings"])).toEqual([{ code: "servings" }]);
    expect(validateDraft({ ...d, servings: 6 }, ["servings"])).toEqual([]);
  });

  it("an invalid time counts as a change and is reported instead of being dropped (N4)", () => {
    const d = draftOfText(NOTE, F);
    const bad = { ...d, timeActive: NaN };
    expect(draftChanges(d, bad)).toEqual(["times"]);
    expect(validateDraft(bad, ["times"])).toEqual([{ code: "time" }]);
    expect(applyDraft(NOTE, d, bad, opts)).toMatchObject({ ok: false, conflict: false });
    const none = { ...d, timeActive: undefined, timeTotal: undefined };
    expect(draftChanges({ ...d, timeActive: undefined }, { ...none, timeActive: NaN })).toEqual(["times"]);
  });

  it("line endings: a line in the middle with the same text keeps its ending, the rest of the file is untouched (N9)", () => {
    const mixed = "a\r\nb\nc\r\nd\n";
    expect(withEndings(mixed, "a\nb\nX\nc\nd\n")).toBe("a\r\nb\nX\r\nc\r\nd\n");
    expect(withEndings("a\nb\n", "a\nX\nb\n")).toBe("a\nX\nb\n");
  });
});
