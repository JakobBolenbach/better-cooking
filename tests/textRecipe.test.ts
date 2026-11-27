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
        { title: "Ausbacken (1 Minute)", text: "Dünn ausbacken, je Seite etwa 1 Minute." },
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
    expect(r?.title).toBe("Quick guacamole");
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

describe("pasted captions (#116)", () => {
  const tomatoSoup = [
    "Schnelle Tomatensuppe 🍅 für 2 Personen",
    "",
    "Zutaten:",
    "1️⃣ 1 Zwiebel, fein gehackt",
    "2️⃣ 2 Zehen Knoblauch",
    "3️⃣ 800 g gehackte Tomaten (Dose)",
    "4️⃣ 300 ml Gemüsebrühe",
    "5️⃣ 1,5 EL Olivenöl",
    "Salz, Pfeffer",
    "",
    "Zubereitung:",
    "1. Zwiebel und Knoblauch im Öl 3 Min. andünsten.",
    "2. Tomaten und Brühe dazugeben und 15 Min. köcheln lassen.",
    "3. Pürieren und abschmecken.",
    "",
    "#tomatensuppe #schnellerezepte #vegan #kochen",
  ].join("\n");
  const lemonRice =
    "Lemon rice (for 4) Ingredients: 300 g rice, 1 lemon, 2 tbsp butter, fresh parsley. Cook the rice for 12 minutes. Stir in butter and lemon zest. Serve with parsley. #lemonrice #easydinner #weeknight";

  it("takes emoji and the yield out of the title and keeps the steps as numbered", () => {
    const r = recipeFromText(tomatoSoup);
    expect(r?.title).toBe("Schnelle Tomatensuppe");
    expect(r?.result).toBe("2 Personen");
    expect(r?.steps.map((s) => s.text)).toEqual([
      "Zwiebel und Knoblauch im Öl 3 Min. andünsten.",
      "Tomaten und Brühe dazugeben und 15 Min. köcheln lassen.",
      "Pürieren und abschmecken.",
    ]);
    expect(r?.steps[0].title).toBe("Andünsten (3 Min.)");
  });

  it("separates the ingredients of a one-line caption from its steps", () => {
    const r = recipeFromText(lemonRice);
    expect(r?.title).toBe("Lemon rice");
    expect(r?.result).toBe("4");
    expect(r?.ingredients).toEqual(["300 g rice", "1 lemon", "2 tbsp butter", "fresh parsley"]);
    expect(r?.steps.map((s) => s.text)).toEqual([
      "Cook the rice for 12 minutes.",
      "Stir in butter and lemon zest.",
      "Serve with parsley.",
    ]);
  });

  it.each([
    ["Pasta (for 4)", "Pasta", "4"],
    ["Pasta for 4 people", "Pasta", "4 people"],
    ["Brot - für 4 Portionen", "Brot", "4 Portionen"],
    ["Kekse | Für 24 Stück", "Kekse", "24 Stück"],
    ["🍕 Pizza 🍕", "Pizza", undefined],
  ])("reads the title line %j", (line, title, result) => {
    const r = recipeFromText(`${line}\n\nZutaten:\n- 200 g Mehl`);
    expect(r?.title).toBe(title);
    expect(r?.result).toBe(result);
  });

  it("leaves a title alone whose 'für' is no yield, and never empties it", () => {
    expect(recipeFromText("Ofengemüse für 20 Min.\n- 200 g Mehl")?.title).toBe("Ofengemüse für 20 Min.");
    expect(recipeFromText("Für 4 Personen\n\nZutaten:\n- 200 g Mehl")?.result).toBe("4 Personen");
    expect(recipeFromText("🍅\n- 200 g Mehl\n- 2 Eier")?.title).not.toBe("");
  });

  it("does not split steps the author numbered", () => {
    const r = recipeFromText(
      "Zutaten:\n- 200 g Mehl\n\nZubereitung:\n1) Mehl sieben und die Butter schmelzen.\n2) Alles verrühren.",
    );
    expect(r?.steps.map((s) => s.text)).toEqual(["Mehl sieben und die Butter schmelzen.", "Alles verrühren."]);
  });

  it("still splits an unnumbered long step like before", () => {
    const r = recipeFromText(
      "Zutaten:\n- 200 g Mehl\n\nZubereitung:\nMehl sieben und die Butter schmelzen. Alles gut verrühren.",
    );
    expect(r?.steps.length).toBeGreaterThan(1);
  });
});
