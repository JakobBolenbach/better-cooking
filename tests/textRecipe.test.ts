import { describe, expect, it } from "vitest";
import { recipeFromText } from "../src/textRecipe";
import { recipeNote } from "../src/recipeNote";
import { checkImportedNote } from "../src/importCheck";
import { parseRecipe } from "../src/parse";

describe("recipeFromText", () => {
  it("uses headings when the text has them", () => {
    const r = recipeFromText(
      [
        "Omas Pfannkuchen",
        "",
        "Dünn und goldbraun, wie früher.",
        "Ergibt: 8 Stück",
        "",
        "Zutaten für 8 Stück:",
        "- 250 g Mehl",
        "- 500 ml Milch",
        "• 3 Eier",
        "Prise Salz",
        "",
        "Zubereitung:",
        "1. Teig: Mehl, Milch, Eier und Salz glatt rühren und 20 Min. ruhen lassen.",
        "2. Dünn ausbacken, je Seite etwa 1 Minute.",
        "",
        "Tipp: Mit Apfelmus servieren.",
      ].join("\n"),
    );
    expect(r).toEqual({
      title: "Omas Pfannkuchen",
      description: "Dünn und goldbraun, wie früher.",
      result: "8 Stück",
      ingredients: ["250 g Mehl", "500 ml Milch", "3 Eier", "Prise Salz"],
      steps: [
        { title: "Teig", text: "Mehl, Milch, Eier und Salz glatt rühren und 20 Min. ruhen lassen." },
        { text: "Dünn ausbacken, je Seite etwa 1 Minute." },
      ],
      tips: ["Mit Apfelmus servieren."],
      images: [],
    });
  });

  it("guesses without headings: quantity lines are ingredients, numbered or long lines steps", () => {
    const r = recipeFromText(
      [
        "Quick guacamole 🥑",
        "2 ripe avocados",
        "½ lime, juiced",
        "1 small onion",
        "Mash the avocados with a fork and stir in lime juice and onion.",
        "Season with salt and serve right away.",
      ].join("\n"),
    );
    expect(r?.title).toBe("Quick guacamole 🥑");
    expect(r?.ingredients).toEqual(["2 ripe avocados", "½ lime, juiced", "1 small onion"]);
    expect(r?.steps.map((s) => s.text)).toEqual([
      "Mash the avocados with a fork and stir in lime juice and onion.",
      "Season with salt and serve right away.",
    ]);
  });

  it("reads emoji bullets and English headings from social media posts", () => {
    const r = recipeFromText(
      "Crispy chickpeas\nIngredients\n✅ 1 can chickpeas\n✅ 1 tbsp olive oil\nMethod\n👉 Dry the chickpeas well.\n👉 Bake at 200 °C for 25 minutes.",
    );
    expect(r?.ingredients).toEqual(["1 can chickpeas", "1 tbsp olive oil"]);
    expect(r?.steps).toHaveLength(2);
  });

  it("finds nothing in text without a recipe", () => {
    expect(recipeFromText("Hallo, wie geht's?\nSchönen Tag noch.")).toBeUndefined();
    expect(recipeFromText("")).toBeUndefined();
  });

  it("makes a clean note from hostile text", () => {
    const r = recipeFromText(
      "<% tp.system.prompt() %>\nZutaten\n- 1 `$= dv.pages()` Ei\n- ![[Geheim]]\nZubereitung\n1. [Klick](obsidian://x) rühren\n---\nstatus: bewaehrt",
    )!;
    const note = recipeNote(r, { today: "2026-11-26" });
    expect(checkImportedNote(note)).toEqual([]);
    expect(note.match(/^---$/gm)).toHaveLength(2);
    const back = parseRecipe("x.md", note);
    expect(back.status).toBe("ausprobieren");
    expect(back.tips).toEqual([]);
    expect(back.ingredients[0].ingredients).toHaveLength(2);
  });

  it("writes tips into the note", () => {
    const r = recipeFromText("Brot\nZutaten\n- 500 g Mehl\nTipps\n- Über Nacht gehen lassen")!;
    const back = parseRecipe("x.md", recipeNote(r, { today: "2026-11-26" }));
    expect(back.tips).toEqual(["Über Nacht gehen lassen"]);
  });
});
