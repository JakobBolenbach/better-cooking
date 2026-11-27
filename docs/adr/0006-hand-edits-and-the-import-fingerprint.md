# 0006: Hand edits and the import fingerprint

- Status: Accepted
- Date: 2026-11-27
- Decided by: Jakob Bolenbach

## Context

Users want to correct imported recipes by hand: a wrong amount, a clearer step, a changed title (issue #118). Some code rewrites imported sections of a note on its own: "Fetch again" (#63) today, and from 0.9 the improvements of processors (#121) and their feedback (#120). A correction made by hand is overwritten by such a run; only the backup in `Vorversionen/` still has it.

The notes are the source of truth and are synchronised by Git or Obsidian Sync. Nothing may be hidden outside the note, and the plugin can only write what docs/architecture.md lists.

## Decision

A frontmatter field `import_hash` (same name in German and English; an own name is possible under "Own field names", field id `importHash`) holds a short FNV-1a hash per imported part (title, description, yield, times, ingredients, steps, tips).

**Format.** One quoted string without spaces, `"v1;title:1k2j;ingredients:9xq3;steps:0p7a"`, so no YAML writer can fold it. The hash is FNV-1a (32 bit) over the UTF-8 bytes, in base 36; it is not the hash of the shopping list's `recipeSig`, which is stored in `data.json` and stays as it was. An unknown version, a folded value or any broken entry means "no fingerprint": the note behaves as before.

**What is hashed.** It must be what the merge replaces, so the detection sees exactly what a run would overwrite.

- Title, description, yield and times: their parsed value, spaces collapsed.
- Ingredients, steps and tips: the lines of the first section of that kind (found by heading in either language), each trimmed, spaces collapsed, with list marker, step number (`1.`, `2)`) and checkbox state (`- [ ]`, `- [x]`) removed; empty lines are dropped (so an empty placeholder step makes no difference). Everything else counts: hints (`>`), embeds, `###` groups, free text, indented lines, comments, tables.

**When it is written.**

- By every import of the plugin (website, pasted text, caption, own AI), as hashes of the note as written.
- By "Fetch again" and applied improvements: the hash of every part that was really replaced, as the note has it afterwards. What counts as replaced is decided in one place (what the source gave, minus the parts kept): the placeholder title, a source without steps and a second section of the same name are not replaced and keep their stored hash. A kept part keeps its stored hash too, so the edit is found again next time.
- By the first hand edit of an imported note that has none: the state before the edit (the plugin's editor comes with #131).

**What it does.** A part whose current hash differs from the stored one counts as edited by hand, whether it was changed in the plugin's editor, in Obsidian's editor or in Properties. "Fetch again", feedback and improvements keep edited parts unless the user ticks "Replace my edit" for them. A deleted title counts as an edit; keeping it means no title from the source is put in. If only kept parts differ, nothing is written. A note without a valid stored hash behaves as before 0.9: everything is replaced, the backup keeps the old version.

## Consequences

- One more field in Properties; it is documented in docs/recipe-format.md and can be renamed. Processors do not write it and must not copy it from example notes (import contract).
- Formatting differences never count as edits, and neither does ticking a checkbox in a list: that is a deliberate choice, not an oversight. Changes in the title, description, yield or times count only by value.
- Notes imported before 0.9 and notes of processors (Claude, GitHub action), which do not write the field, are protected only after their first hand edit in the plugin or their first "Fetch again", and then only for the parts that run replaced.
- Hash function, normalisation and field format are stored in users' notes and must stay stable. Changing one changes every hash and needs a migration. `tests/fingerprintFormat.test.ts` pins them against a hand-written note with fixed hashes; a failure there means a migration is needed, not that the constants should be updated.
- A user who deletes the field switches the protection off for that note.

## Alternatives

- Hashes of the parsed ingredients and steps instead of the lines: misses what the merge replaces (hints, embeds, group lines, free text) and treats a changed list marker or checkbox as the same, which is the opposite of what is wanted for the first and wrong for the second.
- A list of the edited parts in the note: misses edits made in Obsidian's editor or Properties.
- Hashes in `data.json` per path: hidden from the note, lost on rename and on a second device before sync, and not visible to processors.
- Markers in the body: clutter in the note and easy to break.
- Comparing with the last backup: heavy, and the comparison is fuzzy.
