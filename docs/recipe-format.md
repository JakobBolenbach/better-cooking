# Recipe note format

Better Cooking reads every Markdown file directly in the recipe folder (setting "Rezeptordner", default `Recipes/`) except `AGENTS.md` and `README.md`. Images live in the subfolder `Bilder/`. Examples: [tests/fixtures/](../tests/fixtures/).

## Frontmatter

The setting "Note format" (German or English) decides which names and values Better Cooking writes. Reading always accepts both, also mixed within one collection, plus the user's own names from "Own field names". When the plugin changes an existing note, it keeps the field name and status language the note already uses.

| Field id (own names)         | German                      | English                     | Meaning                                                                                                               |
| ---------------------------- | --------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `type`                       | `typ: rezept`               | `type: recipe`              | marks a recipe note                                                                                                   |
| `status`                     | `status`                    | `status`                    | `ausprobieren` / `to-try`, `bewaehrt` / `proven`, `verworfen` / `discarded`                                           |
| `category`                   | `kategorie`                 | `category`                  | free text, e.g. `Brot`                                                                                                |
| `source`                     | `quelle`                    | `source`                    | link to the original recipe; used for duplicate detection                                                             |
| `author`                     | `autor`                     | `author`                    | original author                                                                                                       |
| `image`                      | `bild`                      | `image`                     | cover image, `"[[Name.webp]]"`; otherwise the first image embed in the note                                           |
| `yield`                      | `ergebnis`                  | `yield`                     | yield, e.g. `9 Brötchen` or `for 4 people`; a number here drives the servings calculator                              |
| `servings`                   | `portionen`                 | `servings`                  | number of servings, only if the yield contains no number                                                              |
| `timeActive`, `timeTotal`    | `zeit_aktiv`, `zeit_gesamt` | `time_active`, `time_total` | minutes                                                                                                               |
| `rating`                     | `bewertung`                 | `rating`                    | 1 to 5                                                                                                                |
| `lastMade`                   | `zuletzt_gemacht`           | `last_made`                 | `YYYY-MM-DD`                                                                                                          |
| `importState`, `importError` | `import`, `import_fehler`   | `import`, `import_error`    | `offen`, `fertig` / `done`, `teilweise` / `partial`, `fehler` / `failed` plus a one-line reason; written by importers |
| `job`                        | `auftrag`                   | `job`                       | ID of the import job that created the note; written by processors                                                     |
| `created`, `updated`         | `erstellt`, `aktualisiert`  | `created`, `updated`        | `YYYY-MM-DD`                                                                                                          |

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

Amount and unit come first, the recipes after `·`. An open item with the same name and a unit that can be added up (g and kg, ml and l, TL, EL, pieces) is updated instead of added twice; checked items are never changed. Check items off in Obsidian as usual. Lines that are not checkboxes stay untouched, so you can add your own headings and notes.
