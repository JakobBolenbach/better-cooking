import { describe, expect, it } from "vitest";
import { ingredientKey, nameRank, plainName, sameIngredient } from "../src/ingredientKey";

const SAME: [string, string][] = [
  ["Mehl", "Mehl, gesiebt"],
  ["Mehl", "gesiebtes Mehl"],
  ["Zwiebel", "Zwiebeln"],
  ["Zwiebel", "Zwiebel, fein gehackt"],
  ["Zwiebeln", "gehackte Zwiebeln"],
  ["Butter", "weiche Butter"],
  ["Butter", "Butter, zimmerwarm"],
  ["Butter", "geschmolzene Butter"],
  ["Tomate", "Tomaten"],
  ["Tomaten", "Tomate(n)"],
  ["Ei", "Eier"],
  ["Ei", "Ei(er)"],
  ["Eier", "Eier (Größe M)"],
  ["Ei", "Hühnerei"],
  ["Zucker", "Kristallzucker"],
  ["Zucker", "weißer Zucker"],
  ["Zucker", "weisser Zucker"],
  ["Salz", "Salz nach Geschmack"],
  ["Salz", "Speisesalz"],
  ["Pfeffer", "schwarzer Pfeffer"],
  ["Weizenmehl Type 405", "Weizenmehl Typ 405"],
  ["Weizenmehl Type 405", "Weizenmehl 405"],
  ["Weizenmehl Type 405", "Weizenmehl T405"],
  ["Dinkelvollkornmehl", "Dinkel-Vollkornmehl"],
  ["brauner Zucker", "brauner Zucker, fein"],
  ["Möhre", "Karotten"],
  ["Zitrone", "Zitronen, in Scheiben"],
  ["Knoblauchzehe", "Knoblauchzehen"],
  ["Haselnuss", "Haselnüsse"],
  ["Apfel", "Äpfel"],
  ["Vollmilch", "Milch 3,5 %"],
  ["Milch", "Milch (zimmerwarm)"],
  ["Mandeln", "Mandel"],
  ["frischer Basilikum", "Basilikum"],
  ["Schlagsahne", "Schlagobers"],
  ["flour", "flour, sifted"],
  ["onion", "chopped onions"],
  ["butter", "softened butter"],
  ["butter", "melted butter"],
  ["egg", "eggs"],
  ["tomato", "tomatoes"],
  ["potato", "potatoes, diced"],
  ["fresh parsley", "parsley"],
  ["apple", "apples"],
  ["sugar", "granulated sugar"],
  ["powdered sugar", "icing sugar"],
  ["brown sugar", "brown sugar, packed"],
  ["zucchini", "courgette"],
];

const DIFFERENT: [string, string][] = [
  ["Dinkelmehl", "Weizenmehl"],
  ["Weizenmehl", "Roggenmehl"],
  ["Weizenmehl Type 405", "Weizenmehl Type 550"],
  ["Weizenmehl Type 550", "Weizenmehl Type 1050"],
  ["Weizenmehl", "Weizenvollkornmehl"],
  ["Mehl", "Dinkelmehl"],
  ["Mehl", "Weizenmehl"],
  ["Zucker", "brauner Zucker"],
  ["brauner Zucker", "weißer Zucker"],
  ["Zucker", "Puderzucker"],
  ["Zucker", "Vanillezucker"],
  ["Milch", "Vollmilch"],
  ["Vollmilch", "fettarme Milch"],
  ["Milch", "Milch 1,5 %"],
  ["Milch 1,5 %", "Milch 3,5 %"],
  ["Butter", "Buttermilch"],
  ["Ei", "Eigelb"],
  ["Eigelb", "Eiweiß"],
  ["Zwiebel", "rote Zwiebel"],
  ["Pfeffer", "Pfefferminze"],
  ["Salz", "Meersalz"],
  ["Mandeln", "gemahlene Mandeln"],
  ["Basilikum", "getrocknetes Basilikum"],
  ["Nuss", "Haselnuss"],
  ["Hefe", "Trockenhefe"],
  ["Sahne", "saure Sahne"],
  ["Thunfisch in Öl", "Thunfisch in Wasser"],
  ["Salz und Pfeffer", "Salz"],
  ["Olivenöl", "Sonnenblumenöl"],
  // German and English are not translated.
  ["Mehl", "flour"],
  ["Zucker", "sugar"],
  ["Ei", "egg"],
  ["flour", "whole wheat flour"],
  ["sugar", "brown sugar"],
  ["milk", "whole milk"],
  ["onion", "red onion"],
  ["butter", "buttermilk"],
  ["egg", "egg yolk"],
  ["cream", "sour cream"],
];

describe("ingredient identity (#66)", () => {
  it.each(SAME)("%s = %s", (a, b) => {
    expect(sameIngredient(a, b)).toBe(true);
    expect(sameIngredient(b, a)).toBe(true);
  });

  it.each(DIFFERENT)("%s ≠ %s", (a, b) => {
    expect(sameIngredient(a, b)).toBe(false);
    expect(sameIngredient(b, a)).toBe(false);
  });

  it("has more than thirty pairs of each kind", () => {
    expect(SAME.length).toBeGreaterThanOrEqual(30);
    expect(DIFFERENT.length).toBeGreaterThanOrEqual(30);
  });

  it("does not depend on case, spaces or the order of words", () => {
    expect(ingredientKey("  WEIZENMEHL   Type 405 ")).toBe(ingredientKey("weizenmehl type 405"));
    expect(ingredientKey("Zucker, braun")).toBe(ingredientKey("Zucker"));
    expect(ingredientKey("Type 405 Weizenmehl")).toBe(ingredientKey("Weizenmehl Type 405"));
  });

  it("compares names without letters only as written", () => {
    expect(ingredientKey("")).toBe("");
    expect(sameIngredient("???", "???")).toBe(true);
    expect(sameIngredient("???", "!!!")).toBe(false);
  });

  it("keeps a name made only of state words", () => {
    expect(ingredientKey("frische")).not.toBe("");
    expect(plainName("frische")).toBe("frische");
  });
});

describe("plain name", () => {
  it("drops brackets, comma tail, state and amount words but keeps spelling", () => {
    expect(plainName("gehackte Zwiebeln")).toBe("Zwiebeln");
    expect(plainName("Mehl, gesiebt")).toBe("Mehl");
    expect(plainName("Butter (weich)")).toBe("Butter");
    expect(plainName("geh. Backpulver")).toBe("Backpulver");
    expect(plainName("Salz nach Geschmack")).toBe("Salz");
    expect(plainName("Weizenmehl Type 405")).toBe("Weizenmehl Type 405");
  });

  it("ranks the main spelling and fewer words first", () => {
    expect(nameRank("Mehl")).toBe(1);
    expect(nameRank("Weizenmehl Type 405")).toBe(2);
    expect(nameRank("gehackte Zwiebeln")).toBe(1);
    expect(nameRank("Zucker")).toBeLessThan(nameRank("Kristallzucker"));
    expect(nameRank("Zucker")).toBeLessThan(nameRank("weißer Zucker"));
  });
});
