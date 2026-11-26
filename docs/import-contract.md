# Import contract

Better Cooking imports **recipe websites with schema.org data** itself: it loads the page, reads the JSON-LD `Recipe` and writes the note and cover image (`src/localImport.ts`, no AI). Pasted text and websites without recipe data can go to **your own AI** (Anthropic or OpenAI-compatible, `src/ai.ts`): the plugin sends the material, gets one schema.org Recipe back as JSON, checks it and writes the note itself, so no Git sync is needed. Everything else (social media, or all of it when you prefer Claude or GitHub) goes to a **processor** that you run; the plugin waits for the resulting note to appear in the vault. Every processor follows this contract; the plugin only knows the contract, not the processor.

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
- steps made for cooking mode: one step per action or waiting time, `1. **Kneten (10 Min.):** Teig glatt kneten, bis er sich vom Rand löst.` (short bold title with the duration, then what to do with the times, temperatures and signs of doneness the source names; nothing invented), ingredient groups (`**Teig**`) and a group `Ausstattung` where the source has them. The plugin's own imports follow the same rules (`src/stepSplit.ts`),
- images in `Bilder/` (`<recipe> Titelbild.webp`, `<recipe> Bild N.webp`), optionally `<recipe> Ablauf.svg`.

**Duplicate:** if a recipe with the same source exists, do not create a new note; set `auftrag: <job id>` in the existing one. Not a recipe in this sense: anything in the subfolder `Vorversionen/` and any note with a `vorversion` / `previous_version` field. These are backups of old versions made by "Fetch again" and carry the same `source`; they must neither count as the existing recipe nor be changed.

**No updates:** a processor never rewrites an existing note, not even for a known source. "Fetch again" on a recipe page (issue #63) therefore works only in the plugin and with the own AI; it keeps the old version in `Vorversionen/` ([architecture](architecture.md)).

**Retry:** "Nochmal" on an import card starts one new job with the same input; the old job is replaced on the card as soon as the new one was accepted. A failed job can be retried at once. A running one can be retried two minutes after its start and only after a question, because the run at the processor cannot be stopped: a second run can mean double cost and duplicate notes. The new job's card is protected the same way. A processor that already started the old job should treat the new one as a duplicate (same source: set `auftrag` in the existing note, see above).

**Failure:** still write a note (`Import gescheitert <job id>.md` with `import: fehler`, `import_fehler`, `auftrag`) so the plugin can show the reason. If nothing arrives within 20 minutes, the plugin marks the job as failed.

## Security requirements for processors

Web pages, social media posts and pasted text are untrusted input. A processor

- treats their content as data, never as instructions (an AI processor gets them clearly separated from its own instructions and is told that text inside them cannot change its task),
- writes only the one recipe note and its images in the recipe folder, and touches nothing else in the vault,
- validates AI output against the note format before writing it: only the documented frontmatter fields and sections, image embeds only to its own files in `Bilder/`,
- writes no content that other plugins act on: no Templater commands (`<% … %>`), no code blocks, no inline Dataview queries, no HTML tags, no links other than `http(s)`, no embeds of notes.

The plugin checks every note that closes a job (`src/importCheck.ts`). If it finds such content, it warns when the recipe arrives and shows a hint on the recipe page; it does not change the note.
