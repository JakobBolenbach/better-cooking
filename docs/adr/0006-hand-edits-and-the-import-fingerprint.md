# 0006: Hand edits and the import fingerprint

- Status: Accepted
- Date: 2026-11-27
- Decided by: Jakob Bolenbach

## Context

Users want to correct imported recipes by hand: a wrong amount, a clearer step, a changed title (issue #118). Some code rewrites imported sections of a note on its own: "Fetch again" (#63) today, and from 0.9 the improvements of processors (#121) and their feedback (#120). A correction made by hand is overwritten by such a run; only the backup in `Vorversionen/` still has it.

The notes are the source of truth and are synchronised by Git or Obsidian Sync. Nothing may be hidden outside the note, and the plugin can only write what docs/architecture.md lists.

## Decision

A frontmatter field `import_hash` (same name in German and English; an own name is possible under "Own field names", field id `importHash`) holds a short FNV-1a hash per imported part (title, description, yield, times, ingredients, steps, tips) as one string, `"title=1k2j ingredients=9xq3 steps=0p7a"`. The hash covers the parsed, normalised value of a part, not the Markdown: line endings, spacing, list markers and the language of the headings never count.

It is written:

- by every import of the plugin (website, pasted text, caption, own AI), as hashes of the note as written,
- by "Fetch again" and by applied improvements: the hash of what the source gave for every part it gave, whether the part was applied or kept,
- by the first hand edit of an imported note that has none: the state before the edit (the plugin's editor comes with #131).

A part whose current hash differs from the stored one counts as edited by hand, whether it was changed in the plugin's editor, in Obsidian's editor or in Properties. "Fetch again", feedback and improvements keep edited parts unless the user ticks "Replace my edit" for them. A note without a stored hash behaves as before 0.9: everything is replaced, the backup keeps the old version.

## Consequences

- One more field in Properties; it is documented in docs/recipe-format.md and can be renamed.
- Formatting differences never count as edits. Only the value of a part counts, so a change that the parser does not see (for example a checkbox in an ingredient line) is not an edit either.
- Notes imported before 0.9 and notes of processors (Claude, GitHub action), which do not write the field, are protected only after their first hand edit in the plugin or their first "Fetch again".
- The normalisation must stay stable. Changing it changes every hash and needs a migration; `recipeSig` of the shopping list shares the hash function, its output is stored in `data.json` and must not change either.
- A kept part stores the hash of what the source gave, not of the user's text, so the edit is found again at the next run. A user who deletes the field switches the protection off for that note.

## Alternatives

- A list of the edited parts in the note: misses edits made in Obsidian's editor or Properties.
- Hashes in `data.json` per path: hidden from the note, lost on rename and on a second device before sync, and not visible to processors.
- Markers in the body: clutter in the note and easy to break.
- Comparing with the last backup: heavy, and the comparison is fuzzy.
