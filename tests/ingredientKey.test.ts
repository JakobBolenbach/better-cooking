import { describe, expect, it } from "vitest";
import { ingredientKey, kindsOf, nameRank, plainName, sameIngredient } from "../src/ingredientKey";

const SAME: [string, string][] = [
  // Adverbs before kitchen work, kitchen work after a comma.
  ["fein gehackte Zwiebeln", "gehackte Zwiebeln"],
  ["Zwiebeln, fein gehackt", "Zwiebeln"],
  ["Zwiebeln, dünn geschnitten", "Zwiebeln"],
  ["Eier, verquirlt", "Eier"],
  ["Möhren, geputzt", "Möhren"],
  ["Butter, divided", "Butter"],
  ["onions, finely diced", "onions"],
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
  ["fein gehackter Ingwer", "Ingwer"],
  ["frischer Thymian, gehackt", "frischer Thymian"],
  ["finely chopped fresh ginger", "chopped fresh ginger"],
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
  // Product words are words of their own, also as a prefix.
  ["TK-Erbsen", "TK Erbsen"],
  ["TK-Erbsen", "Erbsen (TK)"],
  ["frozen peas", "peas, frozen"],
  // Amounts, units and function words in brackets or after a comma.
  ["Mehl (250 g)", "Mehl"],
  ["Mehl (550 g)", "Mehl"],
  ["Butter (1 stick)", "Butter"],
  ["Milch (ca. 4 Tassen)", "Milch"],
  ["Lauch (1 Bund)", "Lauch"],
  ["Butter, at room temperature", "Butter"],
  ["Sahne, Zimmertemperatur", "Sahne"],
  ["Eier (z. B. Größe M)", "Eier"],
  ["Zitronen, in Ringen", "Zitronen"],
  ["Gurke, in Streifen", "Gurke"],
  ["Schokolade, sehr zerkleinert", "Schokolade"],
  // Declined kinds and participles.
  ["gemahlener Zimt", "Zimt, gemahlen"],
  ["getrockneter Oregano", "Oregano, getrocknet"],
  ["rote Zwiebel", "Zwiebel, rot"],
  ["rote Zwiebeln", "rote Zwiebel"],
  ["Zucker, braun, oder Honig", "brauner Zucker"],
  ["Zucker, braun, gewaschen", "brauner Zucker"],
  // Kitchen work and state are ignored everywhere.
  ["Mehl", "Mehl, gesiebt"],
  ["Mehl", "gesiebtes Mehl"],
  ["Butter", "weiche Butter"],
  ["Butter", "Butter, zimmerwarm"],
  ["Butter", "geschmolzene Butter"],
  ["Butter", "zerlassene Butter"],
  ["Butter", "Butter (weich)"],
  ["Milch", "Milch (zimmerwarm)"],
  ["Milch", "Milch, kalt"],
  ["Salz", "Salz nach Geschmack"],
  ["Salz", "Salz, ca. 1 TL"],
  // Preparation after a comma is ignored, in front of the noun it counts (see DIFFERENT).
  ["Zwiebel", "Zwiebel, fein gehackt"],
  ["Zwiebeln", "Zwiebeln, gehackt"],
  ["Tomaten", "Tomaten, gehackt"],
  ["Zitrone", "Zitronen, in Scheiben"],
  ["Butter", "Butter, in Würfeln"],
  ["onion", "onions, chopped"],
  ["potato", "potatoes, diced"],
  // Plurals and spelling.
  ["Zwiebel", "Zwiebeln"],
  ["Tomate", "Tomaten"],
  ["Tomaten", "Tomate(n)"],
  ["Ei", "Eier"],
  ["Ei", "Ei(er)"],
  ["Eier", "Eier (Größe M)"],
  ["Ei", "Hühnerei"],
  ["Haselnuss", "Haselnüsse"],
  ["Apfel", "Äpfel"],
  ["Mandeln", "Mandel"],
  ["Knoblauchzehe", "Knoblauchzehen"],
  ["Bio-Eier", "Eier"],
  ["Dinkelvollkornmehl", "Dinkel-Vollkornmehl"],
  ["egg", "eggs"],
  ["tomato", "tomatoes"],
  ["apple", "apples"],
  ["onion", "onions"],
  // Synonyms.
  ["Zucker", "Kristallzucker"],
  ["Zucker", "weißer Zucker"],
  ["Salz", "Speisesalz"],
  ["Möhre", "Karotten"],
  ["Pfeffer", "schwarzer Pfeffer"],
  ["Schlagsahne", "Schlagobers"],
  ["sugar", "granulated sugar"],
  ["powdered sugar", "icing sugar"],
  ["zucchini", "courgette"],
  // Word order and adjective endings.
  ["Pfeffer schwarz", "schwarzer Pfeffer"],
  ["brauner Zucker", "Zucker, braun"],
  ["dunkle Schokolade", "Schokolade, dunkel"],
  ["Type 405 Weizenmehl", "Weizenmehl Type 405"],
  ["Weizenmehl Type 405", "Weizenmehl Typ 405"],
  ["Weizenmehl Type 405", "Weizenmehl 405"],
  ["Weizenmehl Type 405", "Weizenmehl T405"],
  ["Weizenmehl Type 405", "Weizenmehl (405)"],
  ["Weizenmehl Type 405", "Weizenmehl, Typ 405"],
  ["Mehl, Type 550", "Mehl Type 550"],
  // Kinds after a comma or in brackets count like kinds in front.
  ["Zucker (braun)", "brauner Zucker"],
  ["Mandeln, gemahlen", "gemahlene Mandeln"],
  ["Milch (3,5 % Fett)", "Milch 3,5 %"],
  ["Milch (3,5 % Fett)", "Vollmilch"],
  ["Sahne (30 %)", "Sahne, 30 %"],
  ["sugar, brown", "brown sugar"],
  // Substitutes, hints and amounts in brackets are ignored.
  ["Butter (optional)", "Butter"],
  ["Tomaten (Dose)", "Tomaten (Glas)"],
  ["Butter (oder Margarine)", "Butter"],
  ["Butter, oder Margarine", "Butter"],
  ["Milch (or oat milk)", "Milch"],
  ["Tomaten (400 g)", "Tomaten"],
  ["Zwiebeln, fein gehackt (Größe M)", "Zwiebeln"],
  ["butter", "softened butter"],
  ["butter", "melted butter"],
  ["flour", "flour, sifted"],
  ["brown sugar", "brown sugar, packed"],
];

const DIFFERENT: [string, string][] = [
  ["TK-Erbsen", "Erbsen"],
  ["Erbsen (TK)", "Erbsen"],
  ["frozen peas", "peas"],
  ["almonds, sliced", "almonds"],
  ["Zwiebeln, fein", "Zwiebeln"],
  ["Zimt, gemahlen", "Zimt, ganz"],
  ["Mehl (250 g)", "Mehl (550)"],
  ["Käse, mit Kräutern", "Käse"],
  ["Pfeffer, geräuchert", "Pfeffer"],
  // Kinds, varieties, flour types.
  ["Dinkelmehl", "Weizenmehl"],
  ["Weizenmehl", "Roggenmehl"],
  ["Weizenmehl", "Weizenvollkornmehl"],
  ["Mehl", "Dinkelmehl"],
  ["Mehl", "Weizenmehl"],
  ["Weizenmehl Type 405", "Weizenmehl Type 550"],
  ["Weizenmehl Type 550", "Weizenmehl Type 1050"],
  ["Weizenmehl (405)", "Weizenmehl (550)"],
  ["Weizenmehl (405)", "Weizenmehl"],
  ["Mehl, Type 550", "Mehl, Type 405"],
  ["Weizenmehl (Type 550)", "Weizenmehl Type 405"],
  ["Zucker", "brauner Zucker"],
  ["Zucker, braun", "Zucker"],
  ["Zucker (braun)", "Zucker, weiß"],
  ["brauner Zucker", "weißer Zucker"],
  ["Zucker", "Puderzucker"],
  ["Zucker", "Vanillezucker"],
  ["Ei", "Eigelb"],
  ["Eigelb", "Eiweiß"],
  ["Zwiebel", "rote Zwiebel"],
  ["Salz", "Meersalz"],
  ["Pfeffer", "Pfefferminze"],
  ["Butter", "Buttermilch"],
  ["Butter", "Butt"],
  ["Nuss", "Haselnuss"],
  ["Hefe", "Trockenhefe"],
  ["Sahne", "saure Sahne"],
  ["Olivenöl", "Sonnenblumenöl"],
  ["Kräuter", "Kraut"],
  // Fat levels.
  ["Milch", "Vollmilch"],
  ["Vollmilch", "fettarme Milch"],
  ["Milch", "Milch 1,5 %"],
  ["Milch 1,5 %", "Milch 3,5 %"],
  ["Milch (3,5 % Fett)", "Milch (1,5 % Fett)"],
  ["Milch (3,5 %)", "Milch"],
  ["Sahne (30 %)", "Sahne (10 %)"],
  // Preparation in front of the noun makes another product.
  ["gehackte Tomaten", "Tomaten"],
  ["geschälte Tomaten", "Tomaten"],
  ["gehackte Tomaten", "geschälte Tomaten"],
  ["TK-Spinat", "Spinat"],
  ["tiefgekühlter Spinat", "Spinat"],
  ["gekochter Schinken", "Schinken"],
  ["leichter Frischkäse", "Frischkäse"],
  ["grobes Meersalz", "feines Meersalz"],
  ["grobes Meersalz", "Meersalz"],
  ["grober Senf", "Senf"],
  // Spices with two meanings: only cutting words fall away, fresh, grated and crushed count.
  ["geriebener Ingwer", "Ingwer"],
  ["Ingwer, gerieben", "Ingwer"],
  ["frischer Ingwer", "Ingwer"],
  ["frischer Thymian, gehackt", "Thymian"],
  ["fresh thyme", "thyme"],
  ["frisches Basilikum", "Basilikum"],
  ["fresh coriander", "coriander"],
  ["zerstoßener Koriander", "Koriander, gehackt"],
  ["crushed coriander", "chopped coriander"],
  ["frische Minze", "Minze"],
  ["fresh dill", "dill"],
  ["frischer Rosmarin", "Rosmarin"],
  ["gemahlener Koriander", "Koriander"],
  ["ground ginger", "ginger"],
  ["dried thyme", "thyme"],
  ["crushed garlic", "garlic powder"],
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
  ["gehackte Mandeln", "Mandeln"],
  ["gehackte Mandeln", "gehobelte Mandeln"],
  ["sliced almonds", "almonds"],
  ["chopped almonds", "sliced almonds"],
  ["fresh yeast", "yeast"],
  ["Ananas in Stücken", "Ananas"],
  ["crushed red pepper", "red pepper"],
  ["crushed tomatoes", "tomatoes"],
  ["frozen spinach", "spinach"],
  ["cooked ham", "ham"],
  ["fine sea salt", "coarse sea salt"],
  ["peeled tomatoes", "tomatoes"],
  ["diced tomatoes", "tomatoes"],
  ["Mandeln, gemahlen", "Mandeln"],
  ["Basilikum, getrocknet", "Basilikum"],
  ["Thunfisch in Öl", "Thunfisch in Wasser"],
  // "von" and "aus" belong to the ingredient.
  ["Saft von 1 Zitrone", "Saft von 2 Orangen"],
  ["Hackfleisch vom Rind", "Hackfleisch vom Schwein"],
  ["Mehl aus Dinkel", "Mehl aus Roggen"],
  ["Salz und Pfeffer", "Salz"],
  // Words after a comma or in brackets count.
  ["Kartoffeln (festkochend)", "Kartoffeln (mehligkochend)"],
  ["festkochende Kartoffeln", "mehligkochende Kartoffeln"],
  ["Reis, Basmati", "Reis, Jasmin"],
  ["Hackfleisch (Rind)", "Hackfleisch (gemischt)"],
  ["Schinken (gekocht)", "Schinken (roh)"],
  ["Petersilie (kraus)", "Petersilie (glatt)"],
  ["Thunfisch (in Öl)", "Thunfisch (in Wasser)"],
  ["Essig (Balsamico)", "Essig (Weißwein)"],
  ["Mehl (vom Bäcker)", "Mehl"],
  ["Butter (gesalzen)", "Butter (ungesalzen)"],
  ["bread flour", "all-purpose flour"],
  ["flour, whole wheat", "flour"],
  ["sugar, brown", "sugar"],
  // German and English are not translated.
  ["Mehl", "flour"],
  ["Zucker", "sugar"],
  ["Ei", "egg"],
  ["flour", "whole wheat flour"],
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
    expect(ingredientKey("Type 405 Weizenmehl")).toBe(ingredientKey("Weizenmehl Type 405"));
  });

  it("compares names without letters only as written", () => {
    expect(ingredientKey("")).toBe("");
    expect(sameIngredient("???", "???")).toBe(true);
    expect(sameIngredient("???", "!!!")).toBe(false);
  });

  it("drops a substitute completely", () => {
    expect(ingredientKey("Butter (oder Margarine)")).toBe(ingredientKey("Butter"));
    expect(ingredientKey("Butter, oder braune Butter")).toBe(ingredientKey("Butter"));
    expect(ingredientKey("Milch (or oat milk)")).toBe(ingredientKey("Milch"));
  });

  it("keeps the kind in the plain name", () => {
    expect(plainName("Zucker, braun, gewaschen")).toBe("Zucker, braun");
    expect(plainName("Milch (3,5 % Fett)")).toBe("Milch, 3,5 % Fett");
    expect(plainName("Mehl, Type 550, gesiebt")).toBe("Mehl, Type 550");
  });

  it("keeps a name made only of state words", () => {
    expect(ingredientKey("frische")).not.toBe("");
    expect(plainName("frische")).toBe("frische");
  });
});

describe("plain name", () => {
  it("drops brackets, comma tail, state and amount words but keeps spelling", () => {
    expect(plainName("gehackte Tomaten, zimmerwarm")).toBe("gehackte Tomaten");
    expect(plainName("fein gehackte Zwiebeln, zimmerwarm")).toBe("Zwiebeln");
    expect(plainName("frische rote Zwiebeln in Würfeln")).toBe("rote Zwiebeln");
    expect(plainName("zimmerwarme Butter")).toBe("Butter");
    expect(plainName("Mehl, gesiebt")).toBe("Mehl");
    expect(plainName("Butter (weich)")).toBe("Butter");
    expect(plainName("geh. Backpulver")).toBe("Backpulver");
    expect(plainName("Salz nach Geschmack")).toBe("Salz");
    expect(plainName("Weizenmehl Type 405")).toBe("Weizenmehl Type 405");
  });

  it("ranks the main spelling and fewer words first", () => {
    expect(nameRank("Mehl")).toBe(1);
    expect(nameRank("Weizenmehl Type 405")).toBe(2);
    expect(nameRank("gehackte Tomaten")).toBe(2);
    expect(nameRank("gehackte Zwiebeln")).toBe(2);
    expect(nameRank("Zwiebel")).toBeLessThan(nameRank("gehackte Zwiebeln"));
    expect(nameRank("Zwiebeln (große)")).toBe(nameRank("Zwiebeln"));
    expect(nameRank("Zucker")).toBeLessThan(nameRank("Kristallzucker"));
    expect(nameRank("Zucker")).toBeLessThan(nameRank("weißer Zucker"));
  });
});

describe("kinds of listed ingredients (#69)", () => {
  it("drops kitchen work after a comma and keeps kinds", () => {
    expect(kindsOf("Zwiebeln, rot, fein gehackt")).toBe("rot");
    expect(kindsOf("Petersilie, frisch, gehackt")).toBe("");
    expect(kindsOf("Thymian, frisch, gehackt")).toBe("frisch");
    expect(kindsOf("Ingwer, gerieben")).toBe("gerieben");
    expect(kindsOf("Knoblauch, zerstoßen")).toBe("");
    expect(kindsOf("Koriander, zerstoßen")).toBe("zerstoßen");
    expect(kindsOf("parsley, dried, chopped")).toBe("dried");
  });
});
