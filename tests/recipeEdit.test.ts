import { describe, expect, it } from "vitest";
import {
  applyDraft,
  categoryListOf,
  draftChanges,
  draftOfText,
  linesOf,
  undoEdit,
  validateDraft,
  type RecipeDraft,
} from "../src/recipeEdit";
import { DEFAULT_FORMAT, makeNoteFormat } from "../src/noteFormat";
import { fingerprints, formatHash, readStored } from "../src/fingerprint";
import { parseRecipe } from "../src/parse";
import { setFactsLine, setTitleLine } from "../src/headEdit";

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
        ["2. Eine Stunde gehen lassen.", "- Heiß servieren.", "aktualisiert: 2026-12-01"],
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
    expect(applyDraft(changed, base, next, opts)).toEqual({ ok: false, conflict: true });
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
