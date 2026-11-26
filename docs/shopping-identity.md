# When two ingredients are the same on the shopping list

The shopping list adds up amounts of the same ingredient from different recipes ("200 g Mehl" in recipe A and "300 g Mehl, gesiebt" in recipe B become `- [ ] 500 g Mehl · A, B`). Which names count as the same ingredient is decided by `ingredientKey` in `src/ingredientKey.ts`: two names are the same if their keys are equal. The rules are tested in `tests/ingredientKey.test.ts` with more than thirty pairs that are the same and as many that are not.

The rule of thumb: different products must never fall together. When in doubt, the list shows two lines rather than one wrong line.

## What is ignored

- Case, extra spaces, the order of words ("Type 405 Weizenmehl" equals "Weizenmehl Type 405", "Pfeffer schwarz" equals "schwarzer Pfeffer").
- State without a product of its own, anywhere in the name: gesiebt, zimmerwarm, Zimmertemperatur, weich, geschmolzen, zerlassen, flüssig, kalt, warm, klein, groß, reif, bio ("Bio-Eier" are "Eier"), gestr., geh., ca., optional, sifted, softened, melted, room temperature, large, small, ripe, organic and similar (`NOISE_WORDS` in the source).
- Written plurals and endings (also declined kinds and participles: "rote Zwiebel" = "Zwiebel, rot", "gemahlener Zimt" = "Zimt, gemahlen"; but gemahlen is not ganz): "Ei(er)", Tomate/Tomaten, Zwiebel/Zwiebeln, Ei/Eier, Haselnuss/Haselnüsse, egg/eggs, tomato/tomatoes; umlauts and "ß" are folded.
- Hyphens inside a word: "Dinkel-Vollkornmehl" is "Dinkelvollkornmehl".
- The spelling of fat levels ("3,5 %", "3.5%") and the word "Fett" next to it, and of flour types: "Type 405", "Typ 405", "T405", "Mehl 405".
- A use after "zum", "zur", "für", "nach", "to", "for", "as", "plus": "Salz nach Geschmack" is "Salz". "von", "vom" and "aus" are not a use but part of the ingredient ("Saft von Zitronen", "Hackfleisch vom Rind", "Mehl aus Dinkel").

## Kitchen work and product words

Two kinds of words describe how an ingredient is prepared.

- **Kitchen work** that does not change what is bought: gehackt, gewürfelt, geschnitten, gerieben, geraspelt, verquirlt, geputzt, zerkleinert, gepresst, zerdrückt, halbiert, chopped, diced, minced, beaten, grated, trimmed, divided (`KITCHEN_WORDS` in `src/ingredientWords.ts`). In front of the noun it counts ("gehackte Zwiebeln" and "Zwiebeln" are two lines), after a comma or in brackets it is ignored ("Zwiebeln, gehackt" is "Zwiebeln"). "fein", "grob", "dünn", "thinly" and similar directly in front of such a word are adverbs and fall away with it: "Zwiebeln, fein gehackt" and "fein gehackte Zwiebeln" are the same as "Zwiebeln, gehackt" and "gehackte Zwiebeln".
- **Product words** make another product and count everywhere: TK, tiefgekühlt, frozen, gekocht, cooked, geschält, peeled, grob, fein, coarse, fine, leicht, gehobelt, sliced, crushed, geräuchert, smoked, püriert, entkernt, frisch, fresh. So "gehackte", "geschälte" and plain "Tomaten" are three lines, as are TK-Spinat and Spinat, gekochter Schinken and Schinken, grobes and feines Meersalz, "almonds, sliced" and "almonds", "fresh yeast" and "yeast", "Ananas in Stücken" and "Ananas". As a prefix of a hyphenated word a product word is a word of its own: "TK-Erbsen" = "TK Erbsen" = "Erbsen (TK)", not "Erbsen".

## What stays part of the identity

Variety and kind words are never dropped, so these are different ingredients: Dinkelmehl, Weizenmehl, Roggenmehl, Weizenvollkornmehl; Type 405, 550 and 1050; brauner and weißer Zucker, Puderzucker, Vanillezucker; Eigelb and Eiweiß; rote Zwiebel and Zwiebel; Meersalz and Salz; getrocknetes and frisches Basilikum (frisch is a product word); gemahlene Mandeln and Mandeln; Thunfisch in Öl and in Wasser; Kräuter and Kraut.

Fat levels stay apart: Milch, Vollmilch (also "Milch 3,5 %"), fettarme Milch (also "Milch 1,5 %") and Milch 1,5 % are different lines.

A plain "Mehl" is not "Weizenmehl": the list does not guess which flour is meant. Compound words are different words, so "Weizenmehl" is also not "Mehl" (stores still match compounds by their last word, see "Stores" above, after a prefix of three letters or more: "Reis" is not "Eis").

## Synonyms

A small table (`SYNONYMS` in the source) joins names for the same thing, for example Zucker = Kristallzucker = weißer Zucker, Ei = Hühnerei, Möhre = Karotte, Salz = Speisesalz = Kochsalz, Pfeffer = schwarzer Pfeffer, sugar = granulated sugar, powdered sugar = icing sugar, zucchini = courgette. Words are never translated: "Mehl" and "flour" stay two lines.

## Merged lines

Amounts are added up only for units that add up: g with kg, ml with l, EL with EL, TL with TL, Päckchen with Pck. and Pkg, pieces and amounts without a unit. Spoons are never added to weights; such an ingredient stays on two lines. A German noun ending in a unit word is split: "2 Knoblauchzehen" is "2 Zehen Knoblauch" (also Scheibe, Zweig, Dose).

The name of the line already on the list stays as it is, also when you edited it by hand. It changes only to the main spelling of a synonym group ("Zucker" instead of "Kristallzucker", written without state words) and to the plural for counted things when the amount is above 1 ("1 Zwiebel" and "1 Zwiebel" are "2 Zwiebeln", "1 Apfel" and "2 Äpfel" are "3 Äpfel"; English adds -s; words the rules do not know stay). A new line is written without state and use words ("weiche Butter" is "Butter").

## Amount per recipe

The note only holds `- [ ] 500 g Mehl · A, B`. Amounts per recipe are not stored and not calculated by the plugin yet (follow-up issue): they depend on the servings each recipe was added with and on the ingredients skipped as already there, which the note does not keep.
