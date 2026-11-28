# 0008: Record how a recipe was read

- Status: Proposed (Jakob Bolenbach asked for the feature in #155; to be confirmed)
- Date: 2026-11-28
- Decided by: open

## Context

A recipe note can come from four readers that differ in quality, cost and behaviour: the schema.org data of a website, the plugin's offline rules for a text or caption, the user's own AI, and Claude or the GitHub action. The recipe page did not say which one it was, so users could not judge a recipe and could not tell why "Fetch again" or feedback behave differently for it (issue #155). The notes are the source of truth and are synced, so the answer has to be in the note, not in `data.json`, and the plugin can only write what docs/architecture.md lists.

## Decision

A frontmatter field `import_weg` (German notes) or `import_via` (English notes), field id `importVia`, an own name is possible. Its value is one of four lower-case words, the same in every language, and only the display is translated:

- `page`: the schema.org data of a recipe website, read in the plugin,
- `rules`: the offline rules for pasted text or a caption,
- `ai`: the user's own AI,
- `processor`: Claude or the GitHub action.

Four fixed words, not free text, so a reader can map them to a label and an unknown value is simply not shown (and never overwritten by reading). They name the reader, not the vendor, so a new AI provider changes nothing.

**Written** by the plugin in every note it creates: website, pasted text, caption, own AI, a first version (the way that made it), a translation (always `ai`: the own AI produced the text) and a proposal saved as a recipe (`processor`). **Updated** in an existing note by "Fetch again", "Fetch again with a hint" and an applied improvement (`processor`), but only when that run takes at least one recipe part or the image from the new reading. The value is therefore that of the last reading that wrote content; a run that changes nothing, or whose parts are all kept, leaves it as it is. Reading never changes a note; only writing it replaces the field.

**Not part of the fingerprint** (ADR 0006): it is not an imported part, and changing it is no hand edit. The recipe editor leaves it as it is.

**Processors** may write `import_weg: processor`, but do not have to. A note with a job ID (`auftrag`) and neither the field nor `import_hash` counts as `processor` when it is shown: every import of the plugin since 0.9 has the fingerprint and no processor writes it, so such a note comes from a routine that does not write the field. No routine has to change and the import contract stays as it is, except for one optional line. Remaining cases show nothing, on purpose (better nothing than something wrong): notes from before 0.9 without the field, notes of the plugin that got a job ID later (feedback, a retry; they have the fingerprint), and notes whose field has an unknown value.

**Shown** on the recipe page in the line with author and source, quietly: "Read without AI (recipe data of the page)", "Read without AI (recognised from the text)", "Read with your AI", "Read by Claude or GitHub"; a translation with `ai` says "Translated with your AI" (no value of its own: the note has `translation_of`).

## Consequences

- One more field in Properties, documented in docs/recipe-format.md and listed in docs/architecture.md; it can be renamed under "Own field names".
- The value says how the note was read when a reading last wrote content. A recipe the user later edited by hand keeps it: the field describes the reading, not the text. Undoing a merge brings the old value back with the old text.
- Mixed plugin versions (a synced vault with a device on an older version): an older plugin does not know the field. It keeps it in notes it rewrites with "Fetch again" (unknown frontmatter stays), so the field may name an older reading than the text, but never a wrong one for a note that device created: that note has no field and shows nothing.
- A translation always says `ai`, whatever the original says, because the own AI produced its text.
- A first version improved by a processor ends as `processor`; the way of the first version is replaced.
- Filtering the overview by the way is left for later; the field makes it possible.

## Alternatives

- A list in `data.json` per path: hidden from the note, lost on rename and before a sync, and not visible to processors.
- Free text from the reader (a model name, a host): not comparable, and needs a place in the display for every value.
- A mandatory field for processors: forces every routine to change for a display detail.
- Deriving the way from `source` and `auftrag` only: cannot tell rules from page data or the own AI from the plugin's rules.
