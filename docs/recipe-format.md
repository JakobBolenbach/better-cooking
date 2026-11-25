# Recipe note format

Better Cooking reads every Markdown file directly in the recipe folder (setting "Rezeptordner", default `Recipes/`) except `AGENTS.md` and `README.md`. Images live in the subfolder `Bilder/`. Examples: [tests/fixtures/](../tests/fixtures/).

## Frontmatter

| Field                       | Meaning                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `status`                    | `ausprobieren` (to try), `bewaehrt` (tried and tested), `verworfen` (discarded)            |
| `kategorie`                 | free text, e.g. `Brot`                                                                     |
| `quelle`                    | link to the original recipe; used for duplicate detection                                  |
| `autor`                     | original author                                                                            |
| `bild`                      | cover image, `"[[Name.webp]]"`; otherwise the first image embed in the note                |
| `ergebnis`                  | yield, e.g. `9 Brötchen` or `für 4 Personen`; a number here drives the servings calculator |
| `portionen`                 | number of servings, only if `ergebnis` contains no number                                  |
| `zeit_aktiv`, `zeit_gesamt` | minutes                                                                                    |
| `bewertung`                 | 1 to 5                                                                                     |
| `zuletzt_gemacht`           | `YYYY-MM-DD`                                                                               |
| `import`, `import_fehler`   | `offen`, `fertig`, `teilweise`, `fehler` plus a one-line reason; written by processors     |
| `auftrag`                   | ID of the import job that created the note; written by processors                          |
| `erstellt`, `aktualisiert`  | `YYYY-MM-DD`                                                                               |

Notes created by the plugin also get the properties from the setting "Zusätzliche Eigenschaften" (one `name: value` per line, for example `kontext: privat`), always as quoted strings. Fields from the table above cannot be set that way.

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

| German     | Also accepted                                                  |
| ---------- | -------------------------------------------------------------- |
| `Ablauf`   | `Timeline`                                                     |
| `Zutaten`  | `Ingredients`                                                  |
| `Schritte` | `Steps`, `Instructions`, `Directions`, `Method`, `Zubereitung` |
| `Tipps`    | `Tips`                                                         |
| `Bilder`   | `Images`, `Photos`                                             |
| `Versuche` | `Attempts` (new attempts are inserted there)                   |
| `Notizen`  | `Notes`                                                        |

In the head, `**Yield:**`, `**Servings:**`, `**Active:**`, `**Total:**` and `Source:` lines are skipped like their German counterparts when the description is read. Frontmatter field names are German only; a mapping in the settings is planned (#1).
