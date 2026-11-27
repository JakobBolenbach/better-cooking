# Import contract

Better Cooking imports **recipe websites with schema.org data** itself: it loads the page, reads the JSON-LD `Recipe` and writes the note and cover image (`src/localImport.ts`, no AI). Pasted text and websites without recipe data can go to **your own AI** (Anthropic or OpenAI-compatible, `src/ai.ts`): the plugin sends the material, gets one schema.org Recipe back as JSON, checks it and writes the note itself, so no Git sync is needed. **Social media posts** (Instagram, TikTok, YouTube, Pinterest) are read by the plugin itself too: it loads the public page of the one link without login, takes the caption or description and the cover image, uses the caption like pasted text if it holds a recipe, otherwise follows a link to a recipe website if the post has one (then the website is the source of the note), and finally uses the caption anyway (`src/socialImport.ts`, [ADR 0005](adr/0005-imports-without-an-ai-vendor.md)). Facebook shows posts only to logged-in users and needs a pasted text or a processor. A **processor** that you run is optional for every source: it takes over when you choose Claude or GitHub on purpose, with "Automatic" when the plugin's own way finds nothing readable or no recipe (for example if it is only in the video; not after a technical failure of the own AI), and for everything the plugin cannot read; the plugin waits for the resulting note to appear in the vault. Every processor follows this contract; the plugin only knows the contract, not the processor.

## Input

The plugin detects the kind of source (`webseite`, `instagram`, `tiktok`, `youtube`, `facebook`, `pinterest`, `text`) and a duplicate key with the rules in `src/source.ts`. A processor that creates notes must apply the same rules.

- **Claude (scheduled task):** `POST https://api.anthropic.com/v1/claude_code/routines/<trigger id>/fire` with the task's token. The text sent is JSON:
  `{"rezept_auftrag": "rz-…", "art": "…", "quelle": "<link>" | null, "schluessel": "…" | null, "text": "<recipe text>" | null}`
- **GitHub workflow:** `workflow_dispatch` on `rezept-import.yml` in your repository, ref `main`, inputs `auftrag`, `quelle`, `text`.

## Output

Exactly one note in the recipe folder in the [recipe note format](recipe-format.md), synced into the vault (for example pushed to the vault's Git repository), with:

- `auftrag: <job id>` in the frontmatter; the plugin uses it to close the job and report the recipe as arrived,
- `status: ausprobieren`, `quelle` without tracking parameters, `import: fertig | teilweise | fehler`, and `import_fehler` with a one-line reason if something went wrong. A recipe note with content and `import: fehler` is a normal recipe with a warning badge; a note with `import: fehler` and a job ID but **no ingredients and no steps** is the failure note (see Failure),
- the English names work as well (`job`, `status: to-try`, `source`, `import: done | partial | failed`, `import_error`, `## Ingredients` …, see the recipe format); the plugin reads both,
- steps made for cooking mode: one step per action or waiting time, `1. **Kneten (10 Min.):** Teig glatt kneten, bis er sich vom Rand löst.` (short bold title with the duration, then what to do with the times, temperatures and signs of doneness the source names; nothing invented), ingredient groups (`**Teig**`) and a group `Ausstattung` where the source has them. The plugin's own imports follow the same rules (`src/stepSplit.ts`),
- images in `Bilder/` (`<recipe> Titelbild.webp`, `<recipe> Bild N.webp`), optionally `<recipe> Ablauf.svg`.

**Push early:** push the note as soon as text and cover image are done; extras such as a flow graphic (`<recipe> Ablauf.svg`) go in a second commit. A run usually takes 2 to 5 minutes. While a job waits, the plugin on the device that started it asks Obsidian Git to pull (if installed and the setting is on), so a note that is pushed early shows up within about a minute; other devices see it with their own sync.

**Duplicate:** if a recipe with the same source exists, do not create a new note; set `auftrag: <job id>` in the existing one. Not a recipe in this sense: anything in the subfolder `Vorversionen/` and any note with a `vorversion` / `previous_version` field. These are backups of old versions made by "Fetch again" and carry the same `source`; they must neither count as the existing recipe nor be changed. A failure note (`import: fehler`, no ingredients, no steps) is no existing recipe either.

**No updates:** a processor never rewrites an existing note, not even for a known source. "Fetch again" on a recipe page (issue #63) therefore works only in the plugin and with the own AI; it keeps the old version in `Vorversionen/` ([architecture](architecture.md)).

**Retry:** "Nochmal" on an import card starts one new job with the same input, at the same processor (a social media job is not read by the plugin again); the old job is replaced on the card as soon as the new one was accepted. A failed job can be retried at once. A running one can be retried two minutes after its start and only after a question, because the run at the processor cannot be stopped: a second run can mean double cost and duplicate notes. The new job's card is protected the same way. A processor that already started the old job should treat the new one as a duplicate (same source: set `auftrag` in the existing note, see above). The failure note of the old run is not deleted by "Nochmal": the new job remembers the old run and the plugin hides that note while the new job is open. If the new job fails too, "Remove" on its card deletes both failure notes (the question names them); if it succeeds, the old failure note shows up under "Failed imports" and can be removed there.

**Failure:** still write a note (`Import gescheitert <job id>.md` with `import: fehler`, `import_fehler`, `auftrag`) so the plugin can show the reason. If nothing arrives within 20 minutes, the plugin marks the job as failed.

What the plugin does with a failure note (`src/importFailure.ts`): a note counts as one only if it has import state `fehler` / `failed`, a job ID (`auftrag` / `job`) and **no recipe content** (no ingredients, no steps). Anything else, including a recipe with `import: fehler` and content, or `import: fehler` without a job ID, stays a normal recipe (with the existing "import failed" badge) and is never deleted by the plugin. A failure note belongs to an open job **by job ID only** (never by source: the source rule is for real recipes). The device that started the job then closes it as **failed** and shows `import_fehler` / `import_error` (one line, cut at 240 characters; a fixed text if empty) on the card, with one notice "Import gescheitert: <reason>" and no "recipe arrived"; another device leaves the job alone until the starter has marked it. The user can retry or remove it. "Remove" deletes the failure notes after a question that names them (Obsidian's trash setting decides where they go). The plugin deletes a note only if it is read again right then, lies in the recipe folder, is still a failure note **and** its job ID is the one of the job being removed; a note it could not delete keeps the job. A failure note without an open job, or whose job ID a real recipe carries, is left out of the recipe list, the search and the counts; those without a recipe are shown under "Failed imports". A failure note must therefore always carry the job ID, and a processor must never use `import: fehler` for a note that holds a real recipe without wanting it treated as one.

## Security requirements for processors

Web pages, social media posts and pasted text are untrusted input. A processor

- treats their content as data, never as instructions (an AI processor gets them clearly separated from its own instructions and is told that text inside them cannot change its task),
- writes only the one recipe note and its images in the recipe folder, and touches nothing else in the vault,
- validates AI output against the note format before writing it: only the documented frontmatter fields and sections, image embeds only to its own files in `Bilder/`,
- writes no content that other plugins act on: no Templater commands (`<% … %>`), no code blocks, no inline Dataview queries, no HTML tags, no links other than `http(s)`, no embeds of notes.

The plugin checks every note that closes a job (`src/importCheck.ts`). If it finds such content, it warns when the recipe arrives and shows a hint on the recipe page; it does not change the note.
