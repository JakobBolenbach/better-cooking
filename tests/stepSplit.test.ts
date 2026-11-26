import { describe, expect, it } from "vitest";
import { cookingSteps, splitInstruction, MAX_STEPS } from "../src/stepSplit";
import { splitEnumeration, splitSentences } from "../src/sentences";
import { titleFor } from "../src/stepTitle";
import { findRecipeJsonLd, recipeFromSchema } from "../src/schemaorg";
import { recipeFromText } from "../src/textRecipe";
import { recipeNote } from "../src/recipeNote";
import { parseRecipe } from "../src/parse";
import { INSTRUCTIONS, recipeFromAnswer } from "../src/ai";

const texts = (t: string) => splitInstruction(t).map((s) => s.text);

describe("splitSentences", () => {
  it("does not break at abbreviations, decimals and ordinals", () => {
    expect(splitSentences("Ca. 20 Min. backen, z. B. bis er goldbraun ist. Dann 1,5 EL Öl zugeben.")).toEqual([
      "Ca. 20 Min. backen, z. B. bis er goldbraun ist.",
      "Dann 1,5 EL Öl zugeben.",
    ]);
    expect(splitSentences("Am 3. Tag Mehl zugeben. Mit 2 EL. Wasser verrühren.")).toEqual([
      "Am 3. Tag Mehl zugeben.",
      "Mit 2 EL. Wasser verrühren.",
    ]);
    expect(splitSentences("Bake at 350 F. Cool, e.g. on a rack. Serve!")).toEqual([
      "Bake at 350 F.",
      "Cool, e.g. on a rack.",
      "Serve!",
    ]);
  });

  it("ends a sentence after a duration when a new one clearly starts", () => {
    expect(splitSentences("20 Min. kneten. Danach 10 Min. Ruhe. Dann formen.")).toEqual([
      "20 Min. kneten.",
      "Danach 10 Min. Ruhe.",
      "Dann formen.",
    ]);
    expect(splitSentences("Backen, 25 Min. Dann abkühlen.")).toEqual(["Backen, 25 Min.", "Dann abkühlen."]);
  });
});

describe("splitInstruction", () => {
  it("splits running text from a recipe site into one action per step", () => {
    const steps = splitInstruction(
      "Eier trennen. Eiweiß und Zucker steif schlagen. Eigelb mit Milch und Wasser verrühren. " +
        "Mehl mit Backpulver mischen und unter das Eigelb-/Milch-/Wassergemisch rühren. Eischnee unterheben.",
    );
    expect(steps).toEqual([
      { title: "Trennen", text: "Eier trennen." },
      { title: "Steif schlagen", text: "Eiweiß und Zucker steif schlagen." },
      { title: "Verrühren", text: "Eigelb mit Milch und Wasser verrühren." },
      { title: "Mischen", text: "Mehl mit Backpulver mischen und unter das Eigelb-/Milch-/Wassergemisch rühren." },
      { title: "Unterheben", text: "Eischnee unterheben." },
    ]);
  });

  it("makes waiting times their own step and takes the duration into the title", () => {
    expect(
      splitInstruction("Den Teig 10 Min. kneten, bis er sich vom Rand löst. Zugedeckt 30 Minuten gehen lassen."),
    ).toEqual([
      { title: "Kneten (10 Min.)", text: "Den Teig 10 Min. kneten, bis er sich vom Rand löst." },
      { title: "Gehen lassen (30 Minuten)", text: "Zugedeckt 30 Minuten gehen lassen." },
    ]);
    expect(
      texts("Zwiebeln würfeln und in Öl glasig dünsten, dann Tomaten zugeben und 20 Min. köcheln lassen."),
    ).toEqual(["Zwiebeln würfeln und in Öl glasig dünsten.", "Tomaten zugeben.", "20 Min. köcheln lassen."]);
    expect(splitInstruction("Teig 2,5 Std. kalt stellen.")[0].title).toBe("Kalt stellen (2,5 Std.)");
  });

  it("splits at 'dann' and 'anschließend' and drops the linking word", () => {
    expect(texts("Zuerst den Ofen vorheizen. Anschließend die Form einfetten, dann den Teig einfüllen.")).toEqual([
      "Den Ofen vorheizen.",
      "Die Form einfetten.",
      "Den Teig einfüllen.",
    ]);
  });

  it("splits two actions joined by 'und' only when the second has its own object", () => {
    expect(texts("Den Ofen auf 200 °C vorheizen und den Teig ca. 25 Min. backen.")).toEqual([
      "Den Ofen auf 200 °C vorheizen.",
      "Den Teig ca. 25 Min. backen.",
    ]);
    expect(texts("Mehl mit Backpulver mischen und unter die Eier rühren.")).toHaveLength(1);
    expect(texts("Zwiebeln würfeln und in Öl glasig dünsten.")).toHaveLength(1);
  });

  it("keeps short follow-ups with the previous action", () => {
    expect(texts("Das Mehl einrühren. Gut umrühren. Dabei ständig rühren. Fertig.")).toEqual([
      "Das Mehl einrühren. Gut umrühren. Dabei ständig rühren.",
      "Fertig.",
    ]);
    expect(texts("Im Ofen backen. 25 Minuten.")).toEqual(["Im Ofen backen. 25 Minuten."]);
    expect(splitInstruction("Preheat the oven. Mix well. Enjoy!").map((s) => s.text)).toEqual([
      "Preheat the oven.",
      "Mix well. Enjoy!",
    ]);
  });

  it("splits an enumeration only when it starts the text or follows a colon and each number follows a sentence", () => {
    expect(texts("1) Wasser erhitzen. 2) Nudeln 8 Min. kochen. 3) Abgießen.")).toEqual([
      "Wasser erhitzen.",
      "Nudeln 8 Min. kochen.",
      "Abgießen.",
    ]);
    expect(splitEnumeration("So geht's: 1. Wasser erhitzen. 2. Nudeln kochen.")).toEqual([
      "So geht's:",
      "Wasser erhitzen.",
      "Nudeln kochen.",
    ]);
    // no enumeration: ordinals in running text, "Stufe 1", numbers that do not count on
    expect(splitEnumeration("Am 1. Tag Mehl zugeben. Am 2. Tag Wasser zugeben.")).toBeUndefined();
    expect(splitEnumeration("Auf Stufe 1. Rühren. Auf Stufe 2. Schlagen.")).toBeUndefined();
    expect(splitEnumeration("1. Wasser erhitzen. 3. Nudeln kochen.")).toBeUndefined();
    expect(texts("Am 1. Tag Mehl zugeben. Am 2. Tag Wasser zugeben.")).toHaveLength(2);
  });

  it("reads English instructions", () => {
    const steps = splitInstruction(
      "Preheat the oven to 180C. Mix the flour and sugar in a large bowl. Add the eggs and stir until well beaten. " +
        "Let the dough rest for 30 minutes. Bake for 25-30 minutes until golden.",
    );
    expect(steps.map((s) => s.title)).toEqual(["Preheat", "Mix", "Add", "Rest (30 minutes)", "Bake (25-30 minutes)"]);
    expect(steps).toHaveLength(5);
  });

  it("does not split what is already one short action", () => {
    expect(splitInstruction("Backen bei 180 °C.")).toEqual([{ text: "Backen bei 180 °C." }]);
    expect(splitInstruction("Dünn ausbacken, je Seite etwa 1 Minute.")).toEqual([
      { title: "Ausbacken (1 Minute)", text: "Dünn ausbacken, je Seite etwa 1 Minute." },
    ]);
  });

  it("leaves out the title when unsure", () => {
    expect(titleFor("Alles gut vermischt.", false)).toBeUndefined();
    expect(titleFor("Wenn der Teig aufgegangen ist.", false)).toBeUndefined();
    expect(titleFor("Der Teig ist aufgegangen.", false)).toBeUndefined();
    expect(titleFor("Die Eier sind gekocht und geschält worden", false)).toBeUndefined();
    expect(titleFor("Abschmecken mit Salz und Essig.", false)).toBeUndefined();
    expect(titleFor("The dough should be beaten", true)).toBeUndefined();
    expect(titleFor("Wenn die Masse kocht, vom Herd nehmen.", false)).toBeUndefined();
  });

  it("names no duration when the text has several", () => {
    expect(splitInstruction("Nach 5 Min. die Hitze reduzieren und weitere 10 Min. kochen.")[0].title).toBe(
      "Reduzieren",
    );
  });
});

describe("cookingSteps", () => {
  it("keeps own titles and adds a missing duration only where it clearly belongs", () => {
    expect(
      cookingSteps([
        { title: "Kneten", text: "Teig glatt kneten, etwa 10 Minuten." },
        { title: "Backen (45 Min.)", text: "Bei 200 °C backen." },
        { title: "Teig", text: "Mehl und Wasser rühren und 20 Min. ruhen lassen." },
        { title: "Kochen", text: "Alles 40 Minuten köcheln lassen." },
      ]).steps,
    ).toEqual([
      { title: "Kneten (10 Minuten)", text: "Teig glatt kneten, etwa 10 Minuten." },
      { title: "Backen (45 Min.)", text: "Bei 200 °C backen." },
      { title: "Teig", text: "Mehl und Wasser rühren und 20 Min. ruhen lassen." },
      { title: "Kochen (40 Minuten)", text: "Alles 40 Minuten köcheln lassen." },
    ]);
  });

  it("puts section names in front of titles only with several meaningful sections", () => {
    const steps = [
      { section: "Füllung", text: "Äpfel schälen. Äpfel in Stücke schneiden. Gut verrühren." },
      { section: "Teig", text: "Mehl abwiegen." },
    ];
    expect(cookingSteps(steps).steps).toEqual([
      { title: "Füllung – Schälen", text: "Äpfel schälen." },
      { title: "Füllung – Schneiden", text: "Äpfel in Stücke schneiden. Gut verrühren." },
      { title: "Teig – Abwiegen", text: "Mehl abwiegen." },
    ]);
    // one section, or a name that only says "the instructions": no prefix
    expect(cookingSteps([{ section: "Füllung", text: "Äpfel schälen." }]).steps).toEqual([
      { title: "Schälen", text: "Äpfel schälen." },
    ]);
    expect(
      cookingSteps([
        { section: "Zubereitung", text: "Äpfel schälen." },
        { section: "Teig", text: "Mehl sieben." },
      ]).steps[0].title,
    ).toBe("Schälen");
  });

  it("limits the number of steps and says so", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ text: `Zutat ${i} unterheben.` }));
    const r = cookingSteps(many);
    expect(r.steps).toHaveLength(MAX_STEPS);
    expect(r.cut).toBe(true);
    expect(cookingSteps(many.slice(0, 5)).cut).toBe(false);
  });
});

describe("imports in the cooking form", () => {
  it("turns schema.org instructions with sections and a long text into steps", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Recipe",
      name: "Biskuit",
      recipeIngredient: ["4 Eier", "100 g Zucker"],
      recipeInstructions: [
        {
          "@type": "HowToSection",
          name: "Teig",
          itemListElement: [{ "@type": "HowToStep", text: "Eier trennen. Eiweiß steif schlagen." }],
        },
        { "@type": "HowToStep", name: "Backen", text: "Bei 180 °C etwa 25 Minuten backen." },
      ],
    })}</script>`;
    const r = recipeFromSchema(findRecipeJsonLd(html)!, "https://example.org/biskuit");
    expect(r.steps).toEqual([
      { title: "Trennen", text: "Eier trennen." },
      { title: "Steif schlagen", text: "Eiweiß steif schlagen." },
      { title: "Backen (25 Minuten)", text: "Bei 180 °C etwa 25 Minuten backen." },
    ]);
    const read = parseRecipe(
      "Recipes/Biskuit.md",
      recipeNote(r, { source: "https://example.org/biskuit", today: "2026-11-26" }),
    );
    expect(read.steps.map((s) => s.title)).toEqual(["Trennen", "Steif schlagen", "Backen (25 Minuten)"]);
  });

  it("groups ingredients of a pasted text and splits its steps", () => {
    const r = recipeFromText(
      [
        "Hefezopf",
        "Zutaten:",
        "Für den Teig:",
        "500 g Mehl",
        "1 Würfel Hefe",
        "Für die Glasur:",
        "2 EL Milch",
        "Ausstattung:",
        "Backblech",
        "Zubereitung:",
        "Mehl und Hefe mischen. Den Teig 10 Min. kneten, dann 45 Minuten gehen lassen.",
      ].join("\n"),
    )!;
    expect(r.ingredientGroups).toEqual([
      { title: "Für den Teig", ingredients: ["500 g Mehl", "1 Würfel Hefe"] },
      { title: "Für die Glasur", ingredients: ["2 EL Milch"] },
      { title: "Ausstattung", ingredients: ["Backblech"] },
    ]);
    expect(r.ingredients).toHaveLength(4);
    expect(r.steps.map((s) => s.title)).toEqual(["Mischen", "Kneten (10 Min.)", "Gehen lassen (45 Minuten)"]);
    const read = parseRecipe("Recipes/Hefezopf.md", recipeNote(r, { today: "2026-11-26" }));
    expect(read.ingredients.map((g) => g.title)).toEqual(["Für den Teig", "Für die Glasur", "Ausstattung"]);
  });
});

describe("answer of the own AI", () => {
  it("asks for the cooking form and accepts it", () => {
    expect(INSTRUCTIONS).toMatch(/one step = one action or one waiting time/);
    expect(INSTRUCTIONS).toMatch(/Kneten \(10 Min\.\)/);
    const r = recipeFromAnswer(
      JSON.stringify({
        name: "Brot",
        ingredientGroups: [
          { name: "Teig", items: ["500 g Mehl", "10 g Salz"] },
          { name: "Ausstattung", items: ["Gusseisentopf"] },
        ],
        recipeInstructions: [
          { "@type": "HowToStep", name: "Kneten (10 Min.)", text: "Teig glatt kneten, bis er sich vom Rand löst." },
          { "@type": "HowToStep", name: "Gehen lassen (45 Min.)", text: "Zugedeckt 45 Minuten gehen lassen." },
        ],
      }),
    );
    if ("error" in r) throw new Error(r.error);
    expect(r.recipe.ingredients).toEqual(["500 g Mehl", "10 g Salz", "Gusseisentopf"]);
    expect(r.recipe.ingredientGroups?.map((g) => g.title)).toEqual(["Teig", "Ausstattung"]);
    expect(r.recipe.steps).toEqual([
      { title: "Kneten (10 Min.)", text: "Teig glatt kneten, bis er sich vom Rand löst." },
      { title: "Gehen lassen (45 Min.)", text: "Zugedeckt 45 Minuten gehen lassen." },
    ]);
  });
});
