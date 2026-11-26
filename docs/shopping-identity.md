# When two ingredients are the same on the shopping list

The shopping list adds up amounts of the same ingredient from different recipes ("200 g Mehl" in recipe A and "300 g Mehl, gesiebt" in recipe B become `- [ ] 500 g Mehl · A, B`). Which names count as the same ingredient is decided by `ingredientKey` in `src/ingredientKey.ts`: two names are the same if their keys are equal. The rules are tested in `tests/ingredientKey.test.ts` with more than thirty pairs that are the same and as many that are not.

The rule of thumb: different products must never fall together. When in doubt, the list shows two lines rather than one wrong line.

## What is ignored

- Case, extra spaces, the order of words ("Type 405 Weizenmehl" equals "Weizenmehl Type 405", "Pfeffer schwarz" equals "schwarzer Pfeffer").
- Kitchen work and state without a product of its own, anywhere in the name: gesiebt, zimmerwarm, weich, geschmolzen, zerlassen, flüssig, kalt, warm, klein, groß, reif, bio ("Bio-Eier" are "Eier"), gestr., geh., ca., optional, sifted, softened, melted, room temperature, large, small, ripe, organic and similar. The full list is `NOISE` in the source.
- Written plurals and endings: "Ei(er)", Tomate/Tomaten, Zwiebel/Zwiebeln, Ei/Eier, Haselnuss/Haselnüsse, egg/eggs, tomato/tomatoes; umlauts and "ß" are folded.
- Hyphens inside a word: "Dinkel-Vollkornmehl" is "Dinkelvollkornmehl".
- The spelling of fat levels ("3,5 %", "3.5%") and the word "Fett" next to it, and of flour types: "Type 405", "Typ 405", "T405", "Mehl 405".
- A use after "zum", "zur", "für", "nach", "to", "for", "as", "plus": "Salz nach Geschmack" is "Salz". "von", "vom" and "aus" are not a use but part of the ingredient ("Saft von Zitronen", "Hackfleisch vom Rind", "Mehl aus Dinkel").

## Preparation words

Words such as gehackt, geschält, püriert, gekocht, tiefgekühlt/TK, leicht, grob, fein, frisch, entkernt, gehobelt, chopped, crushed, diced, peeled, sliced, frozen, cooked, fine, coarse, fresh (`PREP` in the source) can make another product. In front of the noun they count: "gehackte Tomaten", "geschälte Tomaten" and "Tomaten" are three ingredients, as are TK-Spinat and Spinat, gekochter Schinken and Schinken, grobes and feines Meersalz, "Ananas in Stücken" and "Ananas". After a comma or in brackets they are ignored: "Zwiebeln, gehackt" is "Zwiebeln", "Zitronen, in Scheiben" is "Zitronen". So "gehackte Zwiebeln" and "Zwiebeln, gehackt" are two lines.

## Words after a comma or in brackets

Everything there counts, except the words above (noise, preparation, "in Scheiben" and the like), a few fillers (Größe, M, L, und, units such as g, EL, Stück) and plain numbers like "(400 g)": "Kartoffeln (festkochend)" and "(mehligkochend)" are two lines, as are "Reis, Basmati" and "Reis, Jasmin", "Schinken (gekocht)" and "Schinken (roh)", "Petersilie (kraus)" and "(glatt)", "Thunfisch (in Öl)" and "(in Wasser)", "Tomaten (Dose)" and "Tomaten (Glas)". Percent values count: "Milch (3,5 % Fett)" is "Milch 3,5 %" and "Vollmilch"; "Sahne (30 %)" is not "Sahne (10 %)". A number of three or four digits right behind flour is its type: "Weizenmehl (405)" is "Weizenmehl Type 405" and not "(550)".

A bracket or a comma part with "oder" / "or" names a substitute and is dropped completely: "Butter (oder Margarine)" is "Butter".

The line on the list keeps the kinds after a comma: "100 g Zucker, braun".

## What stays part of the identity

Variety and kind words are never dropped, so these are different ingredients: Dinkelmehl, Weizenmehl, Roggenmehl, Weizenvollkornmehl; Type 405, 550 and 1050; brauner and weißer Zucker, Puderzucker, Vanillezucker; Eigelb and Eiweiß; rote Zwiebel and Zwiebel; Meersalz and Salz; getrocknetes and frisches Basilikum; gemahlene Mandeln and Mandeln; Thunfisch in Öl and in Wasser; Kräuter and Kraut.

Fat levels stay apart: Milch, Vollmilch (also "Milch 3,5 %"), fettarme Milch (also "Milch 1,5 %") and Milch 1,5 % are different lines.

A plain "Mehl" is not "Weizenmehl": the list does not guess which flour is meant. Compound words are different words, so "Weizenmehl" is also not "Mehl" (stores still match compounds by their last word, see "Stores" above, after a prefix of three letters or more: "Reis" is not "Eis").

## Synonyms

A small table (`SYNONYMS` in the source) joins names for the same thing, for example Zucker = Kristallzucker = weißer Zucker, Ei = Hühnerei, Möhre = Karotte, Salz = Speisesalz = Kochsalz, Pfeffer = schwarzer Pfeffer, sugar = granulated sugar, powdered sugar = icing sugar, zucchini = courgette. Words are never translated: "Mehl" and "flour" stay two lines.

## Merged lines

Amounts are added up only for units that add up: g with kg, ml with l, EL with EL, TL with TL, Päckchen with Pck. and Pkg, pieces and amounts without a unit. Spoons are never added to weights; such an ingredient stays on two lines. A German noun ending in a unit word is split: "2 Knoblauchzehen" is "2 Zehen Knoblauch" (also Scheibe, Zweig, Dose).

The name of the line already on the list stays as it is, also when you edited it by hand. It changes only to the main spelling of a synonym group ("Zucker" instead of "Kristallzucker", written without state words) and to the plural when the amount is above 1 ("3 Zwiebeln"). A new line is written without state and use words ("weiche Butter" is "Butter").

## Amount per recipe

The note only holds `- [ ] 500 g Mehl · A, B`. Amounts per recipe are not stored and not calculated by the plugin yet (follow-up issue): they depend on the servings each recipe was added with and on the ingredients skipped as already there, which the note does not keep.
