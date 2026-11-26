# When two ingredients are the same on the shopping list

The shopping list adds up amounts of the same ingredient from different recipes ("200 g Mehl" in recipe A and "300 g Mehl, gesiebt" in recipe B become `- [ ] 500 g Mehl · A, B`). Which names count as the same ingredient is decided by `ingredientKey` in `src/ingredientKey.ts`: two names are the same if their keys are equal. The rules are tested in `tests/ingredientKey.test.ts` with more than thirty pairs that are the same and as many that are not.

## What is ignored

- Case, extra spaces and the order of words ("Type 405 Weizenmehl" equals "Weizenmehl Type 405").
- Brackets and everything in them: "Eier (Größe M)", "Butter (weich)".
- Everything after a comma: "Zwiebel, fein gehackt". A kind written after a comma ("Zucker, braun") is lost this way, so write it in front ("brauner Zucker"). The line's amount and unit are never part of the name.
- Written plurals: "Ei(er)", "Tomate(n)".
- Plural and word endings: Tomate/Tomaten, Zwiebel/Zwiebeln, Ei/Eier, Haselnuss/Haselnüsse, Apfel/Äpfel, egg/eggs, tomato/tomatoes.
- Preparation, state, size and amount words: gehackt, fein, grob, frisch, zimmerwarm, weich, gesiebt, geschmolzen, gewürfelt, gerieben, klein, groß, reif, bio, gestr., geh., ca., chopped, finely, fresh, diced, softened, melted, sifted, sliced, grated, large, small, packed, heaped and similar. The full list is `DROP` in the source.
- "in Scheiben", "in Würfeln", "in slices" and the like.
- A use after "zum", "zur", "für", "nach", "aus", "von", "to", "for", "as", "plus": "Salz nach Geschmack" is "Salz".
- Hyphens inside a word: "Dinkel-Vollkornmehl" is "Dinkelvollkornmehl".
- Fat level written as "3,5 %" and "3.5%", and the word "Fett" next to it.
- Notations of the flour type: "Type 405", "Typ 405", "T405", "Mehl 405".

## What stays part of the identity

Variety and kind words are never dropped, so these are different ingredients: Dinkelmehl, Weizenmehl, Roggenmehl, Weizenvollkornmehl; Type 405, 550 and 1050; brauner and weißer Zucker, Puderzucker, Vanillezucker; Eigelb and Eiweiß; rote Zwiebel and Zwiebel; Meersalz and Salz; getrocknetes and frisches Basilikum (frisch is dropped, getrocknet is not, so "frisches Basilikum" is "Basilikum"); gemahlene Mandeln and Mandeln; Thunfisch in Öl and in Wasser.

Fat levels stay apart: Milch, Vollmilch (also "Milch 3,5 %"), fettarme Milch (also "Milch 1,5 %") and Milch 1,5 % are different lines. The same holds for Sahne/Schlagsahne and Joghurt/Naturjoghurt where the table does not join them.

A plain "Mehl" is not "Weizenmehl": the list does not guess which flour is meant. Compound words are different words, so "Weizenmehl" is also not "Mehl" (stores still match compounds by their last word, see "Stores" above).

## Synonyms

A small table (`SYNONYMS` in the source) joins names for the same thing, for example Zucker = Kristallzucker = weißer Zucker, Ei = Hühnerei, Möhre = Karotte, Salz = Speisesalz = Kochsalz, Pfeffer = schwarzer Pfeffer, sugar = granulated sugar, powdered sugar = icing sugar, zucchini = courgette. Words are never translated: "Mehl" and "flour" stay two lines.

## Merged lines

Amounts are added up only for units that add up: g with kg, ml with l, EL with EL, TL with TL, pieces and amounts without a unit. Spoons are never added to weights; such an ingredient stays on two lines. The merged line shows the plainest name: the main spelling of a synonym group ("Zucker" before "Kristallzucker"), then the name with fewer words, with preparation words removed ("Zwiebeln" from "gehackte Zwiebeln"). A plural is kept when the amount is above 1.

## Amount per recipe

The note only holds `- [ ] 500 g Mehl · A, B`. How much each recipe needs is not stored, because the note would get unreadable and could disagree with the recipes when they change. `recipeShares` in `src/shoppingShares.ts` calculates it again from the recipes named on the line (their ingredients, the servings factor and the ingredients skipped as already there). Known limits: a recipe added twice counts once in the shares but twice in the line; a recipe edited after adding shows the new amounts.
