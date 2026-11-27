# 0007: Improvements arrive as proposals

- Status: Accepted
- Date: 2026-11-27
- Decided by: Jakob Bolenbach

## Context

A social media import that goes to Claude or GitHub takes minutes, and on a phone the Git sync adds to that (#121). Users want a first version at once and a better one later, once the processor has watched the video or read the comments. Feedback on an imported recipe ("less salt", #120) is the same shape: a processor produces a new version of a note that exists.

Processors never rewrite an existing note ([import contract](../import-contract.md)). Two reasons: the plugin alone knows which parts a user edited by hand ([ADR 0006](0006-hand-edits-and-the-import-fingerprint.md)), and a processor that changes a note in the repository collides with the phone that changed it too (Git conflicts in a note the user is reading).

## Decision

The first version is written by the plugin itself (#133) with `import: offen` and `auftrag: <job id>`, and the job starts with `verbessern` (Job field `improve`). Feedback from the user (#120) goes the same way, as a hint (`hinweis`) in the job; the hint is sent as `hinweis` with the job (#120).

For such a job the processor writes one **proposal**: `<recipe folder>/Verbesserungen/<job id>.md`, a full recipe note with `auftrag`, `import: fertig | teilweise | fehler` and `import_fehler`, and its images `Bilder/<job id> Titelbild.webp` and `Bilder/<job id> Ablauf.svg`. It never changes the existing note, ignores the duplicate rule for this job, and never writes `import_hash`. A failed improvement is the proposal itself with `import: fehler` and a reason, not a separate failure note.

The plugin merges the proposal into the note that carries the job ID, with the rules of "Fetch again" (ADR 0006): parts edited by hand stay, `Vorversionen/` gets the old version, compare-and-set protects against a change in between. Its own note builder writes every line, so a proposal is defused like an import. Who applies it is decided per proposal:

- On the device that started the job, and if no part edited by hand would change and the import check has no finding: automatically, with a notice and Undo.
- Otherwise the user decides (this includes every note without a readable fingerprint): the job keeps the review in `data.json` until the user applies or discards, and the recipe page shows a banner on that note (on another device only after ten minutes, so the starting device can apply it first) and the dialog of "Fetch again" lists the changes and the hand edits, shows the new text and can discard the proposal.
- No note with the job ID, after a grace period of two minutes for a note that syncs later: the proposal stays and is shown as "Rezept nicht gefunden" (save as a new recipe, or discard). A job dropped because its note was deleted: the proposal is dropped.
- A failed improvement: the first version stays; every device writes the reason into the note (only if it still has the job ID and `offen`) and deletes the proposal; the device that started the job closes the job and tells the user.
- A routine that does not know `verbessern` imports normally and writes a second note with the same job ID: the note with `import: offen` is the target (deterministic), the other stays a normal recipe. The 20 minute timeout of the job sets `import: teilweise` and a reason on the first version, so it is not left "offen".

The file name of a proposal is the job ID and must equal its `auftrag`; anything else is an invalid proposal and is never applied. The note is found by the job ID only for a job known as an improvement job or for a note that says `import: offen`. A note with `import: offen` and the job ID does not close an improvement job, and neither does a newer note with the same source; only a proposal does. Sync while a job waits (#82) keeps pulling until the proposal is there.

## Consequences

- The user sees a recipe at once, and the processor's result later, without losing edits.
- Processors stay simple and cannot destroy hand edits: they only add a file. Because they never touch a file that the phone changes, Git has no conflict between processor and phone.
- Processors and the GitHub workflow need the 0.9 contract (input `verbessern`, the proposal file). An older workflow answers 422; the plugin says so. An older processor that ignores `verbessern` never answers: the job times out with a hint after 20 minutes and the first version stays.
- A new subfolder `Verbesserungen/` in the recipe folder, not read as recipes, deleted by the plugin after use. Queries in Dataview or Bases should leave it out.
- A retry of an improvement job is a new run with a new job ID; the plugin sets the note's `auftrag` to it (compare-and-set) and drops late proposals of the old run, so two runs never write the same file.
- Every device needs plugin version 0.9 or later: an older plugin does not know the folder and the `offen` state. It leaves the proposals alone, and another device with 0.9 can still apply them.
- The plugin gets more code (a service, a decision, a dialog mode), but no new runtime dependency and no network access of its own.

## Alternatives considered

- **The processor rewrites the note in place.** It cannot know the hand edits and conflicts with the phone through Git; the backup in `Vorversionen/` would be the only protection. Rejected, and it would break the contract that processors never rewrite a note.
- **A second note that the user merges by hand.** Safe, but the user does the work the plugin can do, and two notes for one recipe confuse the list, the search and the shopping list.
- **Only a better waiting card.** Does not give a recipe at once; the user still waits minutes for anything to read.
- **Results without Git ([#13](https://github.com/JakobBolenbach/better-cooking/issues/13)).** Would remove the sync delay, but it needs a server or an account of the project, which contradicts ADR 0005 and the rule of no network access the user did not start. It can still come later; proposals would work the same way over another transport.
