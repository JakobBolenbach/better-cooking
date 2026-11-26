import { describe, expect, it } from "vitest";
import { captionHint, cleanCaption } from "../src/caption";
import { recipeFromText } from "../src/textRecipe";
import { de } from "../src/strings/de";
import { en } from "../src/strings/en";

describe("cleanCaption", () => {
  it("removes the Instagram prefix in English and German, and the quotes around the caption", () => {
    expect(cleanCaption('1,234 likes, 56 comments - kochfan_test on March 3, 2026: "Nudeln mit Pesto"')).toBe(
      "Nudeln mit Pesto",
    );
    expect(
      cleanCaption("1.234 „Gefällt mir“-Angaben, 56 Kommentare - kochfan.test am 3. März 2026: „Nudeln mit Pesto“"),
    ).toBe("Nudeln mit Pesto");
  });

  it("drops hashtag and mention lines, trailing tags, and keeps the word of a tag inside a sentence", () => {
    const t = cleanCaption(
      "Heute gibt es #Pasta mit Tomaten #lecker #foodie\n\n#pasta #italy\n@kochfan @freund\nPlatz #1",
    );
    expect(t).toBe("Heute gibt es Pasta mit Tomaten\nPlatz #1");
  });

  it("turns number and bullet emoji into list markers", () => {
    expect(cleanCaption("1️⃣ Eier trennen\n2️⃣ Zucker schlagen\n🔟 Servieren\n▪️ 200 g Mehl\n➡️ 1 Ei")).toBe(
      "1. Eier trennen\n2. Zucker schlagen\n10. Servieren\n- 200 g Mehl\n- 1 Ei",
    );
  });

  it("puts headings inside a line on their own line", () => {
    expect(cleanCaption("Zutaten: 200 g Mehl, 1 Ei Zubereitung: Alles verrühren.", { caption: true })).toBe(
      "Zutaten:\n200 g Mehl\n1 Ei\nZubereitung:\nAlles verrühren.",
    );
    expect(cleanCaption("3 simple steps: mix well", { caption: true })).toBe("3 simple steps: mix well");
  });

  it("leaves a normal recipe text alone", () => {
    const t = "Pfannkuchen\n\nZutaten:\n- 250 g Mehl\n- 3 Eier\n\nZubereitung:\n1. Rühren. Dann backen.";
    expect(cleanCaption(t).split("\n").filter(Boolean)).toEqual(t.split("\n").filter(Boolean));
  });
});

describe("recipeFromText with captions", () => {
  it("reads a well formatted German Instagram caption", () => {
    const r = recipeFromText(
      [
        "2.345 „Gefällt mir“-Angaben, 40 Kommentare - kochfan_test am 3. März 2026: „Cremige Tomatennudeln 🍝",
        "",
        "Zutaten (für 2 Personen):",
        "▪️ 200 g Nudeln",
        "▪️ 1 Dose Tomaten",
        "▪️ 1 Zwiebel",
        "",
        "Zubereitung:",
        "1️⃣ Nudeln in Salzwasser kochen.",
        "2️⃣ Zwiebel anbraten und Tomaten dazugeben.",
        "",
        "#nudeln #schnellundlecker @kochfan_test“",
      ].join("\n"),
    );
    expect(r?.title).toBe("Cremige Tomatennudeln 🍝");
    expect(r?.result).toBe("2 Personen");
    expect(r?.ingredients).toEqual(["200 g Nudeln", "1 Dose Tomaten", "1 Zwiebel"]);
    expect(r?.steps.map((s) => s.text)).toEqual([
      "Nudeln in Salzwasser kochen.",
      "Zwiebel anbraten.",
      "Tomaten dazugeben.",
    ]);
    expect(JSON.stringify(r)).not.toContain("#");
  });

  it("reads an English caption with inline headings and a yield line", () => {
    const r = recipeFromText(
      "Lemon rice 🍋 (serves 4)\nIngredients: 2 cups rice, 1 lemon, 2 tbsp butter\nMethod: Cook the rice. Stir in butter and lemon juice.\n#rice #easy",
    );
    expect(r?.result).toBe("4");
    expect(r?.ingredients).toEqual(["2 cups rice", "1 lemon", "2 tbsp butter"]);
    expect(r?.steps.map((s) => s.text)).toEqual(["Cook the rice.", "Stir in butter and lemon juice."]);
  });

  it("splits a one-line TikTok caption without headings", () => {
    const r = recipeFromText(
      "Cremige Nudeln: 250 g Pasta, 100 ml Sahne, 1 Knoblauchzehe. Pasta kochen. Sahne mit Knoblauch erhitzen. Alles mischen. #fyp #pasta",
      { caption: true },
    );
    expect(r?.title).toBe("Cremige Nudeln");
    expect(r?.ingredients).toEqual(["250 g Pasta", "100 ml Sahne", "1 Knoblauchzehe"]);
    expect(r?.steps.map((s) => s.text)).toEqual(["Pasta kochen.", "Sahne mit Knoblauch erhitzen.", "Alles mischen."]);
  });

  it("makes no step out of hashtags in a prose caption", () => {
    const r = recipeFromText(
      "Meine liebste Suppe für kalte Tage, ich koche sie jede Woche und ihr werdet sie lieben.\n#suppe #herbst #foodblogger #rezept #lecker",
    );
    expect(JSON.stringify(r ?? {})).not.toContain("#");
    expect(r?.steps ?? []).toEqual([]);
  });
});

describe("captionHint", () => {
  it.each([
    ["Rezept in der Bio 🔗", "captionInBio"],
    ["Link in Bio für das komplette Rezept", "captionInBio"],
    ["Full recipe in my bio!", "captionInBio"],
    ["recipe link in bio", "captionInBio"],
    ["Das ganze Rezept auf meinem Blog", "captionOnSite"],
    ["Full recipe on my website", "captionOnSite"],
    ["Kommentiere REZEPT und ich schicke es dir", "captionComment"],
    ['Comment "RECIPE" and I will DM you', "captionComment"],
  ])("recognizes %s", (text, key) => {
    expect(captionHint(text)).toBe(key);
  });

  it("finds no hint in a recipe or in a plain text", () => {
    expect(captionHint("Zutaten: 200 g Mehl\nZubereitung: Rezept von Oma, in der Pfanne backen.")).toBeUndefined();
    expect(captionHint("Ein Kommentar zum Wetter.")).toBeUndefined();
  });

  it("has a text in both languages for every key", () => {
    for (const k of ["captionInBio", "captionOnSite", "captionComment"] as const) {
      expect(de[k].length).toBeGreaterThan(20);
      expect(en[k].length).toBeGreaterThan(20);
    }
  });
});

const meta = (text: string, caption = true) => recipeFromText(text, { caption });

describe("review of #88", () => {
  it("does not change a normal pasted text without the caption option", () => {
    const text =
      "Pfannkuchen\nZutaten: 200 g Mehl, 1 Ei, 100 ml Milch Zubereitung: Alles rühren.\nWeitere Hinweise folgen. #1";
    expect(cleanCaption(text)).toBe(text);
  });

  it("applies the caption rules by itself for a clear caption", () => {
    expect(cleanCaption("1️⃣ Eier trennen. Zubereitung: Rühren")).toContain("Zubereitung:\nRühren");
    expect(cleanCaption('12 likes, 3 comments - a_b on May 1, 2026: "Hallo. Zutaten: 1 Ei"')).toBe(
      "Hallo.\nZutaten:\n1 Ei",
    );
  });

  it("strips quotes only after an Instagram prefix", () => {
    expect(cleanCaption('"Nudeln" sind lecker "wirklich"', { caption: true })).toBe('"Nudeln" sind lecker "wirklich"');
  });

  it("does not split numbers: 1,5 l and 2 - 3 EL", () => {
    const r = meta("Zutaten: 1,5 l Milch, 0,5 TL Salz, 2 - 3 EL Öl, 1 – 2 Zwiebeln");
    expect(r?.ingredients).toEqual(["1,5 l Milch", "0,5 TL Salz", "2 - 3 EL Öl", "1 – 2 Zwiebeln"]);
  });

  it("treats ## Zutaten:, ### Zubereitung: and **Zutaten:** as headings without leftover lines", () => {
    const r = meta("Brot\n## Zutaten:\n500 g Mehl\n### Zubereitung:\nTeig kneten.\n**Zutaten:**\n1 Ei");
    expect(r?.ingredients).toEqual(["500 g Mehl", "1 Ei"]);
    expect(r?.steps.map((s) => s.text)).toEqual(["Teig kneten."]);
    expect(cleanCaption("## Zutaten:\n500 g Mehl", { caption: true })).toBe("Zutaten:\n500 g Mehl");
  });

  it("does not split a heading followed only by a time", () => {
    for (const t of ["Zubereitung: 20 Min.", "Preparation: 15 minutes", "Arbeitszeit 10 Min. | Zubereitung: 30 Min."])
      expect(cleanCaption(t, { caption: true })).toBe(t);
    const r = meta(
      "Pizza\nArbeitszeit 10 Min. | Zubereitung: 30 Min.\nZutaten:\n- 500 g Mehl\nZubereitung:\n1. Backen.",
    );
    expect(r?.ingredients).toEqual(["500 g Mehl"]);
    expect(r?.steps.map((s) => s.text)).toEqual(["Backen."]);
  });

  it("keeps a group title in the ingredients and ends them with a heading without a colon", () => {
    const r = meta("Zutaten\nFür den Teig:\n200 g Mehl, 100 g Butter\nZubereitung\nAlles kneten.");
    expect(r?.ingredientGroups).toEqual([{ title: "Für den Teig", ingredients: ["200 g Mehl", "100 g Butter"] }]);
    expect(r?.steps.map((s) => s.text)).toEqual(["Alles kneten."]);
    expect(meta("🛒 Zutaten\n200 g Mehl\n🍳 Zubereitung\nRühren.")?.ingredients).toEqual(["200 g Mehl"]);
  });

  it("reads a yield and three ingredients from a one-liner", () => {
    const r = meta("Für 4 Personen: 500 g Hack, 2 Zwiebeln, 1 Dose Tomaten.");
    expect(r?.result).toBe("4 Personen");
    expect(r?.ingredients).toEqual(["500 g Hack", "2 Zwiebeln", "1 Dose Tomaten"]);
  });

  it("does not take times and verbs for ingredients", () => {
    expect(cleanCaption("Dann 20 Minuten backen, 5 Minuten ruhen, 1 Ei einrühren.", { caption: true })).toBe(
      "Dann 20 Minuten backen, 5 Minuten ruhen, 1 Ei einrühren.",
    );
    expect(cleanCaption("Mehl sieben, 1 Ei, 2 Tomaten.", { caption: true })).toBe("Mehl sieben, 1 Ei, 2 Tomaten.");
  });

  it("attaches only lower case parts without an amount", () => {
    const r = meta("Zutaten: 250 g Spaghetti, 2 Eier, Parmesan, Pfeffer, 1 Zwiebel, fein gehackt");
    expect(r?.ingredients).toEqual(["250 g Spaghetti", "2 Eier", "Parmesan", "Pfeffer", "1 Zwiebel, fein gehackt"]);
  });

  it("keeps a numbered step with a time and reads Portionen as yield", () => {
    const r = recipeFromText("Brot\nZutaten\n500 g Mehl\nZubereitung\n1. Für 20 Min. ruhen lassen.");
    expect(r?.steps.map((s) => s.text)).toEqual(["Für 20 Min. ruhen lassen."]);
    expect(recipeFromText("Brot\nPortionen: 4\n500 g Mehl\nTeig kneten und backen.")?.result).toBe("4");
    expect(recipeFromText("Brot\nServings: 4\n500 g Mehl\nMix and bake the dough.")?.result).toBe("4");
    expect(
      recipeFromText("Brot\nFür 20 Min. ruhen lassen\n500 g Mehl\nTeig kneten und backen.")?.result,
    ).toBeUndefined();
  });

  it("recognizes only real requests as comment hints", () => {
    expect(captionHint("Schreibt mir in die Kommentare, wie euch das Rezept gefällt")).toBeUndefined();
    expect(captionHint("Leave a comment if you make this recipe")).toBeUndefined();
    expect(captionHint('Kommentiere "Rezept" und ich schick dir das Rezept')).toBe("captionComment");
    expect(captionHint("Kommentiere mal, dann schick ich dir das Rezept")).toBe("captionComment");
    expect(captionHint("Comment below and I'll send you the recipe")).toBe("captionComment");
  });

  it("reads a long text of spaces quickly", () => {
    const t = `Rezept${" ".repeat(50000)}#a${" ".repeat(50000)}x`;
    const start = Date.now();
    cleanCaption(t, { caption: true });
    cleanCaption(`${" ".repeat(50000)}Zutaten${" ".repeat(50000)}:`);
    expect(Date.now() - start).toBeLessThan(500);
  });
});
