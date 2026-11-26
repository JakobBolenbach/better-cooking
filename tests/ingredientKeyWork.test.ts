import { describe, expect, it } from "vitest";
import { kindsOf, nameRank, plainName, sameIngredient } from "../src/ingredientKey";

// Kitchen work in front of produce and garlic (issue #69, WORK_NOUNS). Spices with two meanings are not listed and
// behave as without the list.
const SAME: [string, string][] = [
  // Kitchen work in front of a vegetable or herb that is bought whole either way (WORK_NOUNS, issue #69).
  ["gehackte Zwiebeln", "Zwiebeln"],
  ["fein gehackte Petersilie", "Petersilie"],
  ["frisch gehackte Petersilie", "Petersilie"],
  ["frische Petersilie", "Petersilie"],
  ["geschälte Zwiebeln", "Zwiebeln"],
  ["Zwiebeln, geschält", "Zwiebeln"],
  ["Zwiebeln in Würfeln", "Zwiebeln"],
  ["Zwiebeln in feine Ringe geschnitten", "Zwiebeln"],
  ["gewürfelte rote Zwiebel", "Zwiebel, rot"],
  ["Knoblauch, gepresst", "Knoblauch"],
  ["zerdrückter Knoblauch", "Knoblauch"],
  ["zerstoßener Knoblauch", "Knoblauch"],
  ["crushed garlic", "garlic"],
  ["Mohrrüben, geschält", "Möhren"],
  ["gewürfelte Küchenzwiebeln", "Zwiebeln"],
  ["Zucchinis, gewürfelt", "Zucchini"],
  ["gewürfelte Paprika", "Paprika"],
  ["geschälte Kartoffeln", "Kartoffeln"],
  ["geraspelte Möhren", "Möhren"],
  ["gewürfelter Sellerie", "Sellerie"],
  ["finely chopped onion", "onions"],
  ["minced garlic", "garlic"],
  ["chopped fresh parsley", "parsley"],
  ["parsley, fresh, finely chopped", "parsley"],
  ["sliced scallions", "scallions"],
  ["diced red bell pepper", "red bell pepper"],
  ["peeled potatoes", "potatoes"],
  ["grated apple", "apples"],
  ["Parmesan, gerieben", "Parmesan"],
  // Spices with two meanings are not on the list: after a comma the kitchen word falls away as everywhere.
  ["Ingwer, gerieben", "Ingwer"],
  ["fresh basil, divided", "fresh basil"],
  ["Thymian, gehackt", "Thymian"],
];

const DIFFERENT: [string, string][] = [
  // Not on the list: in front of the noun the kitchen word counts, as everywhere.
  ["geriebener Ingwer", "Ingwer"],
  ["fein gehackter Ingwer", "Ingwer"],
  ["gehackter Koriander", "Koriander"],
  ["frischer Ingwer", "Ingwer"],
  ["2 EL gehackter Koriander", "1 EL Koriander"],
  ["frischer Thymian", "Thymian"],
  ["fresh basil", "basil"],
  ["gewürfelte Paprika", "Paprika"],
  ["zerstoßener Koriander", "Koriander"],
  ["gemahlener Koriander", "Koriander"],
  ["ground ginger", "ginger"],
  ["dried thyme", "thyme"],
  // Compounds and product adjectives are other products.
  ["Frühlingszwiebeln", "Zwiebeln"],
  ["Lauchzwiebeln", "Zwiebeln"],
  ["Knoblauchpulver", "Knoblauch"],
  ["Knoblauchgranulat", "Knoblauch"],
  ["Zwiebelpulver", "Zwiebeln"],
  ["Röstzwiebeln", "Zwiebeln"],
  ["geröstete Zwiebeln", "Zwiebeln"],
  ["Bratkartoffeln", "Kartoffeln"],
  ["Salzkartoffeln", "Kartoffeln"],
  ["Kartoffelpüree", "Kartoffeln"],
  ["Kartoffelstärke", "Kartoffeln"],
  ["gekochte Kartoffeln", "Kartoffeln"],
  ["Apfelmus", "Äpfel"],
  ["Apfelsaft", "Äpfel"],
  ["Staudensellerie", "Sellerie"],
  ["Petersilienwurzel", "Petersilie"],
  ["Selleriesalz", "Sellerie"],
  ["geräucherte Paprika", "Paprika"],
  ["sweet potato", "potato"],
  ["green onion", "onion"],
  ["red bell pepper", "bell pepper"],
  ["garlic powder", "garlic"],
  ["TK-Knoblauch", "Knoblauch"],
  ["gehackte Tomaten (Dose)", "Tomaten"],
  ["getrocknete Petersilie", "Petersilie"],
  ["getrocknete Petersilie", "frische Petersilie"],
  ["TK-Petersilie", "Petersilie"],
  ["gemahlener Ingwer", "Ingwer"],
  ["rote Zwiebeln", "Zwiebeln"],
  ["gehackte rote Zwiebeln", "gehackte Zwiebeln"],
  ["eingelegte Zwiebeln", "Zwiebeln"],
  ["Paprikapulver", "Paprika"],
  ["Paprika edelsüß", "Paprika"],
  ["crushed red pepper", "bell pepper"],
  ["chopped dried basil", "basil"],
  ["frozen chopped onions", "onions"],
  ["chopped almonds", "almonds"],
  ["geriebener Käse", "Käse"],
  ["geriebene Zitronenschale", "Zitrone"],
  ["crushed garlic", "garlic powder"],
];

describe("kitchen work in front of produce and garlic (#69)", () => {
  it.each(SAME)("%s = %s", (a, b) => {
    expect(sameIngredient(a, b)).toBe(true);
    expect(sameIngredient(b, a)).toBe(true);
  });

  it.each(DIFFERENT)("%s ≠ %s", (a, b) => {
    expect(sameIngredient(a, b)).toBe(false);
    expect(sameIngredient(b, a)).toBe(false);
  });

  it("writes the plainest name", () => {
    expect(plainName("fein gehackte Zwiebeln, zimmerwarm")).toBe("Zwiebeln");
    expect(plainName("frische rote Zwiebeln in Würfeln")).toBe("rote Zwiebeln");
    expect(plainName("gehackter Koriander")).toBe("gehackter Koriander");

    expect(nameRank("gehackte Zwiebeln")).toBe(2);
    expect(nameRank("Zwiebel")).toBeLessThan(nameRank("gehackte Zwiebeln"));
    expect(nameRank("Zwiebeln (große)")).toBe(nameRank("Zwiebeln"));
  });

  it("drops kitchen work after a comma and keeps kinds", () => {
    expect(kindsOf("Zwiebeln, rot, fein gehackt")).toBe("rot");
    expect(kindsOf("Petersilie, frisch, gehackt")).toBe("");
    expect(kindsOf("Knoblauch, zerstoßen")).toBe("");
    expect(kindsOf("Koriander, zerstoßen")).toBe("zerstoßen");
    expect(kindsOf("parsley, dried, chopped")).toBe("dried");
  });
});
