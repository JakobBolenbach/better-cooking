# 0009: Ingredients per step are written explicitly

- Status: Accepted
- Date: 2026-11-28
- Decided by: Jakob Bolenbach

## Context

Cooking mode shows the ingredients of the current step ("In this step"). Until now the plugin guessed them at display time from the words of the step (`ingredientsInStep`, #153); nothing was stored in the note. An inspection of all 11 recipes of a real vault (#162) found six classes of errors:

1. The same ingredient in several groups without a cue in the step (a dough and a glaze that both take egg white, salt and icing sugar): both groups are shown.
2. Adjectives and descriptors hit ("cold" for "cold water", "fresh chives" for "fresh yeast").
3. Compounds for intermediates hit their parts ("Hefewasser" for water and yeast, "Knoblauch-Dip" for garlic).
4. Mere mentions ("a cup of water in the oven" shows the dough water).
5. Misses ("Öl" does not find "Olivenöl extra vergine").
6. Partial amounts (90 % of the water in step 1, the rest in step 2) cannot be shown at all.

Because the assignment lives nowhere in the note, a hint to a processor (#120) cannot correct it and the user cannot fix it by hand. Better guessing helps with classes 1 to 5 but never completely, and never with 6.

## Decision

A step may carry an explicit list of its ingredients as an indented line directly under the step, as part of the step:

```markdown
1. **Glasur:** Eiweiß mit Salz verrühren.
   - Zutaten: Eiweiß (Glasur), Salz (Glasur), 285 g Wasser
```

- The keyword is `Zutaten:` or `Ingredients:`; both are read in every note, the plugin writes the one of the note's language. Items are separated by commas; a comma inside brackets (`Salz (Glasur, fein)`) or between two digits (`1,5 EL Öl`) does not separate (`Mehl,Wasser,Salz` is three items). The indent may be anything (two to four spaces, a tab); a line directly under the step without an indent is accepted too. Several lines of one step are one list. The same item may be in several steps. An item is an ingredient name as in the ingredient list, without the amount; optionally with an own amount in front for a partial use (`285 g Wasser`); optionally with the group in brackets at the end if the name occurs in several groups (`Salz (Glasur)`). A bracket names a group if it equals the title of a group (ignoring case and Unicode form) or a whole word of it (`Arbeitsfläche` for "Für die Arbeitsfläche"); any other bracket is no group. An item without an exact name match is matched by its head word inside the named group. An item without a group whose name is in several groups goes to the group the nearest steps use unambiguously.
- **A recipe with at least one such line is explicit as a whole**: a step without a line has no ingredients (nothing is guessed). A processor therefore writes lines only for steps that use ingredients, not for "let rest" or "preheat". `Zutaten: keine` / `Ingredients: none` (also an empty `Zutaten:`) says "no ingredients" explicitly, for a recipe in which nothing would be shown at all. Guessing remains only for recipes where no step has a line (all notes written before this decision).
- Resolution: an item is matched to the ingredient lines of the recipe by the name key of the shopping identity (`nameKey`, [docs/shopping-identity.md](../shopping-identity.md)), limited to the named group; without a group every line of that name matches. An item with an own amount is shown with that amount (scaled with the servings), an item that is no ingredient of the list is shown as written.
- The line is a hanging line of its step (as for any other indented line the reader joins to the step), but it is not part of the step's text: the recipe page shows it as a small line "Zutaten: …" below the step, cooking mode as "In this step". In Obsidian's reading view it is a sub-item (intended).
- Writers: the plugin's own AI import, "Fetch again with a hint" and feedback with the own AI, and translations write and keep it; processors (Claude skill, GitHub action) are asked to write it (contract: optional, recommended); the recipe editor edits it per step (a field "Ingredients in this step"). Only a changed line is written. An AI's answer is untrusted like the rest: items are plain lines, at most 20 of 80 characters per step (also when a note is read back for a writer), defused when written, never read from a web page.
- Fingerprint ([ADR 0006](0006-hand-edits-and-the-import-fingerprint.md)): the line belongs to the steps section and is hashed with it like every other line, so a hand edit of it protects the steps. No change of the format of the fingerprint was needed: it hashes the lines of the section, and the line is one of them. "Fetch again", improvements and the section comparison take it as part of the steps.

## Consequences

- The assignment is data of the note: it can be corrected by hand, by the editor, by feedback, and it is the same on every device.
- Partial amounts can be shown (class 6) and wrong guesses are avoided by writing the list (classes 1 to 5) where it matters.
- A user who adds a line to one step of an old recipe switches the whole recipe from guessing to explicit: the other steps then show no ingredients until they get a line. The editor says so in the dialog.
- Mixed versions: a version without this reader joins the line into the text of its step ("Text - Zutaten: A, B") and shows it there; if it saves the step from its editor the line stays in the text. This version does not repair that silently: text after the first words of a step is text, and a line is only a line under a step. Instead the plugin never writes the pattern ` - Zutaten:` / ` - Ingredients:` in the middle of a step's text (imports, translations, proposals and the editor put an invisible character in front of the colon), so such a text can never become a list by accident. A processor or a version that does not know the line never removes it from a note it does not rewrite. A new version of the steps (an improvement proposal, "Fetch again") takes over the lines of the note only if it has none itself and every step of the note with a line has exactly one new step that is clearly the same (similar text, each new step used once; the position only decides between equally similar ones). Otherwise all old lines go and the recipe is guessed again, never half explicit.
- An import never writes an empty list: "no items" from an AI is "not given" and writes nothing; "none" is kept only where a note says it (improvements, translations).
- The editor: while typing nothing is filled in, the dialog only says whether the ingredients are guessed, will be guessed for the other steps on saving, or hold for all steps. On saving, a recipe that had no lines and now has at least one own entry gets the guessed list (as names) in the steps without one, so no step turns empty. An entry typed and deleted again changes nothing. Removing the last list returns to guessing.
- Limit: two ingredient lines of the same name in one group ("1 EL Zucker", "2 EL Zucker") are both shown for an item with that name.
- An imported step that is split in several cooking steps (the splitting rules of #62) gives its list to the first part.
- The reading view and Dataview see one more list level in the steps.
- Processors that do not know the line keep working: their notes are guessed as before.
- The guessing of the fallback is improved separately (#162, second part); it is only used for notes without any line: a name in several groups that the step leaves open goes to the group the nearest steps use unambiguously (the step before first); in German text lower-case words are no hits (except verbs made of an ingredient word: "salzen", "pfeffern", "mehlen", "ölen"), unless the recipe is written in lower case throughout (decided once per recipe from its ingredient names and step texts, not per step), and descriptors of an ingredient name (lower-case adjectives in front of the noun, English "fresh", "ground" …) do not count; a compound that begins with an ingredient word is no hit for it only if it ends in a known intermediate ("Hefewasser", "Zuckerguss", "Knoblauch-Dip", "Gemisch", "Sauce" …) or in another ingredient of the recipe ("Zimtzucker"); shapes and measures ("Knoblauchzehen", "Rosmarinzweigen", "Butterflocken", "Zitronensaft") name the same thing; trailing additions of a name ("Olivenöl extra vergine") are cut for the head word. The data of the ingredients is prepared once per recipe. A mere mention ("a cup of water in the oven") is still guessed wrong; only an explicit line fixes it.

## Alternatives considered

- **Only improve the guessing.** Cannot solve partial amounts and never gets class 1 right without a cue in the step. Kept as the fallback.
- **Frontmatter or a separate section for the assignment.** Away from the step, so it is not edited with it, shifts when steps are moved and does not read well in Obsidian. Rejected.
- **A line for every step.** Forces processors to write empty lines for waiting steps; one explicit line per recipe is enough to switch the mode.
