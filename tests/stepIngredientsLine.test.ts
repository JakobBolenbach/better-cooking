import { beforeEach, describe, expect, it } from "vitest";
import { parseRecipe, listEntries } from "../src/parse";
import {
  ingredientsOfSteps,
  capItem,
  guessedItems,
  withKeptLines,
  isExplicit,
  readIngredientLine,
  resolveItem,
  splitItems,
  stepsAsData,
} from "../src/stepIngredients";
import { recipeNote, stepIngredientLines } from "../src/recipeNote";
import { applyDraft, draftOfText } from "../src/recipeEdit";
import { DEFAULT_FORMAT, makeNoteFormat } from "../src/noteFormat";
import { fingerprints, editedParts } from "../src/fingerprint";
import { planRefetch } from "../src/refetch";
import { recipeFromAnswer } from "../src/ai";
import { recipeFromSchema } from "../src/schemaorg";
import { translationFromAnswer, translationMaterial } from "../src/translate";
import { checkImportedNote } from "../src/importCheck";
import { setLanguage } from "../src/i18n";
import type { IngredientGroup } from "../src/types";

beforeEach(() => setLanguage("de"));

const STARS = `---
typ: rezept
import: fertig
---
# Mandelsterne

## Zutaten
**Teig**
- 3 Eiweiß
- 1 Prise Salz
- 200 g Puderzucker
- 300 g gemahlene Mandeln
**Glasur**
- 1 Eiweiß
- 1 Prise Salz
- 100 g Puderzucker
- 500 ml Wasser

## Schritte
1. **Schlagen:** Eiweiß mit Salz steif schlagen.
   - Zutaten: Eiweiß (Teig), Salz (Teig), Puderzucker (Teig)
2. Mandeln unterheben und ausrollen.
   - Zutaten: Mandeln
3. Backen.
4. **Glasieren:** Glasur aufstreichen.
   - Zutaten: Eiweiß (Glasur), Salz (Glasur), 250 ml Wasser, Zuckerguss
`;

describe("the ingredients line under a step", () => {
  it("is no text of the step and is read with its items", () => {
    const r = parseRecipe("x.md", STARS);
    expect(r.steps.map((s) => s.text)).toEqual([
      "Eiweiß mit Salz steif schlagen.",
      "Mandeln unterheben und ausrollen.",
      "Backen.",
      "Glasur aufstreichen.",
    ]);
    expect(r.steps[0].ingredients?.map((x) => x.text)).toEqual(["Eiweiß (Teig)", "Salz (Teig)", "Puderzucker (Teig)"]);
    expect(r.steps[2].ingredients).toBeUndefined();
  });

  it("is recognised in both languages, with the bullets - and *, and says none for 'keine' and for nothing", () => {
    expect(readIngredientLine("   - Zutaten: A, B")).toEqual(["A", "B"]);
    expect(readIngredientLine("  * Ingredients: A")).toEqual(["A"]);
    expect(readIngredientLine("   - Zutaten: keine")).toEqual([]);
    expect(readIngredientLine("   - Ingredients: None")).toEqual([]);
    expect(readIngredientLine("   - Zutaten:")).toEqual([]);
    expect(readIngredientLine("- Zutaten: A")).toBeUndefined();
    expect(readIngredientLine("   - Hinweis: A")).toBeUndefined();
  });

  it("is accepted directly under the step without an indent, but not further down", () => {
    const r = parseRecipe(
      "x.md",
      "## Schritte\n1. Rühren.\n- Zutaten: Mehl\n2. Backen.\n   Ofen heiß.\n   - Zutaten: Ei\n3. Servieren.\n   Text.\n- Zutaten: Salz\n",
    );
    expect(r.steps[0].text).toBe("Rühren.");
    expect(r.steps[0].ingredients?.map((x) => x.text)).toEqual(["Mehl"]);
    // Further down it is part of the text, which the reader then takes apart again (see "repairs").
    expect(r.steps[2].text).toBe("Servieren. Text.");
    expect(r.steps[1].text).toBe("Backen. Ofen heiß.");
    expect(r.steps[1].ingredients?.map((x) => x.text)).toEqual(["Ei"]);
  });

  it("is kept out of the entry's text but in its lines", () => {
    const e = listEntries(["1. A", "   - Zutaten: X", "2. B"], "steps");
    expect(e[0]).toMatchObject({ text: "A", lines: [0, 1], ingredients: ["X"], ingredientsLines: [1] });
  });

  it("splits at commas outside of brackets", () => {
    expect(splitItems("Salz (Glasur, fein), 285 g Wasser, , Mehl")).toEqual([
      "Salz (Glasur, fein)",
      "285 g Wasser",
      "Mehl",
    ]);
  });
});

describe("resolving the items", () => {
  const groups: IngredientGroup[] = [
    { title: "Teig", ingredients: ["3 Eiweiß", "1 Prise Salz", "500 g Wasser"] },
    { title: "Glasur", ingredients: ["1 Eiweiß", "1 Prise Salz"] },
    { title: "Ausstattung", ingredients: ["1 Eiweiß-Schale"] },
  ];
  it("limits to the group in brackets", () => {
    expect(resolveItem("Salz (Glasur)", groups).hits).toEqual([{ group: 1, index: 1 }]);
    expect(resolveItem("Eiweiß (teig)", groups).hits).toEqual([{ group: 0, index: 0 }]);
  });
  it("takes every group without a bracket", () => {
    expect(resolveItem("Salz", groups).hits).toEqual([
      { group: 0, index: 1 },
      { group: 1, index: 1 },
    ]);
  });
  it("reads a bracket that is no group like the ingredient list does (not part of the name)", () => {
    expect(resolveItem("Salz (fein)", groups).hits).toHaveLength(2);
  });
  it("marks an own amount and does not need a hit for it", () => {
    const x = resolveItem("285 g Wasser", groups);
    expect(x.own).toBe(true);
    expect(x.hits).toEqual([{ group: 0, index: 2 }]);
  });
  it("leaves an unknown name unresolved", () => {
    expect(resolveItem("Zuckerguss", groups).hits).toEqual([]);
  });
});

const ingredientsOfStep = (r: Parameters<typeof ingredientsOfSteps>[0], i: number) => ingredientsOfSteps(r)[i];

describe("ingredients of a step in cooking mode", () => {
  const r = parseRecipe("x.md", STARS);
  it("come from the list: lines of the groups named, own amounts and unknown names as written", () => {
    expect(ingredientsOfStep(r, 0)).toEqual({
      hits: [
        { group: 0, index: 0 },
        { group: 0, index: 1 },
        { group: 0, index: 2 },
      ],
      extra: [],
    });
    const last = ingredientsOfStep(r, 3);
    expect(last.hits).toEqual([
      { group: 1, index: 0 },
      { group: 1, index: 1 },
    ]);
    expect(last.extra).toEqual(["250 ml Wasser", "Zuckerguss"]);
  });
  it("are none for a step without a line once another step has one (no guessing)", () => {
    expect(isExplicit(r.steps)).toBe(true);
    expect(ingredientsOfStep(r, 2)).toEqual({ hits: [], extra: [] });
  });
  it("are guessed only when no step has a line", () => {
    const g = parseRecipe("x.md", "## Zutaten\n- 200 g Mehl\n\n## Schritte\n1. Mehl sieben.\n2. Ruhen lassen.\n");
    expect(isExplicit(g.steps)).toBe(false);
    expect(ingredientsOfStep(g, 0).hits).toEqual([{ group: 0, index: 0 }]);
    expect(ingredientsOfStep(g, 1).hits).toEqual([]);
  });
  it("'none' makes a recipe explicit and shows nothing", () => {
    const g = parseRecipe("x.md", "## Zutaten\n- 200 g Mehl\n\n## Schritte\n1. Mehl sieben.\n   - Zutaten: keine\n");
    expect(g.steps[0].ingredients).toEqual([]);
    expect(ingredientsOfStep(g, 0)).toEqual({ hits: [], extra: [] });
  });
});

describe("writing the line", () => {
  const fmt = makeNoteFormat("en").format;
  const recipe = {
    title: "T",
    ingredients: ["1 Egg"],
    steps: [
      { text: "Whisk.", ingredients: ["Egg", "salt (Glaze)"] },
      { text: "Rest." },
      { text: "Bake.", ingredients: [] },
    ],
    images: [],
  };
  it("writes it in the language of the note, only for steps with items", () => {
    const en = recipeNote(recipe, { today: "2026-11-26", format: fmt });
    expect(en).toContain("1. Whisk.\n   - Ingredients: Egg, salt (Glaze)\n2. Rest.\n3. Bake.\n");
    const de = recipeNote(recipe, { today: "2026-11-26" });
    expect(de).toContain("1. Whisk.\n   - Zutaten: Egg, salt (Glaze)\n2. Rest.");
    expect(checkImportedNote(en)).toEqual([]);
  });
  it("reads back what it wrote", () => {
    const back = parseRecipe("x.md", recipeNote(recipe, { today: "2026-11-26", format: fmt }), 0, fmt.fields);
    expect(stepsAsData(back.steps)).toEqual([
      { text: "Whisk.", ingredients: ["Egg", "salt (Glaze)"] },
      { text: "Rest." },
      { text: "Bake." },
    ]);
  });
  it("writes 'none' under the first step if the source says that no step has ingredients, else nothing", () => {
    expect(stepIngredientLines([{ ingredients: [] }, { ingredients: [] }], "de")).toEqual([
      ["   - Zutaten: keine"],
      [],
    ]);
    expect(stepIngredientLines([{}, {}], "de")).toEqual([[], []]);
  });
  it("defuses hostile items and keeps commas out of an item", () => {
    const note = recipeNote(
      { ...recipe, steps: [{ text: "A.", ingredients: ["![[x]]", "[a](obsidian://b)", "Mehl, gesiebt"] }] },
      { today: "2026-11-26" },
    );
    const line = note.split("\n").find((l) => l.includes("Zutaten:") && l.startsWith("   -"))!;
    expect(line).not.toContain("![[");
    expect(line).not.toContain("](");
    expect(parseRecipe("x.md", note).steps[0].ingredients).toHaveLength(3);
  });
});

describe("the fingerprint", () => {
  it("counts the line to the steps: a hand edit of it is a hand edit of the steps", () => {
    const before = fingerprints(STARS, DEFAULT_FORMAT.fields);
    const edited = STARS.replace("Eiweiß (Glasur), Salz (Glasur)", "Eiweiß (Glasur)");
    expect(editedParts(edited, DEFAULT_FORMAT.fields, before)).toEqual(["steps"]);
    expect(editedParts(STARS, DEFAULT_FORMAT.fields, before)).toEqual([]);
  });
});

describe("the editor", () => {
  const apply = (text: string, change: (d: ReturnType<typeof draftOfText>) => void) => {
    const base = draftOfText(text, DEFAULT_FORMAT.fields);
    const draft = structuredClone(base);
    change(draft);
    const res = applyDraft(text, base, draft, { format: DEFAULT_FORMAT, today: "2026-12-01" });
    if (!res.ok) throw new Error(JSON.stringify(res));
    return res.text;
  };
  it("shows the items of a step as one text", () => {
    expect(draftOfText(STARS, DEFAULT_FORMAT.fields).steps[1].ingredients).toBe("Mandeln");
    expect(draftOfText(STARS, DEFAULT_FORMAT.fields).steps[2].ingredients).toBeUndefined();
  });
  it("changes only the line when only the items change", () => {
    const out = apply(STARS, (d) => (d.steps[1].ingredients = "Mandeln, Salz (Teig)"));
    const body = (t: string) => t.slice(t.indexOf("# Mandelsterne"));
    expect(body(out)).toBe(body(STARS).replace("Zutaten: Mandeln\n", "Zutaten: Mandeln, Salz (Teig)\n"));
  });
  it("adds a line under a step without one and removes it when the field is cleared", () => {
    const added = apply(STARS, (d) => (d.steps[2].ingredients = "Zuckerguss"));
    expect(added).toContain("3. Backen.\n   - Zutaten: Zuckerguss\n4. ");
    const removed = apply(STARS, (d) => (d.steps[1].ingredients = ""));
    expect(removed).toContain("2. Mandeln unterheben und ausrollen.\n3. Backen.");
    expect(removed).not.toContain("Zutaten: Mandeln");
  });
  it("keeps the line when the text of the step is edited and when the step moves", () => {
    const edited = apply(STARS, (d) => (d.steps[1].text = "Mandeln unterheben."));
    expect(edited).toContain("2. Mandeln unterheben.\n   - Zutaten: Mandeln\n3. Backen.");
    const moved = apply(STARS, (d) => d.steps.splice(0, 0, ...d.steps.splice(1, 1)));
    expect(moved).toContain("1. Mandeln unterheben und ausrollen.\n   - Zutaten: Mandeln\n2. **Schlagen:**");
  });
  it("writes the line of a new step and writes in the language of the note", () => {
    const en = STARS.replace(/Schritte/, "Steps")
      .replace("## Zutaten", "## Ingredients")
      .replace(/Zutaten: /g, "Ingredients: ");
    const out = apply(en, (d) => d.steps.push({ text: "Servieren.", ingredients: "Zimt" }));
    expect(out.trimEnd().endsWith("5. Servieren.\n   - Ingredients: Zimt")).toBe(true);
    const de = apply(STARS, (d) => d.steps.push({ text: "Servieren.", ingredients: "Zimt" }));
    expect(de.trimEnd().endsWith("5. Servieren.\n   - Zutaten: Zimt")).toBe(true);
  });
  it("leaves a step with an explicit 'none' alone", () => {
    const text = "## Zutaten\n- Mehl\n\n## Schritte\n1. Ruhen.\n   - Zutaten: keine\n2. Backen.\n";
    const out = apply(text, (d) => (d.steps[0].text = "Ruhen lassen."));
    expect(out).toContain("1. Ruhen lassen.\n   - Zutaten: keine\n2. Backen.");
  });
});

describe("the own AI", () => {
  const answer = {
    name: "Brot",
    recipeIngredient: ["500 g Mehl", "1 TL Salz"],
    recipeInstructions: [
      { "@type": "HowToStep", name: "Mischen", text: "Mehl und Salz mischen.", ingredients: ["Mehl", "Salz", 5, ""] },
      { "@type": "HowToStep", name: "Gehen", text: "Gehen lassen.", ingredients: [] },
      { "@type": "HowToStep", name: "Backen", text: "Backen." },
    ],
  };
  it("gives the ingredients per step as plain, limited lines", () => {
    const r = recipeFromAnswer(JSON.stringify(answer));
    if (!("recipe" in r)) throw new Error(r.error);
    expect(r.recipe.steps.map((s) => s.ingredients)).toEqual([["Mehl", "Salz", "5"], undefined, undefined]);
    const long = recipeFromAnswer(
      JSON.stringify({
        ...answer,
        recipeInstructions: [{ text: "A.", ingredients: Array.from({ length: 40 }, () => "x".repeat(200)) }],
      }),
    );
    if (!("recipe" in long)) throw new Error(long.error);
    expect(long.recipe.steps[0].ingredients).toHaveLength(20);
    expect(long.recipe.steps[0].ingredients![0]).toHaveLength(80);
  });
  it("is never read from a web page", () => {
    const r = recipeFromSchema(answer, "https://example.org/");
    expect(r.steps.every((s) => s.ingredients === undefined)).toBe(true);
  });
  it("is part of the translation, with the same structure", () => {
    const orig = parseRecipe(
      "x.md",
      "# T\n\n## Zutaten\n- 1 Ei\n\n## Schritte\n1. Rühren.\n   - Zutaten: Ei\n2. Ruhen.\n",
    );
    expect(translationMaterial(orig, "English")).toContain('"ingredients":["Ei"]');
    const ok = {
      title: "T",
      groups: [{ ingredients: ["1 egg"] }],
      steps: [{ text: "Stir.", ingredients: ["egg"] }, { text: "Rest." }],
      tips: [],
    };
    const t = translationFromAnswer(JSON.stringify(ok), orig);
    if (!("recipe" in t)) throw new Error(t.error);
    expect(t.recipe.steps.map((s) => s.ingredients)).toEqual([["egg"], undefined]);
    const bad = { ...ok, steps: [{ text: "Stir." }, { text: "Rest." }] };
    const kept = translationFromAnswer(JSON.stringify(bad), orig);
    if (!("recipe" in kept)) throw new Error(kept.error);
    expect(kept.recipe.steps[0].ingredients).toEqual(["Ei"]);
  });
});

describe("round 2: decimal commas, lists, repairs", () => {
  const fmt = makeNoteFormat("de").format;
  const items = ["0,5 TL Salz", "1,5 l Milch (Teig)", "Salz (Glasur, fein)"];
  const note = (extra = "") =>
    `## Zutaten\n**Teig**\n- 1 l Milch\n- Salz\n**Glasur**\n- Salz\n\n## Schritte\n1. Rühren.\n   - Zutaten: ${items.join(", ")}${extra}\n`;

  it("keeps decimal commas and commas in brackets through the parser, recipeNote and the editor", () => {
    expect(parseRecipe("x.md", note()).steps[0].ingredients?.map((x) => x.text)).toEqual(items);
    const written = recipeNote(
      { title: "T", ingredients: ["x"], steps: [{ text: "Rühren.", ingredients: items }], images: [] },
      { today: "2026-11-26", format: fmt },
    );
    expect(parseRecipe("x.md", written).steps[0].ingredients?.map((x) => x.text)).toEqual(items);
    expect(written).toContain("Zutaten: 0,5 TL Salz, 1,5 l Milch (Teig), Salz (Glasur, fein)");
    const base = draftOfText(note(), DEFAULT_FORMAT.fields);
    expect(base.steps[0].ingredients).toBe(items.join(", "));
    const draft = structuredClone(base);
    draft.steps[0].text = "Gut rühren.";
    const res = applyDraft(note(), base, draft, { format: DEFAULT_FORMAT, today: "2026-12-01" });
    if (!res.ok) throw new Error("no");
    expect(parseRecipe("x.md", res.text).steps[0].ingredients?.map((x) => x.text)).toEqual(items);
    draft.steps[0].ingredients = "0,5 TL Salz,Milch, Salz, fein";
    const res2 = applyDraft(note(), base, draft, { format: DEFAULT_FORMAT, today: "2026-12-01" });
    if (!res2.ok) throw new Error("no");
    expect(res2.text).toContain("Zutaten: 0,5 TL Salz, Milch, Salz, fein\n");
  });

  it("is read with any indent, a tab and CRLF", () => {
    for (const indent of ["  ", "   ", "    ", "\t"]) {
      const r = parseRecipe("x.md", `## Schritte\r\n1. A.\r\n${indent}- Zutaten: Mehl\r\n`);
      expect(r.steps[0].ingredients?.map((x) => x.text)).toEqual(["Mehl"]);
    }
  });

  it("is edited in a note with CRLF and with an image line between", () => {
    const text = "## Zutaten\r\n- Mehl\r\n\r\n## Schritte\r\n1. A.\r\n   - Zutaten: Mehl\r\n![[bild.png]]\r\n2. B.\r\n";
    const base = draftOfText(text, DEFAULT_FORMAT.fields);
    const draft = structuredClone(base);
    draft.steps[0].ingredients = "Mehl, Salz";
    const res = applyDraft(text, base, draft, { format: DEFAULT_FORMAT, today: "2026-12-01" });
    if (!res.ok) throw new Error("no");
    expect(res.text).toContain("1. A.\r\n   - Zutaten: Mehl, Salz\r\n![[bild.png]]\r\n2. B.");
  });

  it("never reads a list in the middle of a step's text as a line, and keeps what follows it", () => {
    const old = "## Zutaten\n- Mehl\n\n## Schritte\n1. Rühren. - Zutaten: Mehl, Salz\n2. Backen.\n";
    const r = parseRecipe("x.md", old);
    expect(r.steps[0].text).toBe("Rühren. - Zutaten: Mehl, Salz");
    expect(r.steps[0].ingredients).toBeUndefined();
    expect(isExplicit(r.steps)).toBe(false);
  });

  it("neutralises the pattern in imported, translated and typed text, which stays readable", () => {
    const written = recipeNote(
      {
        title: "T",
        ingredients: ["1 Ei"],
        steps: [{ text: "Rühren. - Zutaten: siehe oben, dann Ei - Ingredients: x" }],
        images: [],
      },
      { today: "2026-11-26" },
    );
    const r = parseRecipe("x.md", written);
    expect(r.steps[0].ingredients).toBeUndefined();
    expect(isExplicit(r.steps)).toBe(false);
    expect(r.steps[0].text.replace(/\u200b/g, "")).toBe("Rühren. - Zutaten: siehe oben, dann Ei - Ingredients: x");
    const base = draftOfText("## Schritte\n1. A.\n", DEFAULT_FORMAT.fields);
    const d = structuredClone(base);
    d.steps[0].text = "A. - Zutaten: Mehl";
    const res = applyDraft("## Schritte\n1. A.\n", base, d, { format: DEFAULT_FORMAT, today: "2026-12-01" });
    if (!res.ok) throw new Error("no");
    expect(parseRecipe("x.md", res.text).steps[0].ingredients).toBeUndefined();
  });

  it("merges a second line into the list and writes one line when edited", () => {
    const t = "## Schritte\n1. A.\n   - Zutaten: Mehl\n   - Ingredients: Salz\n";
    expect(parseRecipe("x.md", t).steps[0].ingredients?.map((x) => x.text)).toEqual(["Mehl", "Salz"]);
    const base = draftOfText(t, DEFAULT_FORMAT.fields);
    const d = structuredClone(base);
    d.steps[0].ingredients = "Mehl, Salz, Zimt";
    const res = applyDraft(t, base, d, { format: DEFAULT_FORMAT, today: "2026-12-01" });
    if (!res.ok) throw new Error("no");
    expect(res.text).toContain("1. A.\n   - Zutaten: Mehl, Salz, Zimt\n");
    expect(res.text).not.toContain("Ingredients:");
  });

  it("writes a space after the colon of an old line that had none", () => {
    const t = "## Schritte\n1. A.\n   - Zutaten:Mehl\n";
    const base = draftOfText(t, DEFAULT_FORMAT.fields);
    const d = structuredClone(base);
    d.steps[0].ingredients = "Salz";
    const res = applyDraft(t, base, d, { format: DEFAULT_FORMAT, today: "2026-12-01" });
    if (!res.ok) throw new Error("no");
    expect(res.text).toContain("   - Zutaten: Salz\n");
  });

  it("gives an import without items no line and keeps 'none' that comes from a note", () => {
    const r = recipeFromAnswer(
      JSON.stringify({
        name: "B",
        recipeIngredient: ["1 Ei"],
        recipeInstructions: [{ text: "A.", ingredients: [] }, { text: "B." }],
      }),
    );
    if (!("recipe" in r)) throw new Error(r.error);
    expect(r.recipe.steps.every((s) => s.ingredients === undefined)).toBe(true);
    const fromNote = parseRecipe("x.md", "## Zutaten\n- Ei\n\n## Schritte\n1. A.\n   - Zutaten: keine\n2. B.\n");
    const out = recipeNote(
      { title: "T", ingredients: ["Ei"], steps: stepsAsData(fromNote.steps), images: [] },
      { today: "2026-11-26" },
    );
    expect(out).toContain("1. A.\n   - Zutaten: keine\n2. B.");
  });

  it("limits the items of a step when they are read back for a writer", () => {
    const many = Array.from({ length: 30 }, (_, i) => `${"x".repeat(100)}${i}`).join(", ");
    const r = parseRecipe("x.md", `## Schritte\n1. A.\n   - Zutaten: ${many}\n`);
    const data = stepsAsData(r.steps)[0].ingredients!;
    expect(data).toHaveLength(20);
    expect(data[0]).toHaveLength(80);
  });
});

describe("groups in brackets", () => {
  const groups: IngredientGroup[] = [
    { title: "Teig", ingredients: ["200 g gemahlene Mandeln", "1 Prise Salz"] },
    { title: "Für die Arbeitsfläche", ingredients: ["50 g gemahlene Mandeln"] },
    { title: "Zum Tränken", ingredients: ["100 ml Milch"] },
    { title: "Ganache", ingredients: ["200 ml Schlagsahne", "1 Prise Salz"] },
  ];
  it("compare without case and unicode form and by a significant word of the title", () => {
    expect(resolveItem("gemahlene Mandeln (Arbeitsfläche)", groups).hits).toEqual([{ group: 1, index: 0 }]);
    expect(resolveItem("gemahlene Mandeln (arbeitsflache)", groups).hits).toEqual([{ group: 1, index: 0 }]);
    expect(resolveItem("gemahlene Mandeln (Zutaten)", groups).hits).toHaveLength(2);
    expect(resolveItem("Milch (Tränken)", groups).hits).toEqual([{ group: 2, index: 0 }]);
    expect(resolveItem("Milch (Tra\u0308nken)", groups).hits).toEqual([{ group: 2, index: 0 }]);
    expect(resolveItem("Schlagsahne (GANACHE)", groups).hits).toEqual([{ group: 3, index: 0 }]);
    expect(resolveItem("Salz (Teig)", groups).group).toBe(0);
  });
  it("fall back to the head word inside the named group", () => {
    const g: IngredientGroup[] = [
      { title: "Teig", ingredients: ["500 g Weizenmehl Type 550"] },
      { ingredients: ["1 Mehl"] },
    ];
    expect(resolveItem("Mehl (Teig)", g).hits).toEqual([{ group: 0, index: 0 }]);
    expect(resolveItem("Zucker (Teig)", g).hits).toEqual([]);
    // Without a group only the exact name counts ("Weizenmehl" is not "Weizenmehl Type 550" in the shopping identity).
    expect(resolveItem("Weizenmehl", g).hits).toEqual([]);
  });
  it("allow the same item in two steps and use the neighbours for a name in several groups", () => {
    const note = `## Zutaten
**Teig**
- 200 g Marzipanrohmasse
- 1 Prise Salz
**Ganache**
- 1 Prise Salz
- 200 ml Sahne

## Schritte
1. Rühren.
   - Zutaten: Marzipanrohmasse, Salz (Teig)
2. Backen.
3. Sahne erhitzen.
    - Zutaten: Sahne, Salz
4. Zerkrümeln.
   - Zutaten: Marzipanrohmasse
`;
    const r = parseRecipe("x.md", note);
    const per = ingredientsOfSteps(r);
    expect(per[0].hits).toEqual([
      { group: 0, index: 0 },
      { group: 0, index: 1 },
    ]);
    expect(per[3].hits).toEqual([{ group: 0, index: 0 }]);
    // "Salz" in step 3 is in two groups: the step names Sahne of the Ganache, so Salz goes there.
    expect(per[2].hits.filter((h) => r.ingredients[h.group].ingredients[h.index].includes("Salz"))).toHaveLength(1);
  });
});

describe("proposals, Fetch again and translations keep what is in the note", () => {
  type St = { text: string; ingredients?: string[] };
  const old = parseRecipe(
    "x.md",
    "## Zutaten\n- Mehl\n- Salz\n\n## Schritte\n1. Mehl sieben und mischen.\n   - Zutaten: Mehl\n2. Salz in Wasser lösen.\n   - Zutaten: Salz\n3. Backen.\n",
  ).steps;
  const names = (steps: St[]) => steps.map((x) => x.ingredients);
  it("carries the lines over when every step with a line finds its step again", () => {
    expect(
      names(
        withKeptLines<St>(
          [{ text: "Mehl sieben und mischen." }, { text: "Salz in Wasser lösen." }, { text: "Backen." }],
          old,
        ),
      ),
    ).toEqual([["Mehl"], ["Salz"], undefined]);
  });
  it("follows reordered, reworded and added steps", () => {
    expect(
      names(withKeptLines<St>([{ text: "Salz in Wasser lösen." }, { text: "Mehl sieben und mischen." }], old)),
    ).toEqual([["Salz"], ["Mehl"]]);
    expect(
      names(
        withKeptLines<St>(
          [{ text: "Das Mehl sieben." }, { text: "Ofen vorheizen." }, { text: "Das Salz im Wasser lösen." }],
          old,
        ),
      ),
    ).toEqual([["Mehl"], undefined, ["Salz"]]);
  });
  it("drops all lines if one step with a line has no clear counterpart (never half explicit)", () => {
    const steps: St[] = [{ text: "Mehl sieben und mischen." }, { text: "Zimt mahlen." }, { text: "Backen." }];
    expect(withKeptLines(steps, old)).toBe(steps);
    // Two new steps are equally like the old one and neither stands where it stood: no clear counterpart.
    const twice: St[] = [{ text: "Ganz anders." }, { text: "Salz lösen." }, { text: "Salz in Wasser lösen." }];
    expect(withKeptLines(twice, old.slice(1))).toBe(twice);
  });
  it("takes nothing if the new version has lines itself", () => {
    const own = [{ text: "A.", ingredients: ["Salz"] }, { text: "B." }];
    expect(withKeptLines(own, old)).toBe(own);
  });
  it("applies to Fetch again with data of a page, in the same way", () => {
    const src = {
      title: "T",
      ingredients: ["Mehl", "Salz"],
      steps: [
        { text: "Mehl sieben und mischen.", ingredients: ["Mehl"] },
        { text: "Salz in Wasser lösen.", ingredients: ["Salz"] },
      ],
      images: [],
    };
    const note = recipeNote(src, { source: "https://example.org/x", today: "2026-11-01" });
    const fresh = {
      ...src,
      title: "T",
      steps: [{ text: "Salz in Wasser lösen." }, { text: "Mehl sieben und mischen." }],
    };
    const out = planRefetch(note, fresh, { format: DEFAULT_FORMAT, today: "2026-11-27", replace: [] });
    expect(out.text).toContain(
      "1. Salz in Wasser lösen.\n   - Zutaten: Salz\n2. Mehl sieben und mischen.\n   - Zutaten: Mehl",
    );
    const other = planRefetch(
      note,
      { ...fresh, steps: [{ text: "Ganz anders." }, { text: "Mehl sieben und mischen." }] },
      { format: DEFAULT_FORMAT, today: "2026-11-27", replace: [] },
    );
    expect(other.text).not.toContain("Zutaten:");
  });
  it("writes the translated group title into the bracket and keeps the original items on a mismatch", () => {
    const orig = parseRecipe(
      "x.md",
      "# T\n\n## Zutaten\n**Glasur**\n- 1 Ei\n\n## Schritte\n1. Rühren.\n   - Zutaten: Ei (Glasur), Salz\n2. Backen.\n   - Zutaten: Ei (Glasur)\n",
    );
    const answer = {
      title: "T",
      groups: [{ title: "Glaze", ingredients: ["1 egg"] }],
      steps: [
        { text: "Stir.", ingredients: ["egg", "salt"] },
        { text: "Bake.", ingredients: [] },
      ],
      tips: [],
    };
    const t = translationFromAnswer(JSON.stringify(answer), orig);
    if (!("recipe" in t)) throw new Error(t.error);
    expect(t.recipe.steps[0].ingredients).toEqual(["egg (Glaze)", "salt"]);
    expect(t.recipe.steps[1].ingredients).toEqual(["Ei (Glasur)"]);
    expect(translationMaterial(orig, "English")).toContain('"ingredients":["Ei","Salz"]');
  });
});

describe("the editor guesses for the other steps when the first list is written", () => {
  it("gives them names, with the group in brackets for a name in several groups", () => {
    const groups: IngredientGroup[] = [
      { title: "Teig", ingredients: ["200 g Mehl", "1 Prise Salz"] },
      { title: "Glasur", ingredients: ["1 Prise Salz"] },
    ];
    const g = guessedItems([{ text: "Mehl sieben." }, { text: "Ruhen lassen." }], groups);
    expect(g).toEqual([["Mehl"], []]);
    expect(guessedItems([{ text: "Salz zugeben." }], groups)[0]).toEqual(["Salz (Teig)", "Salz (Glasur)"]);
  });
});

describe("Fetch again", () => {
  it("keeps a hand-written ingredients line while it replaces other parts", () => {
    const src = {
      title: "T",
      ingredients: ["1 Ei", "1 Prise Salz"],
      steps: [{ text: "Rühren.", ingredients: ["Ei"] }],
      images: [],
    };
    const note = recipeNote(src, { source: "https://example.org/x", today: "2026-11-01" });
    const mine = note.replace("Zutaten: Ei", "Zutaten: Ei, Salz");
    const page = { ...src, title: "Neu", steps: [{ text: "Rühren." }] };
    const out = planRefetch(mine, page, { format: DEFAULT_FORMAT, today: "2026-11-27", replace: [] });
    expect(out.edited).toEqual(["steps"]);
    expect(out.text).toContain("   - Zutaten: Ei, Salz");
    expect(out.text).toMatch(/^# Neu$/m);
  });
});

describe("round 3 details", () => {
  it("separates at every comma except between digits and in brackets", () => {
    expect(splitItems("Mehl,Wasser,Salz")).toEqual(["Mehl", "Wasser", "Salz"]);
    expect(splitItems("1,5 EL Öl, Salz (a,b)")).toEqual(["1,5 EL Öl", "Salz (a,b)"]);
  });
  it("cuts the name of an item, never its group bracket", () => {
    const long = `${"x".repeat(100)} (Glasur)`;
    expect(capItem(long)).toBe(`${"x".repeat(80)} (Glasur)`);
    expect(capItem("y".repeat(100))).toHaveLength(80);
  });
  it("takes the brackets out of a group title for the guessed names", () => {
    const g: IngredientGroup[] = [
      { title: "Teig (klein)", ingredients: ["1 Prise Salz"] },
      { title: "Glasur", ingredients: ["1 Prise Salz"] },
    ];
    expect(guessedItems([{ text: "Salz zugeben." }], g)[0]).toEqual(["Salz (Teig klein)", "Salz (Glasur)"]);
  });
  it("shows two entries of one name in the same group both (a known limit)", () => {
    const g: IngredientGroup[] = [{ title: "Teig", ingredients: ["1 EL Zucker", "2 EL Zucker"] }];
    expect(resolveItem("Zucker (Teig)", g).hits).toHaveLength(2);
  });
});
