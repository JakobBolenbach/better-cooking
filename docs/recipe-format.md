# Recipe note format

Better Cooking reads every Markdown file directly in the recipe folder (setting "Rezeptordner", default `Recipes/`) except `AGENTS.md` and `README.md`. Images live in the subfolder `Bilder/`; "Fetch again" keeps old versions of a note in `Vorversionen/` (not read as recipes; they carry `vorversion: "[[Recipe]]"` or `previous_version: …` so queries can leave them out). Examples: [tests/fixtures/](../tests/fixtures/).

## Frontmatter

The setting "Note format" (German or English) decides which names and values Better Cooking writes. Reading always accepts both, also mixed within one collection, plus the user's own names from "Own field names". When the plugin changes an existing note, it keeps the field name and status language the note already uses.

| Field id (own names)         | German                        | English                      | Meaning                                                                                                               |
| ---------------------------- | ----------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `type`                       | `typ: rezept`                 | `type: recipe`               | marks a recipe note                                                                                                   |
| `status`                     | `status`                      | `status`                     | `ausprobieren` / `to-try`, `bewaehrt` / `proven`, `verworfen` / `discarded`                                           |
| `category`                   | `kategorie`                   | `category`                   | free text, e.g. `Brot`                                                                                                |
| `source`                     | `quelle`                      | `source`                     | link to the original recipe; used for duplicate detection                                                             |
| `author`                     | `autor`                       | `author`                     | original author                                                                                                       |
| `image`                      | `bild`                        | `image`                      | cover image, `"[[Name.webp]]"`; otherwise the first image embed in the note                                           |
| `yield`                      | `ergebnis`                    | `yield`                      | yield, e.g. `9 Brötchen` or `for 4 people`; a number here drives the servings calculator                              |
| `servings`                   | `portionen`                   | `servings`                   | number of servings, only if the yield contains no number                                                              |
| `timeActive`, `timeTotal`    | `zeit_aktiv`, `zeit_gesamt`   | `time_active`, `time_total`  | minutes                                                                                                               |
| `rating`                     | `bewertung`                   | `rating`                     | 1 to 5                                                                                                                |
| `lastMade`                   | `zuletzt_gemacht`             | `last_made`                  | `YYYY-MM-DD`                                                                                                          |
| `importState`, `importError` | `import`, `import_fehler`     | `import`, `import_error`     | `offen`, `fertig` / `done`, `teilweise` / `partial`, `fehler` / `failed` plus a one-line reason; written by importers |
| `job`                        | `auftrag`                     | `job`                        | ID of the import job that created the note; written by processors                                                     |
| `created`, `updated`         | `erstellt`, `aktualisiert`    | `created`, `updated`         | `YYYY-MM-DD`                                                                                                          |
| `translationOf`, `language`  | `uebersetzung_von`, `sprache` | `translation_of`, `language` | only in translations: link to the original note and the translation's language (issue #10)                            |

"Own field names" takes one `fieldId: name` per line, for example `category: tags` to use an existing `tags` field as the category. Names may contain letters, digits, `_` and `-`.

Notes created by the plugin also get the properties from the setting "Extra properties" (one `name: value` per line, for example `context: private`), always as quoted strings. Fields from the table above (in either language or under an own name) cannot be set that way.

## Sections

| Heading              | Content                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `# Title`            | recipe name                                                                                                                    |
| text below the title | short description (first paragraph)                                                                                            |
| `## Ablauf`          | timeline graphic as an SVG embed                                                                                               |
| `## Zutaten`         | bullet list; groups start with a bold line (`**Teig**`) or `### Teig`; a group named `Ausstattung` (equipment) is never scaled |
| `## Schritte`        | numbered list, `1. **Short title (10 Min.):** what to do`; durations become timers                                             |
| `## Tipps`           | bullet list                                                                                                                    |
| `## Bilder`          | further image embeds                                                                                                           |
| `## Versuche`        | attempts, newest first, each starting with `### DD.MM.YYYY`                                                                    |
| `## Notizen`         | bullet list                                                                                                                    |

Imports write the steps for cooking mode (issue #62): one step per action or waiting time, with a short title and its duration. Long instructions on a website or in pasted text are split by simple rules (sentence ends, "dann"/"anschließend", waiting times such as "30 Minuten gehen lassen" as steps of their own; abbreviations such as "ca." or "z. B." and decimals do not end a sentence). The title is the verb the text itself contains ("Trennen", "Steif schlagen", "Gehen lassen (30 Min.)"), the duration comes from the text, and where the rules are unsure there is no title. A `HowToStep` name stays the title. With several sections, the name of a `HowToSection` goes in front of the titles (`Teig – Kneten (10 Min.)`) because steps have no groups in a note; with only one section, or a name such as "Zubereitung" or "Instructions", there is no prefix, and an action without a verb gets no title. Imports are limited to 150 ingredients and 80 steps; if more were cut, the note is marked `teilweise` with the reason. Ingredient groups of pasted text ("Für den Teig:") and of an own AI's answer become `**Group**` lines.

Missing sections are allowed. English section names are read as well, also mixed with German ones in one note:

| German     | Also accepted                                                                       |
| ---------- | ----------------------------------------------------------------------------------- |
| `Ablauf`   | `Timeline`                                                                          |
| `Zutaten`  | `Ingredients`                                                                       |
| `Schritte` | `Steps`, `Instructions`, `Directions`, `Method`, `Zubereitung`                      |
| `Tipps`    | `Tips`                                                                              |
| `Bilder`   | `Images`, `Photos`                                                                  |
| `Versuche` | `Attempts` (new attempts are inserted there, with labels in the section's language) |
| `Notizen`  | `Notes`                                                                             |

In the head, `**Yield:**`, `**Servings:**`, `**Active:**`, `**Total:**` and `Source:` lines are skipped like their German counterparts when the description is read. New notes get the headings of the note format setting.

## Shopping list

"Add to shopping list" on a recipe page writes the recipe's ingredients (for the servings shown, without equipment groups and without the ingredients you checked on the page because you already have them) into one plain Markdown note, by default `Einkaufsliste.md` or `Shopping list.md` at the top of the vault (setting "Shopping list"). Each item is a checkbox line:

```markdown
- [ ] 1,5 kg Weizenmehl Type 550 · Sauerteigbrot, Brötchen
- [ ] 3 Zwiebeln · Linsensuppe
- [x] Salz
```

Amount and unit come first, the recipes after `·`. An open item with the same name and a unit that can be added up (g and kg, ml and l, TL, EL, pieces) is updated instead of added twice; checked items are never changed. Check items off in Obsidian as usual; the command "Shopping list: remove checked items" clears them after shopping.

With the setting "Stores" (one line per store, e.g. `Rewe: Mehl, Milch` or `dm: Backpapier`), new items go into a section per store (`## Rewe`), matched by the words (also at the end of compound words: "Weizenmehl" goes where "Mehl" goes). Items without a store stay above the first section. If an item with the same name is already on the list, also checked, a new one goes into the same section, so moving an item under a store by hand teaches the list where it belongs. Lines that are not checkboxes stay untouched, so you can add your own headings and notes.

## Meal plan

"Plan" on a recipe page adds it to one of the next seven days in one Markdown note, by default `Wochenplan.md` or `Meal plan.md` at the top of the vault (setting "Meal plan"):

```markdown
## 2026-11-30 · Monday

- [[Red Lentil Soup]] · 4 servings
- [[Focaccia]]
```

Each day is a level-2 heading starting with its date (`YYYY-MM-DD`), so days stay sorted in any language; new days are inserted in date order. Each entry is a link to the recipe note, optionally followed by `·` and the planned servings. You can add entries, notes and other headings by hand; the plugin only adds day headings and entry lines.

The command "Meal plan: next 7 days to the shopping list" adds the ingredients of everything planned for today and the next six days, scaled to the planned servings. "Export meal plan as calendar file (.ics)" writes `Meal plan.ics` next to the plan with one all-day event per entry, for importing into a calendar.

## Translations

With your own AI set up, "Translate" on a recipe page writes a translation as a new note in the recipe folder, linked to the original by `translation_of: "[[Original]]"` and `language: "English"`. The AI translates title, description, yield, category, ingredient groups, steps and tips; the answer must have the same number of groups, ingredients and steps or it is refused. Quantities, times, the source and the cover image stay. The original is not changed. Translations do not appear as separate cards in the overview; the recipe page shows the original and its translations as a language switch.
