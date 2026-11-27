import { beforeEach, describe, expect, it } from "vitest";
import { ingredientsInStep } from "../src/cooking";
import {
  completeCompounds,
  gerunds,
  nameKey,
  nominalizedVerbs,
  preferByAmount,
  preferByGroup,
  truncatedPairs,
} from "../src/stepFilter";
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
  it("treat Kuchen and its compounds as nouns", () => {
    const g = [{ ingredients: ["100 g Kuchenglasur", "1 Lebkuchengewürz"] }];
    expect(used("Die Glasur auf dem Kuchen verteilen.", g)).toEqual(["100 g Kuchenglasur"]);
    expect([...nominalizedVerbs("vom Pfannkuchen, dem Lebkuchen, vom Knochen")]).toEqual([]);
  });
  it("leave real nouns alone", () => {
    expect(used("Nach dem Backen das Backpulver prüfen.", cake)).toEqual(["1 TL Backpulver"]);
    expect(used("Vom Roggen etwas nehmen.", [{ ingredients: ["100 g Roggenmehl"] }])).toEqual(["100 g Roggenmehl"]);
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

const all = (groups: IngredientGroup[]) =>
  groups.flatMap((g, group) => g.ingredients.map((_z, index) => ({ group, index })));

describe("every ingredient the step names with its amount stays (issue #153)", () => {
  const boden = [
    "4 Eier",
    "200 g Zucker",
    "2 Päckchen Vanillezucker",
    "3 EL Backkakao",
    "100 ml Milch",
    "1 Päckchen Backpulver",
  ];
  const groups: IngredientGroup[] = [
    { title: "Boden", ingredients: boden },
    { title: "Zum Tränken", ingredients: ["1 Tasse Milch"] },
    { title: "Creme", ingredients: ["3 EL Puderzucker"] },
  ];
  const step =
    "4 Eier, 200 g Zucker, 2 Päckchen Vanillezucker, 3 EL Backkakao, 100 ml Milch und 1 Päckchen Backpulver zu einem glatten Teig verrühren.";
  it("keeps all of them, in the order of the step and reversed", () => {
    for (const s of [step, "1 Päckchen Backpulver, 100 ml Milch, 2 Päckchen Vanillezucker und 200 g Zucker mischen."]) {
      const out = used(s, groups);
      for (const z of boden.filter((z) => !/Eier|Backkakao/.test(z) || s === step)) expect(out, z).toContain(z);
      expect(out).not.toContain("1 Tasse Milch");
    }
  });
  it("keeps every named ingredient of a related name: butter and clarified butter, milk and milk chocolate, cream and stiffener", () => {
    const g = [
      {
        ingredients: [
          "100 g Butter",
          "20 g Butterschmalz",
          "200 ml Sahne",
          "1 Päckchen Sahnesteif",
          "50 g Milchschokolade",
        ],
      },
    ];
    expect(used("100 g Butter, 200 ml Sahne und 1 Päckchen Sahnesteif verrühren.", g)).toEqual(
      expect.arrayContaining([g[0].ingredients[0], g[0].ingredients[2], g[0].ingredients[3]]),
    );
  });
  it("in English", () => {
    setLanguage("en");
    const g = [
      { title: "Cake", ingredients: ["200 g sugar", "2 tsp vanilla sugar", "100 ml milk"] },
      { title: "Soak", ingredients: ["1 cup milk"] },
    ];
    const out = used("Mix 200 g sugar, 2 tsp vanilla sugar and 100 ml milk.", g);
    expect(out).toEqual(expect.arrayContaining(["200 g sugar", "2 tsp vanilla sugar", "100 ml milk"]));
    expect(out).not.toContain("1 cup milk");
  });
  it("cannot tell an amount without a unit from an amount with a unit: both stay", () => {
    const g = [{ ingredients: ["2 Zitronen", "100 g Zitronen"] }];
    expect(used("100 g Zitronen pressen.", g)).toEqual(["2 Zitronen", "100 g Zitronen"]);
  });
  it("keeps related names with their own amounts", () => {
    const b = [{ ingredients: ["100 g Butter", "20 g Butterschmalz"] }];
    expect(used("100 g Butter und 20 g Butterschmalz erhitzen.", b)).toEqual(b[0].ingredients);
    const m = [{ ingredients: ["100 ml Milch", "50 g Milchschokolade"] }];
    expect(used("100 ml Milch und 50 g Milchschokolade erwärmen.", m)).toEqual(m[0].ingredients);
  });
});

describe("group titles are a hint only (issue #153)", () => {
  const rolls: IngredientGroup[] = [
    { title: "Teig", ingredients: ["500 g Mehl", "250 ml Milch", "80 g Butter", "50 g Zucker", "1 Würfel Hefe"] },
    { title: "Füllung", ingredients: ["60 g Butter", "80 g Zucker", "2 EL Zimt"] },
  ];
  it("keeps the filling for a step about the dough as a place", () => {
    const out = ingredientsInStep("Butter mit Zucker und Zimt verrühren und auf den Teig streichen.", rolls);
    expect(out.filter((h) => h.group === 1)).toHaveLength(3);
  });
  it("ties of two titles keep both", () => {
    const g = [
      { title: "Creme", ingredients: ["100 ml Sahne"] },
      { title: "Ganache", ingredients: ["100 ml Sahne"] },
    ];
    expect(ingredientsInStep("Creme und Ganache: die Sahne schlagen.", g)).toHaveLength(2);
  });
  it("prefers the named group in English", () => {
    setLanguage("en");
    const g = [
      { title: "Cake", ingredients: ["100 g butter"] },
      { title: "Frosting", ingredients: ["50 g butter"] },
    ];
    expect(ingredientsInStep("Beat the butter for the frosting.", g).map((h) => h.group)).toEqual([1]);
  });
  it('a group like "Für die Form" wins for a step about the tin', () => {
    const g = [
      { title: "Für die Form", ingredients: ["1 EL Butter", "1 EL Mehl"] },
      { title: "Teig", ingredients: ["100 g Butter", "200 g Mehl"] },
    ];
    const hits = ingredientsInStep("Die Form mit Butter einfetten und mit Mehl bestäuben.", g);
    expect(hits.map((h) => h.group)).toEqual([0, 0]);
  });
  it("does not use dough or ingredients as title words", () => {
    const g = [
      { title: "Dough", ingredients: ["100 g butter"] },
      { title: "Ingredients", ingredients: ["50 g butter"] },
    ];
    expect(ingredientsInStep("Spread the butter on the dough with the ingredients.", g)).toHaveLength(2);
  });
});

describe("truncated compounds on the ingredient side (issue #153)", () => {
  const g = [{ ingredients: ["200 g Vollmilch- oder Zartbitterschokolade", "100 ml Milch"] }];
  it("are found by the completed word, not by the plain head", () => {
    expect(used("Die Vollmilchschokolade hacken.", g)).toEqual([g[0].ingredients[0]]);
    expect(used("Die Zartbitterschokolade hacken.", g)).toEqual([g[0].ingredients[0]]);
    expect(used("Die Milch erwärmen.", g)).toEqual(["100 ml Milch"]);
  });
});

describe("-ing words keep their head word (issue #153)", () => {
  it("until the frosting is set", () => {
    setLanguage("en");
    expect(used("Chill until the frosting is set.", [{ ingredients: ["200 g frosting"] }])).toEqual(["200 g frosting"]);
  });
});

describe("stepFilter functions", () => {
  it("nominalizedVerbs", () => {
    expect([...nominalizedVerbs("Nach dem Backen und beim Rühren, fürs Kochen, vom Roggen, ins Backen")]).toEqual(
      ["backen", "ruhren", "kochen", "backen"].filter((w, i, a) => a.indexOf(w) === i),
    );
    expect(nominalizedVerbs("Dem Brötchen und dem Boden").size).toBe(0);
    expect([...nominalizedVerbs("Zum Mischen")]).toEqual(["mischen"]);
  });
  it("gerunds", () => {
    expect([...gerunds("After baking, before Mixing")]).toEqual(["baking", "mixing"]);
    expect(gerunds("Add the baking powder").size).toBe(0);
  });
  it("truncatedPairs and completeCompounds", () => {
    expect(truncatedPairs("Weizen- und Roggenmehl")).toEqual([{ first: "weizen", full: "roggenmehl" }]);
    expect(completeCompounds("Weizen- und Roggenmehl", ["weizenmehl"])).toBe("Weizenmehl und Roggenmehl");
    expect(completeCompounds("Weizen- und Roggenmehl", [])).toBe("WeizenRoggenmehl und Roggenmehl");
    expect(completeCompounds("Nutella-Creme", [])).toBe("Nutella-Creme");
  });
  it("nameKey tells related names apart", () => {
    expect(nameKey("200 g Zucker")).not.toBe(nameKey("2 Päckchen Vanillezucker"));
    expect(nameKey("200 g Zucker")).toBe(nameKey("2 EL Zucker"));
  });
  it("preferByAmount confirms and refutes by name and amount", () => {
    const groups = [{ ingredients: ["100 ml Milch", "1 Tasse Milch", "Milch nach Bedarf", "2 Eier"] }];
    const hits = all(groups);
    const line = (h: { group: number; index: number }) => groups[h.group].ingredients[h.index];
    const r = preferByAmount("1 Tasse Milch angießen", line, hits);
    expect(r.hits.map((h) => h.index)).toEqual([1, 2, 3]);
    expect([...r.confirmed].map((h) => h.index)).toEqual([1]);
    expect(preferByAmount("5 l Milch angießen", line, hits).hits).toEqual(hits);
  });
  it("preferByGroup never drops a confirmed hit or the only candidate", () => {
    const groups = [
      { title: "Boden", ingredients: ["100 g Butter", "200 g Mehl"] },
      { title: "Creme", ingredients: ["50 g Butter"] },
    ];
    const hits = all(groups);
    const out = preferByGroup("Butter und Mehl", groups, hits);
    expect(out.map((h) => h.group)).toEqual([0, 0]);
    expect(preferByGroup("Butter und Mehl", groups, hits, new Set([hits[2]]))).toEqual(hits);
    expect(
      preferByGroup(
        "Butter",
        [groups[1]],
        [hits[2]].map((h) => ({ ...h, group: 0 })),
      ),
    ).toHaveLength(1);
  });
});
