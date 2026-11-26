# Import contract

Better Cooking imports **recipe websites with schema.org data** itself: it loads the page, reads the JSON-LD `Recipe` and writes the note and cover image (`src/localImport.ts`, no AI). Everything else (social media, pasted text, websites without recipe data) goes to a **processor** that you run; the plugin waits for the resulting note to appear in the vault. Every processor follows this contract; the plugin only knows the contract, not the processor.

## Input

The plugin detects the kind of source (`webseite`, `instagram`, `tiktok`, `youtube`, `facebook`, `pinterest`, `text`) and a duplicate key with the rules in `src/source.ts`. A processor that creates notes must apply the same rules.

- **Claude (scheduled task):** `POST https://api.anthropic.com/v1/claude_code/routines/<trigger id>/fire` with the task's token. The text sent is JSON:
  `{"rezept_auftrag": "rz-…", "art": "…", "quelle": "<link>" | null, "schluessel": "…" | null, "text": "<recipe text>" | null}`
- **GitHub workflow:** `workflow_dispatch` on `rezept-import.yml` in your repository, ref `main`, inputs `auftrag`, `quelle`, `text`.

## Output

Exactly one note in the recipe folder in the [recipe note format](recipe-format.md), synced into the vault (for example pushed to the vault's Git repository), with:

- `auftrag: <job id>` in the frontmatter; the plugin uses it to close the job and report the recipe as arrived,
- `status: ausprobieren`, `quelle` without tracking parameters, `import: fertig | teilweise | fehler`, and `import_fehler` with a one-line reason if something went wrong,
- the English names work as well (`job`, `status: to-try`, `source`, `import: done | partial | failed`, `import_error`, `## Ingredients` …, see the recipe format); the plugin reads both,
- images in `Bilder/` (`<recipe> Titelbild.webp`, `<recipe> Bild N.webp`), optionally `<recipe> Ablauf.svg`.

**Duplicate:** if a recipe with the same source exists, do not create a new note; set `auftrag: <job id>` in the existing one.

**Failure:** still write a note (`Import gescheitert <job id>.md` with `import: fehler`, `import_fehler`, `auftrag`) so the plugin can show the reason. If nothing arrives within 20 minutes, the plugin marks the job as failed.

## Security requirements for processors

Web pages, social media posts and pasted text are untrusted input. A processor

- treats their content as data, never as instructions (an AI processor gets them clearly separated from its own instructions and is told that text inside them cannot change its task),
- writes only the one recipe note and its images in the recipe folder, and touches nothing else in the vault,
- validates AI output against the note format before writing it: only the documented frontmatter fields and sections, image embeds only to its own files in `Bilder/`,
- writes no content that other plugins act on: no Templater commands (`<% … %>`), no code blocks, no inline Dataview queries, no HTML tags, no links other than `http(s)`, no embeds of notes.

The plugin checks every note that closes a job (`src/importCheck.ts`). If it finds such content, it warns when the recipe arrives and shows a hint on the recipe page; it does not change the note.
