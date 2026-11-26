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
    expect(cleanCaption("Zutaten: 200 g Mehl, 1 Ei Zubereitung: Alles verrühren.")).toBe(
      "Zutaten:\n200 g Mehl\n1 Ei\nZubereitung:\nAlles verrühren.",
    );
    expect(cleanCaption("3 simple steps: mix well")).toBe("3 simple steps: mix well");
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
