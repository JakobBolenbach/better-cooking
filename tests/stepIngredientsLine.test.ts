import { beforeEach, describe, expect, it } from "vitest";
import { parseRecipe, listEntries } from "../src/parse";
import {
  ingredientsOfStep,
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

  it("stays text of the step when it is not indented, and other hanging lines stay text", () => {
    const r = parseRecipe(
      "x.md",
      "## Schritte\n1. Rühren.\n- Zutaten: Mehl\n2. Backen.\n   Ofen heiß.\n   - Zutaten: Ei\n",
    );
    expect(r.steps[0].text).toBe("Rühren. - Zutaten: Mehl");
    expect(r.steps[1].text).toBe("Backen. Ofen heiß.");
    expect(r.steps[1].ingredients?.map((x) => x.text)).toEqual(["Ei"]);
  });

  it("is kept out of the entry's text but in its lines", () => {
    const e = listEntries(["1. A", "   - Zutaten: X", "2. B"], "steps");
    expect(e[0]).toMatchObject({ text: "A", lines: [0, 1], ingredients: ["X"], ingredientsLine: 1 });
  });

  it("splits at commas outside of brackets", () => {
    expect(splitItems("Salz (Glasur, fein), 285 g Wasser,, Mehl")).toEqual([
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
    expect(r.recipe.steps.map((s) => s.ingredients)).toEqual([["Mehl", "Salz", "5"], [], undefined]);
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
    expect("error" in translationFromAnswer(JSON.stringify(bad), orig)).toBe(true);
  });
});
