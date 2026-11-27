# 0007: Improvements arrive as proposals

- Status: Accepted, amended 27.11.2026 (the first version, #133, and feedback, #120: see Consequences and the amendment)
- Date: 2026-11-27
- Decided by: Jakob Bolenbach

## Context

A social media import that goes to Claude or GitHub takes minutes, and on a phone the Git sync adds to that (#121). Users want a first version at once and a better one later, once the processor has watched the video or read the comments. Feedback on an imported recipe ("less salt", #120) is the same shape: a processor produces a new version of a note that exists.

Processors never rewrite an existing note ([import contract](../import-contract.md)). Two reasons: the plugin alone knows which parts a user edited by hand ([ADR 0006](0006-hand-edits-and-the-import-fingerprint.md)), and a processor that changes a note in the repository collides with the phone that changed it too (Git conflicts in a note the user is reading).

## Decision

The first version is written by the plugin itself (#133) with `import: offen` and `auftrag: <job id>`, and the job starts with `verbessern` (Job field `improve`). Feedback from the user (#120) goes the same way (see the amendment below), as a hint (`hinweis`) in the job.

For such a job the processor writes one **proposal**: `<recipe folder>/Verbesserungen/<job id>.md`, a full recipe note with `auftrag`, `import: fertig | teilweise | fehler` and `import_fehler`, and its images `Bilder/<job id> Titelbild.webp` and `Bilder/<job id> Ablauf.svg`. It never changes the existing note, ignores the duplicate rule for this job, and never writes `import_hash`. A failed improvement is the proposal itself with `import: fehler` and a reason, not a separate failure note.

The plugin merges the proposal into the note that carries the job ID, with the rules of "Fetch again" (ADR 0006): parts edited by hand stay, `Vorversionen/` gets the old version, compare-and-set protects against a change in between. Its own note builder writes every line, so a proposal is defused like an import. Who applies it is decided per proposal:

- On the device that started the job, and if no part edited by hand would change and the import check has no finding: automatically, with a notice and Undo.
- Otherwise the user decides (this includes every note without a readable fingerprint): the job keeps the review in `data.json` until the user applies or discards, and the recipe page shows a banner on that note (on another device only after ten minutes, so the starting device can apply it first) and the dialog of "Fetch again" lists the changes and the hand edits, shows the new text and can discard the proposal.
- No note with the job ID, after a grace period of two minutes for a note that syncs later: the proposal stays and is shown as "Rezept nicht gefunden" (save as a new recipe, or discard). A job dropped because its note was deleted: the proposal is dropped.
- A failed improvement: the first version stays; every device closes the note in the state it has without a job (`fertig`, or `teilweise` with what is missing) with the reason appended (only if it still has the job ID and `offen`) and deletes the proposal; the device that started the job closes the job and tells the user.
- A routine that does not know `verbessern` imports normally and writes a second note with the same job ID: the note with `import: offen` is the target (deterministic), the other stays a normal recipe. The 20 minute timeout of the job closes the first version like every improvement that does not come: in the state it has without a job (`fertig`, or `teilweise` with what is missing) with the reason appended, so it is not left "offen".

The file name of a proposal is the job ID and must equal its `auftrag`; anything else is an invalid proposal and is never applied. The note is found by the job ID only for a job known as an improvement job or for a note that says `import: offen`. A note with `import: offen` and the job ID does not close an improvement job, and neither does a newer note with the same source; only a proposal does. Sync while a job waits (#82) keeps pulling until the proposal is there.

## Amendment 27.11.2026: feedback on a finished note (#120)

Feedback ("Something wrong? Fetch again with feedback") on a note that is not a first version uses the same job and proposal, so the same rules hold, with these additions:

- The start is the one of the first version (`src/improveStart.ts`): the job is reserved, the note gets the new `auftrag` and `import: offen` by compare-and-set (a note without `auftrag` can take one), the request is sent. A clear refusal ends like every "no improvement" (`closeUnimproved`: the state the content has, `fertig` for a complete note; a note that had no `import` field has one afterwards). If there was no answer at all, the job may have arrived: the reservation becomes a normal job marked `unsure`, so the time limit and "Retry" apply and a note that says `offen` is never without a job.
- Only one improvement per note: feedback is refused while an improvement job of the note is open or its proposal waits for review. A failed or timed-out earlier run is replaced like a retry (`retryOf`, the old job goes). A retry of an improvement job is refused if the note no longer carries the job ID, and starts like feedback (the note says `offen` again).
- A proposal whose job ID a note carries is never offered as a new recipe (card "Improvement not merged": discard only; it is looked at again when its job becomes known). A failed proposal for a note that cannot take the reason (not `offen`) is deleted without a card.
- The job carries the note's `quelle` only if it is a real http(s) link; otherwise the recipe as text.
- A proposal or feedback result for a note without a fingerprint this version can read counts every part as edited by the user: replaced only where the user ticks it.

## Consequences

- The user sees a recipe at once, and the processor's result later, without losing edits.
- Processors stay simple and cannot destroy hand edits: they only add a file. Because they never touch a file that the phone changes, Git has no conflict between processor and phone.
- Processors and the GitHub workflow need the 0.9 contract (input `verbessern`, the proposal file). An older workflow answers 422; the plugin says so. An older processor that ignores `verbessern` never answers: the job times out with a hint after 20 minutes and the first version stays.
- A new subfolder `Verbesserungen/` in the recipe folder, not read as recipes, deleted by the plugin after use. Queries in Dataview or Bases should leave it out.
- A retry of an improvement job is a new run with a new job ID; the plugin sets the note's `auftrag` to it (compare-and-set) and drops late proposals of the old run, so two runs never write the same file.
- Every device needs plugin version 0.9 or later: an older plugin does not know the folder and the `offen` state. It leaves the proposals alone, and another device with 0.9 can still apply them.
- **Amended 27.11.2026 (#133, decided by Jakob Bolenbach): the first version.** For a social media post the plugin reads the caption itself with the requests that "Automatic" already makes (one request to the post's page, for Instagram a second one to its embed page if the first has no caption, and, if the caption holds no recipe and the setting "Rezeptseiten selbst lesen" allows it, up to three to linked recipe websites; no login, no tokens), also when Claude or GitHub were chosen on purpose (before, a chosen processor got the link without any reading). This is the default and can be switched off with the setting "Erste Fassung sofort aus dem Beitrag" (only shown when Claude or GitHub are set up); off, a processor chosen on purpose gets the link as before and "Automatic" behaves as before #133. The improvement job follows only where it is worth its cost: with Claude or GitHub chosen on purpose always, with "Automatic" only if the local result is incomplete (only ingredients or only steps); a complete result with "Automatic" is saved as a normal recipe without a job. The import dialog says before sending whether a run follows. A post that cannot be read goes to the processor as a normal job without a first version. While the job runs it has no card of its own: its note carries a badge and a line on the recipe page. The job is remembered (as `starting`) before the note is written and completed when the processor answered; if the request fails, the reservation goes and the note is closed at once in the state it has without a job (`fertig`, or `teilweise` with what is missing and then the reason), with a notice that offers "Retry"; a reservation left by a crash is cleaned up at the next start. A retry of an improvement job sets the note back to `offen`.
- The plugin gets more code (a service, a decision, a dialog mode), but no new runtime dependency and no network access of its own.

## Alternatives considered

- **The processor rewrites the note in place.** It cannot know the hand edits and conflicts with the phone through Git; the backup in `Vorversionen/` would be the only protection. Rejected, and it would break the contract that processors never rewrite a note.
- **A second note that the user merges by hand.** Safe, but the user does the work the plugin can do, and two notes for one recipe confuse the list, the search and the shopping list.
- **Only a better waiting card.** Does not give a recipe at once; the user still waits minutes for anything to read.
- **Results without Git ([#13](https://github.com/JakobBolenbach/better-cooking/issues/13)).** Would remove the sync delay, but it needs a server or an account of the project, which contradicts ADR 0005 and the rule of no network access the user did not start. It can still come later; proposals would work the same way over another transport.
