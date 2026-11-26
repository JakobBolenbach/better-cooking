import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { readFrontmatter, parseRecipe, insertAttempt } from "../src/parse";
import {
  formatQuantity,
  scaledResult,
  servingsText,
  readResult,
  readNumber,
  nextServing,
  scaleLine,
  ingredientName,
} from "../src/quantities";
import { findTimes, timer, ingredientsInStep } from "../src/cooking";
import { detectSource, findDuplicate, keyOf } from "../src/source";
import { normalize, RecipeSearch, splitIndex } from "../src/search";
import { setLanguage } from "../src/i18n";

beforeEach(() => setLanguage("de"));

const read = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const sourdough = parseRecipe("Recipes/Sauerteig-Bauernbrot ohne Hefe.md", read("sauerteig.md"), 1);
const rolls = parseRecipe("Recipes/Dinkel-Sonntagsbrötchen.md", read("broetchen.md"), 2);
const text = (parts: { text: string }[]) => parts.map((t) => t.text).join("");

describe("parser", () => {
  it("erkennt leeres Frontmatter", () => {
    const { fm, bodyText } = readFrontmatter("---\n---\n# Titel\n\nText\n\n---\n\nNach der Linie");
    expect(fm).toEqual({});
    expect(bodyText.startsWith("# Titel")).toBe(true);
  });

  it("reads frontmatter and sections", () => {
    expect(sourdough.title).toBe("Sauerteig-Bauernbrot ohne Hefe");
    expect(sourdough.status).toBe("ausprobieren");
    expect(sourdough.category).toBe("Brot");
    expect(sourdough.timeTotal).toBe(780);
    expect(sourdough.image).toBe("Sauerteig-Bauernbrot ohne Hefe Titelbild.webp");
    expect(sourdough.timeline).toBe("Sauerteig-Bauernbrot ohne Hefe Ablauf.svg");
    expect(sourdough.images).toEqual(["Sauerteig-Bauernbrot ohne Hefe Bild 1.webp"]);
    expect(sourdough.ingredients).toHaveLength(2);
    expect(sourdough.ingredients[0].ingredients[0]).toBe("400 g Weizenmehl Type 405");
    expect(sourdough.ingredients[1].title).toBe("Ausstattung");
    expect(sourdough.steps).toHaveLength(9);
    expect(sourdough.steps[0].title).toBe("Kneten (7 bis 10 Min.)");
    expect(sourdough.steps[0].text).toMatch(/^Beide Mehle/);
    expect(sourdough.tips.length).toBeGreaterThan(5);
    expect(sourdough.notes).toEqual([]);
    expect(sourdough.description).toMatch(/^Einfaches Weizen-Roggen-Mischbrot/);
  });
  it("reads servings from the yield", () => {
    expect(rolls.servings).toEqual({ count: 9, unit: "Brötchen" });
    expect(sourdough.servings).toEqual({ count: 1, unit: "großes Brot" });
    expect(readResult("für 4 Personen")).toEqual({ count: 4, unit: "Personen" });
    expect(readResult("Ein Blech")).toBeUndefined();
    expect(readResult("for 4 people")).toEqual({ count: 4, unit: "people" });
    expect(readResult("4")).toEqual({ count: 4, unit: "" });
  });
  it("inserts an attempt at the top", () => {
    const fresh = insertAttempt(read("broetchen.md"), {
      date: "24.11.2026",
      modified: "60 Min. Gare",
      result: "fluffig",
      rating: 4,
    });
    const r = parseRecipe("x.md", fresh);
    expect(r.attempts[0]).toEqual({
      date: "24.11.2026",
      lines: ["Geändert: 60 Min. Gare", "Ergebnis: fluffig", "Bewertung: 4/5"],
    });
    const second = parseRecipe("x.md", insertAttempt(fresh, { date: "25.11.2026" }));
    expect(second.attempts.map((v) => v.date)).toEqual(["25.11.2026", "24.11.2026"]);
    expect(fresh).toMatch(/> Neueste oben.*\n\n### 24\.11\.2026/);
  });
});

describe("quantities", () => {
  it("liest Zahlen", () => {
    expect(readNumber("½")).toBe(0.5);
    expect(readNumber("1 ½")).toBe(1.5);
    expect(readNumber("1,5")).toBe(1.5);
    expect(readNumber("3/4")).toBe(0.75);
  });
  it("formatiert sinnvoll", () => {
    expect(formatQuantity(444.4, "g")).toBe("445");
    expect(formatQuantity(13.3, "g")).toBe("13");
    expect(formatQuantity(2.66, "g")).toBe("2,5");
    expect(formatQuantity(0.75, "TL")).toBe("¾");
    expect(formatQuantity(1.5, "EL")).toBe("1 ½");
    expect(formatQuantity(2)).toBe("2");
    expect(formatQuantity(1340, "ml")).toBe("1340");
  });
  it("rounds amounts without a unit to whole or half pieces, thirds stay for spoons (issue #45)", () => {
    expect(text(scaleLine("3 Eier", 9 / 8))).toBe("3 ½ Eier");
    expect(text(scaleLine("3 Eier", 1 + 1 / 9))).toBe("3 ½ Eier");
    expect(text(scaleLine("2 Zwiebeln", 1.3))).toBe("2 ½ Zwiebeln");
    expect(text(scaleLine("1 Banane", 2.4))).toBe("2 ½ Banane");
    expect(text(scaleLine("2 onions", 1.9))).toBe("4 onions");
    expect(text(scaleLine("½ Zitrone", 1.5))).toBe("¾ Zitrone");
    expect(text(scaleLine("2 EL Öl", 1 / 3))).toBe("⅔ EL Öl");
    expect(text(scaleLine("1 EL Öl", 3.3))).toBe("3 ⅓ EL Öl");
    expect(formatQuantity(3.33)).toBe("3 ½");
    expect(formatQuantity(1.2)).toBe("1");
  });
  it("rounds metric units by their size in the base unit (#40)", () => {
    expect(formatQuantity(1.8, "l")).toBe("1,8");
    expect(formatQuantity(1.25, "l")).toBe("1,25");
    expect(formatQuantity(0.25, "l")).toBe("0,25");
    expect(formatQuantity(2.5, "kg")).toBe("2,5");
    expect(formatQuantity(1.5, "dl")).toBe("1,5");
    expect(formatQuantity(2.5, "cl")).toBe("2,5");
    expect(formatQuantity(1.8, "Liter")).toBe("1,8");
    expect(formatQuantity(0.05, "l")).toBe("0,05");
    expect(formatQuantity(0.333, "l")).toBe("0,335");
    expect(formatQuantity(1.8, "litres")).toBe("1,8");
    expect(formatQuantity(250, "mg")).toBe("250");
  });
  it("scales litre amounts without rounding to halves (#40)", () => {
    expect(text(scaleLine("1.2 l vegetable stock", 1.5))).toBe("1,8 l vegetable stock");
  });
  it("reads L, litres and grams as units (#40)", () => {
    expect(text(scaleLine("1.2 L vegetable stock", 1.5))).toBe("1,8 L vegetable stock");
    expect(text(scaleLine("500 grams flour", 2))).toBe("1000 grams flour");
    expect(ingredientName("2 litres milk")).toBe("milk");
  });
  it("scales lines and leaves flour types alone", () => {
    expect(text(scaleLine("400 g Weizenmehl Type 405", 2))).toBe("800 g Weizenmehl Type 405");
    expect(text(scaleLine("12 g Salz (10 bis 15 g nach Geschmack)", 2))).toBe("24 g Salz (20 bis 30 g nach Geschmack)");
    expect(text(scaleLine("½ TL Zucker", 3))).toBe("1 ½ TL Zucker");
    expect(text(scaleLine("2 Eier", 1.5))).toBe("3 Eier");
    expect(text(scaleLine("340 ml Wasser, lauwarm (grobe Angabe, ggf. 10 bis 20 ml mehr)", 0.5))).toBe(
      "170 ml Wasser, lauwarm (grobe Angabe, ggf. 5 bis 10 ml mehr)",
    );
    expect(text(scaleLine("Dutch Oven mit Deckel", 2))).toBe("Dutch Oven mit Deckel");
    expect(scaleLine("400 g Mehl", 1)[0]).toEqual({ text: "400 g", quantity: true });
    // Sizes inside the line stay, lengths at the start (piece of ginger) are converted.
    expect(text(scaleLine("Springform (26 cm), gefettet", 2))).toBe("Springform (26 cm), gefettet");
    expect(text(scaleLine("2 cm Ingwer", 2))).toBe("4 cm Ingwer");
  });
  it("the result text follows the servings (issue #45)", () => {
    const text = (r: string, f: number) => scaledResult(r, readResult(r), f);
    expect(text("4 servings", 2)).toBe("8 servings");
    expect(text("9 Brötchen", 0.5)).toBe("4 ½ Brötchen");
    expect(text("9 Brötchen", 1)).toBe("9 Brötchen");
    expect(text("für 4 Personen", 1.5)).toBe("6 Personen");
    expect(text("Ein Blech voll", 2)).toBe("Ein Blech voll");
    expect(text("Ergibt ca. 12 Stück", 1.5)).toBe("Ergibt ca. 18 Stück");
    expect(text("4-6 servings", 2)).toBe("8 bis 12 servings");
    setLanguage("en");
    expect(text("4 bis 6 Portionen", 2)).toBe("8 to 12 Portionen");
    setLanguage("de");
  });
  it("reads ranges and prefixes in the yield (issue #45)", () => {
    expect(readResult("4-6 servings")).toEqual({ count: 4, countTo: 6, unit: "servings" });
    expect(readResult("4–6 Portionen")).toEqual({ count: 4, countTo: 6, unit: "Portionen" });
    expect(readResult("4 bis 6 Portionen")).toEqual({ count: 4, countTo: 6, unit: "Portionen" });
    expect(readResult("Ergibt ca. 12 Stück")).toEqual({ count: 12, unit: "Stück", prefix: "Ergibt ca. " });
    expect(readResult("Teig für 4 Personen")).toEqual({ count: 4, unit: "Personen", prefix: "Teig für " });
    expect(readResult("4 Torten")).toEqual({ count: 4, unit: "Torten" });
  });
  it("shows servings the same way everywhere (issue #45)", () => {
    expect(servingsText({ count: 4, unit: "servings" }, 2)).toBe("8 servings");
    expect(servingsText({ count: 9, unit: "" }, 1.5)).toBe("13 ½ Portionen");
    expect(servingsText({ count: 4, unit: "Portionen", countTo: 6 }, 1.5)).toBe("6 bis 9 Portionen");
  });
  it("counted units round to whole or half pieces like amounts without a unit (issue #45)", () => {
    expect(text(scaleLine("3 Zehen Knoblauch", 1.1))).toBe("3 ½ Zehen Knoblauch");
    expect(text(scaleLine("1 Dose Tomaten", 2.4))).toBe("2 ½ Dosen Tomaten");
    expect(text(scaleLine("2 cloves garlic", 1.2))).toBe("2 ½ cloves garlic");
    expect(text(scaleLine("1 Stück Ingwer", 3.3))).toBe("3 ½ Stück Ingwer");
    expect(text(scaleLine("1 Zehe Knoblauch", 1 / 3))).toBe("⅓ Zehe Knoblauch");
    expect(text(scaleLine("1 EL Öl", 3.3))).toBe("3 ⅓ EL Öl");
    expect(text(scaleLine("1 cup flour", 1.3))).toBe("1 ⅓ cups flour");
  });
  it("servings steps and ingredient names", () => {
    expect(nextServing(9, 1, 9)).toBe(10);
    expect(nextServing(1, -1, 1)).toBe(0.5);
    expect(nextServing(0.5, -1, 1)).toBe(0.5);
    expect(ingredientName("400 g Weizenmehl Type 405")).toBe("Weizenmehl Type 405");
    expect(ingredientName("340 ml Wasser, lauwarm (grobe Angabe)")).toBe("Wasser");
    expect(ingredientName("½ TL Zucker")).toBe("Zucker");
  });
});

describe("ingredients in a step by head word (issue #45)", () => {
  const groups = (...lines: string[]) => [{ ingredients: lines }];
  const used = (step: string, ...lines: string[]) =>
    ingredientsInStep(step, groups(...lines)).map((h) => lines[h.index]);
  it("finds the ingredient by the last word of its name", () => {
    const lines = ["1 onion", "2 carrots", "2 tbsp olive oil", "100 g unsalted butter", "1 tsp salt"];
    expect(used("Cook onion and carrots in the oil", ...lines)).toEqual(["1 onion", "2 carrots", "2 tbsp olive oil"]);
    expect(used("Cook the onion in the oils", ...lines)).toEqual(["1 onion", "2 tbsp olive oil"]);
    expect(used("Fry two eggs", "2 eggs", "1 egg yolk")).toEqual(["2 eggs"]);
  });
  it("finds German compounds by their ending", () => {
    expect(used("Zwiebeln im Öl anbraten", "2 Zwiebeln", "3 EL Olivenöl", "1 Prise Salz")).toEqual([
      "2 Zwiebeln",
      "3 EL Olivenöl",
    ]);
    expect(used("Mit Salz würzen", "1 TL Meersalz", "2 EL Öl")).toEqual(["1 TL Meersalz"]);
  });
  it("finds equal and compound words in both directions (issue #45)", () => {
    expect(used("Öl erhitzen", "2 EL Öl", "1 Zwiebel")).toEqual(["2 EL Öl"]);
    expect(used("Ei unterrühren", "1 Ei", "100 g Mehl")).toEqual(["1 Ei"]);
    expect(used("Die Eier trennen", "3 Eier", "1 Prise Salz")).toEqual(["3 Eier"]);
    expect(used("Mit Vanilleeis servieren", "2 Kugeln Eis")).toEqual(["2 Kugeln Eis"]);
    expect(used("Reis kochen", "200 g Reis", "1 Kugel Eis")).toEqual(["200 g Reis"]);
    expect(used("Kürbis würfeln", "1 Kürbis", "Mus")).toEqual(["1 Kürbis"]);
    expect(used("Mais abtropfen", "1 Dose Mais", "1 Prise Anis")).toEqual(["1 Dose Mais"]);
    expect(used("Zwiebeln in Öl braten", "2 Zwiebeln", "3 EL Olivenöl")).toEqual(["2 Zwiebeln", "3 EL Olivenöl"]);
  });
  it("avoids wrong hits", () => {
    // "salt" is not the head of "unsalted butter"; "brown" and "mix" are stop words
    expect(used("Add the salt", "100 g unsalted butter")).toEqual([]);
    expect(used("Mix and brown well", "1 tbsp baking mix", "1 cup brown sugar")).toEqual([]);
    // "Eis" must not hit "Reis"; words under 3 letters are ignored, except "Öl"
    expect(used("Mit Eis servieren", "200 g Reis")).toEqual([]);
    expect(used("Bei 180 Grad im Ofen", "2 EL Olivenöl", "1 Ei")).toEqual([]);
    expect(used("Den Boden einölen", "2 EL Öl")).toEqual([]);
    // oil in a step about boiling or foil
    expect(used("Boil the pasta and cover with foil", "2 tbsp olive oil")).toEqual([]);
  });
});

describe("cooking", () => {
  it("findet Zeiten", () => {
    const z = findTimes("Abgedeckt 5 bis 6 Std. gehen lassen, dann 10 Min. backen und ca. 20 Minuten ruhen.");
    expect(z.map((x) => [x.seconds, x.untilSeconds])).toEqual([
      [18000, 21600],
      [600, undefined],
      [1200, undefined],
    ]);
    expect(findTimes("Type 405 Mehl")).toEqual([]);
    expect(timer(3909)).toBe("1:05:09");
    expect(timer(247)).toBe("4:07");
  });
  it("detects ingredients in a step", () => {
    const s = sourdough.steps[0].text;
    const hits = ingredientsInStep(s, sourdough.ingredients)
      .filter((t) => t.group === 0)
      .map((t) => t.index);
    expect(hits).toEqual([0, 1, 2, 3, 4]);
    const b = ingredientsInStep(rolls.steps[0].text, rolls.ingredients).map((t) => t.index);
    expect(b).toEqual([0, 1, 2, 3]);
  });
});

describe("source", () => {
  it("detects platforms and normalizes", () => {
    const ig = detectSource("https://www.instagram.com/reel/BcExample01/?bqrl=MXBudGYzYmFqNWNwZg==");
    expect(ig.kind).toBe("instagram");
    expect(ig.key).toBe("instagram:BcExample01");
    expect(detectSource("https://www.instagram.com/p/BcExample01/").key).toBe("instagram:BcExample01");
    const web = detectSource("https://example.org/rezepte/sauerteig-bauernbrot.html#ref=412115");
    expect(web.kind).toBe("webseite");
    expect(web.url).toBe("https://example.org/rezepte/sauerteig-bauernbrot.html");
    expect(detectSource("https://youtu.be/abc123?si=x").key).toBe("youtube:abc123");
    expect(detectSource("https://www.youtube.com/watch?v=abc123&t=10").key).toBe("youtube:abc123");
    expect(detectSource("500 g Mehl\n300 ml Wasser").kind).toBe("text");
    expect(detectSource("  ").kind).toBe("leer");
    expect(detectSource("chefkoch.de/rezepte/123/brot.html?utm_source=x").key).toBe(
      "chefkoch.de/rezepte/123/brot.html",
    );
  });
  it("findet Dubletten", () => {
    const all = [sourdough, rolls];
    expect(findDuplicate(detectSource("https://instagram.com/reel/BcExample01"), all)?.name).toBe(
      "Dinkel-Sonntagsbrötchen",
    );
    expect(
      findDuplicate(detectSource("https://example.org/rezepte/sauerteig-bauernbrot.html?utm_source=ig"), all)?.name,
    ).toBe("Sauerteig-Bauernbrot ohne Hefe");
    expect(findDuplicate(detectSource("https://example.org/anderes"), all)).toBeUndefined();
    expect(keyOf("kein link")).toBeUndefined();
  });
});

describe("search", () => {
  const s = new RecipeSearch();
  s.reconcile([sourdough, rolls]);
  const names = (q: string) => s.search(q).map((t) => t.path.split("/").pop()!.replace(".md", ""));
  it("normalisiert deutsch", () => {
    expect(normalize("Brötchen Größe")).toBe("brotchen grosse");
    expect(normalize("Broetchen")).toBe("brotchen");
    expect(splitIndex("Dinkelmehl")).toContain("mehl");
  });
  it("finds by title, partial words, typos and several words", () => {
    expect(names("brötchen")[0]).toBe("Dinkel-Sonntagsbrötchen");
    expect(names("broetchen")[0]).toBe("Dinkel-Sonntagsbrötchen");
    expect(names("sauerteg")[0]).toBe("Sauerteig-Bauernbrot ohne Hefe");
    expect(names("roggen")).toEqual(["Sauerteig-Bauernbrot ohne Hefe"]);
    expect(names("mehl").sort()).toEqual(["Dinkel-Sonntagsbrötchen", "Sauerteig-Bauernbrot ohne Hefe"]);
    expect(names("dinkel olivenöl")).toEqual(["Dinkel-Sonntagsbrötchen"]);
    expect(names("dutch")).toEqual(["Sauerteig-Bauernbrot ohne Hefe"]);
    expect(s.search("roggen")[0].fields).toContain("ingredients");
  });
  it("falls back to OR and keeps the index current", () => {
    const t = s.search("roggen olivenöl");
    expect(t.length).toBe(2);
    expect(t[0].approximate).toBe(true);
    s.reconcile([rolls]);
    expect(names("roggen")).toEqual([]);
    s.reconcile([sourdough, rolls]);
    expect(names("roggen")).toEqual(["Sauerteig-Bauernbrot ohne Hefe"]);
  });
});

describe("English section names", () => {
  const english = `---
status: bewaehrt
---
# Tomato soup

![[Tomato soup cover.webp]]

A quick soup for two. Self-written example.

**Yield:** 2 bowls · **Active:** 10 min

Source: [example.org](https://example.org/soup)

## Timeline
![[Tomato soup timeline.svg]]

## Ingredients
- 500 g tomatoes
- 1 onion

**Equipment**
- Blender

## Instructions
1. **Sweat (5 min):** Cook the onion gently.
2. Add tomatoes and simmer.

## Tips
- Add basil.

## Images
![[Tomato soup photo.webp]]

## Attempts
### 01.11.2026
- Result: good

## Notes
- Freezes well.
`;
  const r = parseRecipe("Recipes/Tomato soup.md", english, 1);

  it("liest alle Abschnitte", () => {
    expect(r.description).toBe("A quick soup for two. Self-written example.");
    expect(r.timeline).toBe("Tomato soup timeline.svg");
    expect(r.ingredients).toEqual([
      { ingredients: ["500 g tomatoes", "1 onion"] },
      { title: "Equipment", ingredients: ["Blender"] },
    ]);
    expect(r.steps).toEqual([
      { title: "Sweat (5 min)", text: "Cook the onion gently." },
      { text: "Add tomatoes and simmer." },
    ]);
    expect(r.tips).toEqual(["Add basil."]);
    expect(r.images).toEqual(["Tomato soup photo.webp"]);
    expect(r.attempts).toEqual([{ date: "01.11.2026", lines: ["Result: good"] }]);
    expect(r.notes).toEqual(["Freezes well."]);
  });

  it("inserts attempts under ## Attempts", () => {
    const fresh = insertAttempt(english, { date: "25.11.2026", result: "even better" });
    expect(fresh).not.toMatch(/## Versuche/);
    expect(parseRecipe("Recipes/Tomato soup.md", fresh, 1).attempts[0].date).toBe("25.11.2026");
  });
});
