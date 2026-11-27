import { beforeEach, describe, expect, it } from "vitest";
import { ingredientsInStep } from "../src/cooking";
import { setLanguage } from "../src/i18n";
import type { IngredientGroup } from "../src/types";

beforeEach(() => setLanguage("de"));

const used = (step: string, groups: IngredientGroup[]) =>
  ingredientsInStep(step, groups).map((h) => groups[h.group].ingredients[h.index]);

const cake: IngredientGroup[] = [
  {
    title: "Boden",
    ingredients: ["4 Eier", "150 g Zucker", "200 g Mehl", "20 g Backkakao", "1 TL Backpulver", "100 ml Milch"],
  },
  { title: "Zum Tränken", ingredients: ["1 Tasse Milch"] },
  { title: "Creme", ingredients: ["250 g Quark", "2 EL Zucker", "100 ml Sahne"] },
  { title: "Ganache", ingredients: ["200 g Vollmilch- oder Zartbitterschokolade", "100 ml Sahne"] },
];

describe("nominalized verbs in steps (issue #153)", () => {
  it("are no ingredient words", () => {
    const step = "Direkt nach dem Backen 1 Tasse Milch über den warmen Boden gießen.";
    expect(used(step, cake)).toEqual(["1 Tasse Milch"]);
    expect(used("Beim Rühren das Backpulver zugeben.", cake)).toEqual(["1 TL Backpulver"]);
    expect(used("Nach dem Backen auskühlen lassen.", cake)).toEqual([]);
    expect(used("Zum Backen den Kakao bereitstellen.", cake)).toEqual(["20 g Backkakao"]);
    expect(used("Das Rühren nicht vergessen.", [{ ingredients: ["1 Rührei"] }])).toEqual([]);
  });
  it("leave real nouns alone", () => {
    expect(used("Nach dem Backen das Backpulver prüfen.", cake)).toEqual(["1 TL Backpulver"]);
    expect(used("Vom Kuchen etwas abschneiden.", [{ ingredients: ["100 g Kuchenglasur"] }])).toEqual([
      "100 g Kuchenglasur",
    ]);
  });
  it("count in English: after baking", () => {
    setLanguage("en");
    const groups = [{ ingredients: ["1 tsp baking powder", "20 g cocoa", "1 cup milk"] }];
    expect(used("After baking, pour the milk over the base.", groups)).toEqual(["1 cup milk"]);
    expect(used("Stir in the baking powder after mixing.", groups)).toEqual(["1 tsp baking powder"]);
    expect(used("Before baking, add the baking powder.", groups)).toEqual(["1 tsp baking powder"]);
  });
});

describe("truncated compounds in steps (issue #153)", () => {
  it("complete with the head word", () => {
    const g = [{ ingredients: ["100 ml Milch", "200 g Vollmilch- oder Zartbitterschokolade"] }];
    expect(used("Vollmilch- oder Zartbitterschokolade hacken.", g)).toEqual([g[0].ingredients[1]]);
    expect(used("Die Milch erwärmen.", g)).toEqual(["100 ml Milch"]);
    expect(used("Schokolade hacken.", g)).toEqual([g[0].ingredients[1]]);
  });
  it("find the full compound", () => {
    const g = [{ ingredients: ["300 g Weizenmehl", "200 g Roggenmehl", "1 EL Salz"] }];
    expect(used("Weizen- und Roggenmehl mischen.", g)).toEqual(["300 g Weizenmehl", "200 g Roggenmehl"]);
    const milk = [{ ingredients: ["100 ml Milch", "50 g Mehl"] }];
    expect(used("Weizen- und Roggenmehl mischen.", milk)).toEqual(["50 g Mehl"]);
  });
  it("keep working in English", () => {
    setLanguage("en");
    const g = [{ ingredients: ["1 cup whole milk", "50 g dark chocolate"] }];
    expect(used("Use whole- or skimmed milk.", g)).toEqual(["1 cup whole milk"]);
  });
});

describe("amounts in steps (issue #153)", () => {
  const two = [{ ingredients: ["100 ml Milch", "1 Tasse Milch", "2 EL Zucker", "100 g Zucker"] }];
  it("choose the ingredient with the amount of the step", () => {
    expect(used("1 Tasse Milch angießen.", two)).toEqual(["1 Tasse Milch"]);
    expect(used("100 ml Milch angießen.", two)).toEqual(["100 ml Milch"]);
    expect(used("2 EL Zucker und 100 ml Milch mischen.", two)).toEqual(["100 ml Milch", "2 EL Zucker"]);
    expect(used("0,1 l Milch erhitzen.", two)).toEqual(["100 ml Milch"]);
  });
  it("change nothing when no amount fits", () => {
    expect(used("250 ml Milch angießen.", two)).toEqual(["100 ml Milch", "1 Tasse Milch"]);
    expect(used("Die Milch angießen.", two)).toEqual(["100 ml Milch", "1 Tasse Milch"]);
  });
  it("keep an ingredient without an amount", () => {
    const g = [{ ingredients: ["Milch nach Bedarf", "100 ml Milch", "1 Tasse Milch"] }];
    expect(used("1 Tasse Milch angießen.", g)).toEqual(["Milch nach Bedarf", "1 Tasse Milch"]);
  });
  it("work in English", () => {
    setLanguage("en");
    const g = [{ ingredients: ["100 ml milk", "1 cup milk"] }];
    expect(used("Pour 1 cup milk over the base.", g)).toEqual(["1 cup milk"]);
  });
});

describe("groups in steps (issue #153)", () => {
  it("prefer the group the step names", () => {
    expect(used("Die Sahne für die Creme steifschlagen.", cake)).toEqual(["100 ml Sahne"]);
    expect(ingredientsInStep("Die Sahne für die Creme steifschlagen.", cake).map((h) => cake[h.group].title)).toEqual([
      "Creme",
    ]);
    expect(ingredientsInStep("Für die Ganache die Sahne erhitzen.", cake).map((h) => cake[h.group].title)).toEqual([
      "Ganache",
    ]);
  });
  it("prefer the group whose other ingredients the step uses", () => {
    const hits = ingredientsInStep("Quark und Sahne verrühren.", cake);
    expect(hits.map((h) => cake[h.group].ingredients[h.index])).toEqual(["250 g Quark", "100 ml Sahne"]);
    expect(hits.map((h) => cake[h.group].title)).toEqual(["Creme", "Creme"]);
  });
  it("keep every group without a hint, and the only candidate", () => {
    expect(ingredientsInStep("Die Sahne steifschlagen.", cake)).toHaveLength(2);
    expect(used("Die Sahne für den Boden steifschlagen.", [cake[0], cake[2]])).toEqual(["100 ml Sahne"]);
  });
  it("combine amount and group in the cake step", () => {
    const hits = ingredientsInStep("Nach dem Backen 1 Tasse Milch über den warmen Boden gießen.", cake);
    expect(hits.map((h) => cake[h.group].title)).toEqual(["Zum Tränken"]);
  });
});
