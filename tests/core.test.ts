import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readFrontmatter, parseRecipe, insertAttempt } from "../src/parse";
import { formatQuantity, readResult, readNumber, nextServing, scaleLine, ingredientName } from "../src/quantities";
import { findTimes, timer, ingredientsInStep } from "../src/cooking";
import { detectSource, findDuplicate, keyOf } from "../src/source";
import { normalize, RecipeSearch, splitIndex } from "../src/search";

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
  it("servings steps and ingredient names", () => {
    expect(nextServing(9, 1, 9)).toBe(10);
    expect(nextServing(1, -1, 1)).toBe(0.5);
    expect(nextServing(0.5, -1, 1)).toBe(0.5);
    expect(ingredientName("400 g Weizenmehl Type 405")).toBe("Weizenmehl Type 405");
    expect(ingredientName("340 ml Wasser, lauwarm (grobe Angabe)")).toBe("Wasser");
    expect(ingredientName("½ TL Zucker")).toBe("Zucker");
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
    expect(s.search("roggen")[0].fields).toContain("zutaten");
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
