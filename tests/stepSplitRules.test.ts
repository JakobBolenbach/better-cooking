// Edge cases of the step rules (issue #62): what must NOT be split, which time belongs to which clause, limits.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { splitInstruction } from "../src/stepSplit";
import { splitSentences } from "../src/sentences";
import { titleFor } from "../src/stepTitle";
import { ingredientsInStep } from "../src/cooking";
import { recipeFromSchema } from "../src/schemaorg";
import { recipeFromText } from "../src/textRecipe";
import { recipeNote } from "../src/recipeNote";
import { parseRecipe } from "../src/parse";
import { recipeFromAnswer } from "../src/ai";

const texts = (t: string) => splitInstruction(t).map((s) => s.text);

describe("'dann' splits only where it starts a new action", () => {
  it("not inside a clause, not after 'erst', not after the start of a subordinate clause", () => {
    expect(texts("Den Teig dann dünn ausrollen.")).toHaveLength(1);
    expect(texts("Das Mehl erst dann zugeben, wenn die Butter geschmolzen ist.")).toHaveLength(1);
    expect(texts("Wenn der Teig klebt, dann etwas Mehl einarbeiten.")).toHaveLength(1);
    expect(texts("If the dough is sticky, then add a little flour.")).toHaveLength(1);
    expect(texts("Nur dann abgießen, wenn die Nudeln weich sind.")).toHaveLength(1);
  });
  it("after a comma, a semicolon or 'und', when a verb comes before", () => {
    expect(texts("Mehl sieben, dann Eier unterrühren.")).toEqual(["Mehl sieben.", "Eier unterrühren."]);
    expect(texts("Mehl sieben und dann Eier unterrühren.")).toEqual(["Mehl sieben.", "Eier unterrühren."]);
    expect(texts("Stir the sauce; then add the cream.")).toEqual(["Stir the sauce.", "Add the cream."]);
  });
});

describe("a duration belongs to its own clause", () => {
  it("waiting clause without a time gets no time from another clause", () => {
    const steps = splitInstruction("10 Min. kneten und ruhen lassen.");
    expect(steps).toEqual([
      { title: "Kneten (10 Min.)", text: "10 Min. kneten." },
      { title: "Ruhen lassen", text: "Ruhen lassen." },
    ]);
  });
  it("lists of clauses", () => {
    expect(splitInstruction("8 Min. kochen, abgießen und abtropfen lassen.")).toEqual([
      { title: "Kochen (8 Min.)", text: "8 Min. kochen, abgießen." },
      { title: "Abtropfen lassen", text: "Abtropfen lassen." },
    ]);
  });
  it("tries every 'und' from the right", () => {
    expect(splitInstruction("Mehl und Zucker mischen und 30 Min. ruhen lassen.")).toEqual([
      { title: "Mischen", text: "Mehl und Zucker mischen." },
      { title: "Ruhen lassen (30 Min.)", text: "30 Min. ruhen lassen." },
    ]);
    expect(texts("Eier trennen und den Zucker schlagen und die Butter schmelzen.")).toHaveLength(3);
  });
  it("'stehen lassen' is waiting, and so is the du form", () => {
    expect(splitInstruction("Über Nacht stehen lassen.")[0].title).toBe("Stehen lassen");
    expect(splitInstruction("Lass den Teig 20 Min. ruhen.")[0].title).toBe("Ruhen lassen (20 Min.)");
  });
});

describe("sentence ends after a duration", () => {
  it("English: a capital letter; German: only words that are no nouns", () => {
    expect(splitSentences("Bake 20 min. Cool on a rack.", true)).toEqual(["Bake 20 min.", "Cool on a rack."]);
    expect(splitSentences("Backen, 20 Min. Danach abkühlen.", false)).toEqual(["Backen, 20 Min.", "Danach abkühlen."]);
    expect(splitSentences("Backen, 20 Min. Die Form drehen.", false)).toEqual(["Backen, 20 Min.", "Die Form drehen."]);
    expect(splitSentences("Nudeln 10 Min. Wasser kochen.", false)).toHaveLength(1);
  });
});

describe("titles", () => {
  it("none from auxiliary verbs, some manner words, the du form", () => {
    expect(titleFor("Tomaten in die Form geben.", false)).toBeUndefined();
    expect(titleFor("Den Topf auf den Herd stellen.", false)).toBeUndefined();
    expect(titleFor("Put the lid on the pot.", true)).toBeUndefined();
    expect(titleFor("Butter und Zucker schaumig schlagen.", false)).toBe("Schaumig schlagen");
    expect(titleFor("Rühre die Eier mit dem Zucker glatt.", false)).toBe("Rühren");
    expect(titleFor("Heize den Ofen auf 180 Grad vor.", false)).toBe("Vorheizen");
    expect(titleFor("Gieße das Wasser ab.", false)).toBe("Abgießen");
    expect(titleFor("Gib die Eier in die Schüssel.", false)).toBeUndefined();
  });
  it("follow-ups: meanwhile and serve are new actions, long 'dabei' sentences too", () => {
    expect(texts("Nudeln kochen. Meanwhile prepare the sauce.")).toHaveLength(2);
    expect(texts("Reis garen. Serve with lemon.")).toHaveLength(2);
    expect(
      texts("Reis garen. Dabei muss man die ganze Zeit aufpassen, dass nichts anbrennt, weil der Boden dünn ist."),
    ).toHaveLength(2);
    expect(texts("Reis garen. Dabei ständig rühren.")).toHaveLength(1);
    expect(texts("Stir the rice. While stirring constantly.")).toHaveLength(1);
  });
});

describe("limits and run time", () => {
  it("a very long text is cut before splitting and the note is marked partial", () => {
    const long = "Eier trennen. ".repeat(2000);
    const t0 = Date.now();
    const r = recipeFromSchema(
      {
        "@type": "Recipe",
        name: "Lang",
        recipeIngredient: Array.from({ length: 300 }, (_, i) => `${i + 1} g Zutat`),
        recipeInstructions: long,
      },
      "https://example.org",
    );
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(r.ingredients).toHaveLength(150);
    expect(r.steps.length).toBeLessThanOrEqual(80);
    expect(r.truncated).toEqual(["ingredients", "steps"]);
    const note = recipeNote(r, { today: "2026-11-26" });
    expect(parseRecipe("x.md", note).importState).toBe("teilweise");
    expect(note).toContain("Zu lang, gekürzt: Zutaten, Schritte.");
  });
  it("a text without full stops stays fast", () => {
    const t0 = Date.now();
    splitInstruction(`${"Mehl und Zucker mischen und den Teig kneten, dann ".repeat(300)}fertig.`);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
  it("ingredient groups of an AI answer share the total limit", () => {
    const answer = JSON.stringify({
      name: "Groß",
      ingredientGroups: [
        { name: "A", items: Array.from({ length: 100 }, (_, i) => `${i} g a`) },
        { name: "B", items: Array.from({ length: 100 }, (_, i) => `${i} g b`) },
      ],
      recipeInstructions: [{ text: "Alles mischen." }],
    });
    const r = recipeFromAnswer(answer);
    if ("error" in r) throw new Error(r.error);
    expect(r.recipe.ingredients).toHaveLength(150);
    expect(r.recipe.ingredientGroups?.flatMap((g) => g.ingredients)).toHaveLength(150);
    expect(r.recipe.truncated).toEqual(["ingredients"]);
  });
  it("pasted text marks cut parts too", () => {
    const lines = [
      "Riesig",
      "Zutaten:",
      ...Array.from({ length: 160 }, (_, i) => `${i + 1} g Zutat`),
      "Zubereitung:",
      "Mischen.",
    ];
    expect(recipeFromText(lines.join("\n"))?.truncated).toEqual(["ingredients"]);
  });
});

describe("notes", () => {
  it("shows no backslash in titles that start with a number or a dash", () => {
    const r = recipeFromSchema(
      {
        "@type": "Recipe",
        name: "X",
        recipeIngredient: ["1 Ei"],
        recipeInstructions: [{ "@type": "HowToStep", name: "1. Gang", text: "Eier trennen." }],
      },
      "https://example.org",
    );
    const note = recipeNote(r, { today: "2026-11-26" });
    expect(note).not.toMatch(/\*\*\\/);
    expect(note).toContain("1. **1. Gang:** Eier trennen.");
  });

  it("the example fixture is what the rules produce (golden)", () => {
    const r = recipeFromSchema(
      {
        "@type": "Recipe",
        name: "Einfacher Biskuitboden",
        description: "Luftiger Boden für Torten, selbst geschriebenes Beispiel.",
        recipeYield: "1 Springform",
        prepTime: "PT20M",
        totalTime: "PT55M",
        recipeIngredient: [
          "4 Eier",
          "100 g Zucker",
          "4 EL Milch",
          "4 EL Wasser",
          "200 g Mehl",
          "1 TL Backpulver",
          "1 Springform (26 cm)",
        ],
        recipeInstructions:
          "Den Backofen auf 180 °C Ober-/Unterhitze vorheizen und die Springform fetten. Eier trennen. Eiweiß und Zucker steif schlagen. Eigelb mit Milch und Wasser verrühren. Mehl mit Backpulver mischen und unter das Eigelb-/Milch-/Wassergemisch rühren. Eischnee unterheben. Den Teig in die Form füllen und ca. 30 Min. backen. Anschließend 10 Minuten in der Form abkühlen lassen, danach auf einem Kuchengitter ganz auskühlen lassen.",
      },
      "https://example.org/biskuit",
    );
    const note = recipeNote(r, { source: "https://example.org/biskuit", today: "2026-11-26" });
    expect(note).toBe(readFileSync(new URL("./fixtures/biskuitboden-import.md", import.meta.url), "utf8"));
  });
});

describe("ingredients in a step", () => {
  const groups = [{ ingredients: ["200 g Mehl", "1 TL Backpulver", "100 g Zucker"] }];
  it("a verb does not hit an ingredient that only starts like it", () => {
    expect(ingredientsInStep("Den Teig ca. 30 Min. backen.", groups)).toEqual([]);
    expect(ingredientsInStep("Backen (30 Min.): Den Teig backen.", groups)).toEqual([]);
  });
  it("the noun still does", () => {
    expect(ingredientsInStep("Mehl und Backpulver mischen.", groups).map((x) => x.index)).toEqual([0, 1]);
    expect(ingredientsInStep("Das Backpulver unterrühren.", groups).map((x) => x.index)).toEqual([1]);
  });
});

describe("durations after 'und' (second round)", () => {
  const first = (t: string) => splitInstruction(t)[0];
  it("a time stays with the title unless the part behind 'und' is an action of its own", () => {
    expect(first("Whisk eggs and sugar until pale, about 5 minutes.").title).toBe("Whisk (5 minutes)");
    expect(first("Cook the onions and garlic for 5 minutes.").title).toBe("Cook (5 minutes)");
    expect(first("Rühre Butter und Zucker 5 Min. schaumig.").title).toBe("Rühren (5 Min.)");
    expect(splitInstruction("Den Ofen vorheizen und den Teig 25 Min. backen.").map((s) => s.title)).toEqual([
      "Vorheizen",
      "Backen (25 Min.)",
    ]);
  });
});

describe("what counts as an action (second round)", () => {
  it("auxiliary verbs split but give no title", () => {
    expect(splitInstruction("Gemüse in kochendes Wasser geben, dann 8 Min. kochen.")).toEqual([
      { text: "Gemüse in kochendes Wasser geben." },
      { title: "Kochen (8 Min.)", text: "8 Min. kochen." },
    ]);
    expect(splitInstruction("Den Teig in eine Schüssel geben und 1 Std. gehen lassen.")).toEqual([
      { text: "Den Teig in eine Schüssel geben." },
      { title: "Gehen lassen (1 Std.)", text: "1 Std. gehen lassen." },
    ]);
    expect(texts("Die Äpfel auf das Blech legen und den Teig darüber geben.")).toHaveLength(2);
    expect(titleFor("Die Äpfel auf das Blech legen.", false)).toBeUndefined();
  });
  it("a one-word action after a waiting time is split off", () => {
    expect(splitInstruction("Teig 30 Min. ruhen lassen, dann ausrollen.")).toEqual([
      { title: "Ruhen lassen (30 Min.)", text: "Teig 30 Min. ruhen lassen." },
      { title: "Ausrollen", text: "Ausrollen." },
    ]);
  });
  it("ambiguous imperative forms are no imperative; an auxiliary imperative does not hide a later verb", () => {
    expect(titleFor("Rolle", false)).toBeUndefined();
    expect(titleFor("Würze nach Geschmack.", false)).toBeUndefined();
    expect(titleFor("Gib das Mehl in die Schüssel, rühre kräftig.", false)).toBe("Rühren");
  });
});

describe("ingredients in a step (second round)", () => {
  it("'panieren' does not highlight Paniermehl, on purpose: a verb never hits a compound that only starts like it", () => {
    expect(ingredientsInStep("Das Schnitzel panieren.", [{ ingredients: ["100 g Paniermehl"] }])).toEqual([]);
    expect(
      ingredientsInStep("Das Paniermehl in einen Teller geben.", [{ ingredients: ["100 g Paniermehl"] }]),
    ).toHaveLength(1);
  });
});
