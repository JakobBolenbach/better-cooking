import { beforeEach, describe, expect, it } from "vitest";
import { ingredientsInStep } from "../src/cooking";
import { guessedIngredients } from "../src/stepContext";
import {
  isIntermediate,
  lowerCaseRecipe,
  matchableText,
  nameWithoutDescriptors,
  verbForm,
  withoutTrailing,
} from "../src/stepWords";
import { resolveItem } from "../src/stepIngredients";
import { setLanguage } from "../src/i18n";
import type { IngredientGroup } from "../src/types";

beforeEach(() => setLanguage("de"));

const names = (step: string, groups: IngredientGroup[]) =>
  ingredientsInStep(step, groups).map((h) => groups[h.group].ingredients[h.index]);

const one = (...lines: string[]): IngredientGroup[] => [{ ingredients: lines }];

describe("the order of the groups (issue #162, class 1)", () => {
  const stars: IngredientGroup[] = [
    { title: "Teig", ingredients: ["3 Eiweiß", "1 Prise Salz", "200 g Puderzucker", "300 g gemahlene Mandeln"] },
    { title: "Glasur", ingredients: ["1 Eiweiß", "1 Prise Salz", "100 g Puderzucker"] },
  ];
  const steps = [
    { text: "Mandeln mahlen." },
    { text: "Eiweiß mit Salz steif schlagen, Puderzucker einrühren." },
    { text: "Mandeln unterheben und ausrollen." },
    { text: "Sterne ausstechen und backen." },
    { title: "Glasur", text: "Für die Glasur Eiweiß, Salz und Puderzucker verrühren." },
    { text: "Eiweiß und Puderzucker glatt rühren, die Sterne bestreichen." },
  ];
  const lines = (i: number) =>
    guessedIngredients(steps, stars)[i].map((h) => `${stars[h.group].title}: ${stars[h.group].ingredients[h.index]}`);

  it("is open for one step alone", () => {
    expect(names(steps[1].text, stars)).toHaveLength(6);
  });
  it("gives an open name to the group the neighbours use", () => {
    expect(lines(1)).toEqual(["Teig: 3 Eiweiß", "Teig: 1 Prise Salz", "Teig: 200 g Puderzucker"]);
    expect(lines(5)).toEqual(["Glasur: 1 Eiweiß", "Glasur: 100 g Puderzucker"]);
  });
  it("leaves what the step decides and what is in one group only", () => {
    expect(lines(0)).toEqual(["Teig: 300 g gemahlene Mandeln"]);
    expect(lines(4)).toEqual(["Glasur: 1 Eiweiß", "Glasur: 1 Prise Salz", "Glasur: 100 g Puderzucker"]);
    expect(lines(3)).toEqual([]);
  });
  it("keeps all groups when no neighbour decides", () => {
    const g = guessedIngredients([{ text: "Eiweiß und Salz verrühren." }], stars);
    expect(g[0]).toHaveLength(4);
  });
  it("takes the step before if two are equally near", () => {
    const s = [{ text: "Mandeln mahlen." }, { text: "Eiweiß schlagen." }, { text: "Glasur Puderzucker verrühren." }];
    // Step 3 names the glaze by its title word only (5 points), "Eiweiß" of step 2 stays with the dough.
    expect(guessedIngredients(s, stars)[1].map((h) => stars[h.group].title)).toEqual(["Teig"]);
  });
});

describe("descriptive words are no hits (class 2)", () => {
  const water = one("500 g kaltes Wasser", "3 g frische Hefe", "1 Bund Schnittlauch");
  it("an adjective at the start of a title does not hit the ingredient it describes", () => {
    expect(names("Kalte Reife über Nacht im Kühlschrank.", water)).toEqual([]);
    expect(names("Kaltes Wasser zugeben.", water)).toEqual(["500 g kaltes Wasser"]);
  });
  it("a lower-case adjective in German text does not hit", () => {
    expect(names("Mit frischem Schnittlauch bestreuen.", water)).toEqual(["1 Bund Schnittlauch"]);
    expect(names("Frische Hefe im Wasser auflösen.", water)).toEqual(["500 g kaltes Wasser", "3 g frische Hefe"]);
  });
  it("text written in lower case throughout keeps its words", () => {
    expect(names("hefe in wasser auflösen", water)).toEqual(["500 g kaltes Wasser", "3 g frische Hefe"]);
  });
  it("English descriptors do not hit", () => {
    const en = one("1 tsp fresh yeast", "200 ml cold water", "1 tbsp ground cinnamon", "2 tbsp chopped chives");
    expect(names("Sprinkle with fresh chives and mix with the cold milk.", en)).toEqual(["2 tbsp chopped chives"]);
    expect(names("Add the ground almonds.", en)).toEqual([]);
    expect(names("Dissolve the yeast in the water.", en)).toEqual(["1 tsp fresh yeast", "200 ml cold water"]);
  });
  it("matchableText and nameWithoutDescriptors say what counts", () => {
    expect(matchableText("Eiweiß mit kaltem Wasser verrühren")).toBe("Eiweiß Wasser");
    expect(matchableText("Whisk the cold eggs")).toBe("Whisk the eggs");
    expect(nameWithoutDescriptors("frische Hefe")).toBe("Hefe");
    expect(nameWithoutDescriptors("gemahlener Zimt")).toBe("Zimt");
    expect(nameWithoutDescriptors("fresh yeast")).toBe("yeast");
    expect(nameWithoutDescriptors("baking powder")).toBe("baking powder");
  });
});

describe("compounds for intermediates do not hit their first part (class 3)", () => {
  const g = one(
    "7 g Hefe",
    "300 g Wasser",
    "2 Zehen Knoblauch",
    "100 g Zucker",
    "1 Zitrone",
    "200 g Mehl",
    "30 ml Olivenöl",
  );
  it("Hefewasser is water, not yeast", () => {
    expect(names("Das Hefewasser zum Mehl geben.", g)).toEqual(["300 g Wasser", "200 g Mehl"]);
  });
  it("Knoblauch-Dip and Zuckerguss are no garlic and no sugar", () => {
    expect(names("Den Knoblauch-Dip bereitstellen.", g)).toEqual([]);
    expect(names("Den Zuckerguss auftragen.", g)).toEqual([]);
    expect(names("Knoblauch pressen.", g)).toEqual(["2 Zehen Knoblauch"]);
    expect(names("Mit Bio-Zitrone abreiben.", g)).toEqual(["1 Zitrone"]);
  });
  it("what was right stays right: inflection, the end of a compound, a part of the same thing", () => {
    expect(names("Die Mehle mischen.", g)).toEqual(["200 g Mehl"]);
    expect(names("Olivenöl erhitzen.", g)).toEqual(["30 ml Olivenöl"]);
    expect(names("Mit Zitronensaft und Zitronenschale würzen.", g)).toEqual(["1 Zitrone"]);
    expect(names("Zitronen waschen.", g)).toEqual(["1 Zitrone"]);
  });
  it("a truncated list of compounds names its last one only", () => {
    const biscuit = one("4 EL Milch", "4 EL Wasser", "200 g Mehl");
    expect(names("Mehl unter das Eigelb-/Milch-/Wassergemisch rühren.", biscuit)).toEqual(["200 g Mehl"]);
  });
  it("isIntermediate", () => {
    expect(isIntermediate("hefewasser", "hefe")).toBe(true);
    expect(isIntermediate("zuckerguss", "zucker")).toBe(true);
    expect(isIntermediate("mehle", "mehl")).toBe(false);
    expect(isIntermediate("zitronensaft", "zitrone")).toBe(false);
    expect(isIntermediate("hefe", "hefe")).toBe(false);
  });
});

describe("a head word with trailing additions is hit (class 5)", () => {
  it("Öl finds Olivenöl extra vergine", () => {
    const g = one("30 ml Olivenöl extra vergine", "2 Zwiebeln");
    expect(names("Öl in der Pfanne erhitzen, Zwiebeln darin anbraten.", g)).toEqual([
      "30 ml Olivenöl extra vergine",
      "2 Zwiebeln",
    ]);
    expect(names("Die Zwiebeln anbraten.", g)).toEqual(["2 Zwiebeln"]);
  });
  it("English: oil finds olive oil, extra virgin", () => {
    expect(names("Heat the oil in a pan.", one("30 ml olive oil extra virgin", "1 onion"))).toEqual([
      "30 ml olive oil extra virgin",
    ]);
  });
  it("withoutTrailing", () => {
    expect(withoutTrailing("Olivenöl extra vergine")).toBe("Olivenöl");
    expect(withoutTrailing("Mehl fein")).toBe("Mehl");
    expect(withoutTrailing("extra")).toBe("extra");
  });
});

describe("a bread that bakes with steam", () => {
  const bread: IngredientGroup[] = [
    { title: "Hefewasser", ingredients: ["300 g Wasser", "7 g frische Hefe"] },
    { title: "Teig", ingredients: ["500 g Mehl", "10 g Salz", "20 ml Olivenöl extra vergine"] },
  ];
  it("shows the yeast water step and the dough step with what they use", () => {
    const steps = [
      { text: "Hefe im Wasser auflösen." },
      { text: "Das Hefewasser mit Mehl und Salz verkneten." },
      { text: "Mit Öl einfetten." },
    ];
    const g = guessedIngredients(steps, bread).map((hs) => hs.map((h) => bread[h.group].ingredients[h.index]));
    expect(g[0]).toEqual(["300 g Wasser", "7 g frische Hefe"]);
    expect(g[1]).toEqual(["300 g Wasser", "500 g Mehl", "10 g Salz"]);
    expect(g[2]).toEqual(["20 ml Olivenöl extra vergine"]);
  });
});

describe("only known intermediates are no hits (review round 2)", () => {
  const g = one(
    "2 Zehen Knoblauch",
    "2 Paprika",
    "50 g Butter",
    "1 Zweig Rosmarin",
    "1 Stange Lauch",
    "100 g Schokolade",
    "100 g Zucker",
    "1 TL Zimt",
  );
  it("names the same thing: shapes and measures of an ingredient", () => {
    expect(names("Knoblauchzehen hacken.", g)).toEqual(["2 Zehen Knoblauch"]);
    expect(names("Die Paprikaschoten waschen.", g)).toEqual(["2 Paprika"]);
    expect(names("Mit Butterflocken belegen.", g)).toEqual(["50 g Butter"]);
    expect(names("Aus Rosmarinzweigen einen Tannenbaum legen.", g)).toEqual(["1 Zweig Rosmarin"]);
    expect(names("In Lauchringe schneiden.", g)).toEqual(["1 Stange Lauch"]);
    expect(names("Schokoladenstückchen unterheben.", g)).toEqual(["100 g Schokolade"]);
    expect(names("Aus Rosmarin-Zweigen einen Kranz legen.", g)).toEqual(["1 Zweig Rosmarin"]);
  });
  it("names an intermediate: a known ending or an ingredient of the recipe", () => {
    expect(names("Den Zimtzucker bereitstellen.", g)).toEqual(["100 g Zucker"]);
    expect(names("Die Schokoladensauce erwärmen.", g)).toEqual([]);
    expect(isIntermediate("zimtzucker", "zimt", new Set(["zucker"]))).toBe(true);
    expect(isIntermediate("zimtzucker", "zimt")).toBe(false);
    expect(isIntermediate("knoblauchzehen", "knoblauch")).toBe(false);
    expect(isIntermediate("zitronensaft", "zitrone")).toBe(false);
  });
});

describe("a recipe written in lower case throughout (real finding)", () => {
  const groups: IngredientGroup[] = [
    { ingredients: ["250 gr gemahlene mandeln", "300 gr puderzucker", "3 eiweisse", "1 prise salz", "1 tl zimt"] },
  ];
  const steps = [
    { title: "Ausstechen", text: "Nüsse, puderzucker, zimt, eiweisse und salz vermischen und ausstechen." },
    { title: "Steif schlagen", text: "Das eiweiss steif schlagen." },
    { title: "Glasieren", text: "den puderzucker unterrühren." },
  ];
  it("is found per recipe, not per step", () => {
    expect(
      lowerCaseRecipe([...steps.map((s) => s.text), "gemahlene mandeln", "puderzucker", "eiweisse", "salz", "zimt"]),
    ).toBe(true);
    expect(lowerCaseRecipe(["Mehl mit Salz mischen.", "mehl"])).toBe(false);
  });
  it("keeps the hits of every step, also with a capitalized title and one capitalized noun", () => {
    const g = guessedIngredients(steps, groups).map((hs) => hs.map((h) => groups[h.group].ingredients[h.index]));
    // Alone, the step has a capital in the middle (title, "Nüsse") and its lower-case words would be dropped.
    expect(names(`${steps[0].title} ${steps[0].text}`, groups)).not.toContain("300 gr puderzucker");
    expect(g[0]).toContain("300 gr puderzucker");
    expect(g[0]).toContain("3 eiweisse");
    expect(g[0]).toContain("1 prise salz");
    expect(g[0]).toContain("1 tl zimt");
    expect(g[1]).toEqual(["3 eiweisse"]);
    expect(g[2]).toEqual(["300 gr puderzucker"]);
  });
});

describe("verbs made of an ingredient word (M4)", () => {
  const g = one("1 Prise Salz", "1 Prise Pfeffer", "1 EL Zucker", "20 g Butter", "2 EL Mehl", "1 EL Öl", "1 Zwiebel");
  it("hit the ingredient", () => {
    expect(names("Die Suppe salzen und pfeffern.", g)).toEqual(["1 Prise Salz", "1 Prise Pfeffer"]);
    expect(names("Den Rand zuckern.", g)).toEqual(["1 EL Zucker"]);
    expect(names("Die Form buttern und mehlen.", g)).toEqual(["20 g Butter", "2 EL Mehl"]);
    expect(names("Die Pfanne ölen.", g)).toEqual(["1 EL Öl"]);
    expect(names("Mit Mehl bestäuben.", g)).toEqual(["2 EL Mehl"]);
  });
  it("verbForm", () => {
    expect(verbForm("salzen", "salz")).toBe(true);
    expect(verbForm("buttern", "butter")).toBe(true);
    expect(verbForm("olen", "ol")).toBe(true);
    expect(verbForm("backen", "backpulver")).toBe(false);
  });
});

describe("head word in a named group and language boundaries", () => {
  it("Öl in the group of Olivenöl extra vergine", () => {
    const g: IngredientGroup[] = [{ title: "Pfanne", ingredients: ["30 ml Olivenöl extra vergine"] }];
    expect(resolveItem("Öl (Pfanne)", g).hits).toEqual([{ group: 0, index: 0 }]);
  });
  it("a text with the same number of German and English function words is neither", () => {
    // "in" and "the": one each, so it is treated like text without a language: nothing is dropped
    const text = "Stir in the Mehl";
    expect(matchableText(text)).toBe("Stir in the Mehl");
  });
  it("short English text without function words keeps its lower-case words", () => {
    expect(names("Whisk eggs.", one("2 eggs"))).toEqual(["2 eggs"]);
  });
  it("short German text without function words keeps its nouns", () => {
    expect(names("Eiweiß schlagen.", one("2 Eiweiß"))).toEqual(["2 Eiweiß"]);
  });
});
