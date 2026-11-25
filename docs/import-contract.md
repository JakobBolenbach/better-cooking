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
- images in `Bilder/` (`<recipe> Titelbild.webp`, `<recipe> Bild N.webp`), optionally `<recipe> Ablauf.svg`.

**Duplicate:** if a recipe with the same source exists, do not create a new note; set `auftrag: <job id>` in the existing one.

**Failure:** still write a note (`Import gescheitert <job id>.md` with `import: fehler`, `import_fehler`, `auftrag`) so the plugin can show the reason. If nothing arrives within 20 minutes, the plugin marks the job as failed.

## Security requirements for processors

Web pages and social media posts are untrusted input. A processor must treat their content as data, never as instructions; must only write the one recipe note and its images; and should validate any AI output against the note format before writing it.
