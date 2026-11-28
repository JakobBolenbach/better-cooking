# 0008: Record how a recipe was read

- Status: Accepted
- Date: 2026-11-28
- Decided by: Jakob Bolenbach

## Context

A recipe note can come from four readers that differ in quality, cost and behaviour: the schema.org data of a website, the plugin's offline rules for a text or caption, the user's own AI, and Claude or the GitHub action. The recipe page did not say which one it was, so users could not judge a recipe and could not tell why "Fetch again" or feedback behave differently for it (issue #155). The notes are the source of truth and are synced, so the answer has to be in the note, not in `data.json`, and the plugin can only write what docs/architecture.md lists.

## Decision

A frontmatter field `import_weg` (German notes) or `import_via` (English notes), field id `importVia`, an own name is possible. Its value is one of four lower-case words, the same in every language, and only the display is translated:

- `page`: the schema.org data of a recipe website, read in the plugin,
- `rules`: the offline rules for pasted text or a caption,
- `ai`: the user's own AI,
- `processor`: Claude or the GitHub action.

Four fixed words, not free text, so a reader can map them to a label and an unknown value is simply not shown (and never overwritten by reading). They name the reader, not the vendor, so a new AI provider changes nothing.

**Written** by the plugin in every note it creates: website, pasted text, caption (`rules`, or `ai` when the own AI read it), own AI, a first version (the way that made it), a translation (the original's way, `ai` if the original has none), and a proposal saved as a recipe (`processor`). **Updated** when the plugin writes an existing note anyway: "Fetch again" and "Fetch again with a hint" (the way of the new reading) and an applied improvement (`processor`). It is never written on its own: a run that changes nothing else writes nothing.

**Not part of the fingerprint** (ADR 0006): it is not an imported part, and changing it is no hand edit. The recipe editor leaves it as it is.

**Processors** may write `import_weg: processor`, but do not have to. A note with a job ID (`auftrag`) and no such field counts as `processor` when it is shown, so no routine has to change and the import contract stays as it is, except for one optional line. Older notes without the field and without a job ID show nothing.

**Shown** on the recipe page in the line with author and source, quietly: "Read without AI (recipe data of the page)", "Read without AI (rules)", "Read with your AI", "Read by Claude or GitHub".

## Consequences

- One more field in Properties, documented in docs/recipe-format.md and listed in docs/architecture.md; it can be renamed under "Own field names".
- The value says how the note was read when it was written or last read again. A recipe the user later edited by hand keeps it: the field describes the reading, not the text.
- A note translated by the own AI shows the original's way, because the content was read that way; the translation itself is marked by `translation_of`.
- A first version improved by a processor ends as `processor`; the way of the first version is replaced.
- Filtering the overview by the way is left for later; the field makes it possible.

## Alternatives

- A list in `data.json` per path: hidden from the note, lost on rename and before a sync, and not visible to processors.
- Free text from the reader (a model name, a host): not comparable, and needs a place in the display for every value.
- A mandatory field for processors: forces every routine to change for a display detail.
- Deriving the way from `source` and `auftrag` only: cannot tell rules from page data or the own AI from the plugin's rules.
