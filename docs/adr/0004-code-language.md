# 0004: Language of code, docs and UI

- Status: Accepted
- Date: 2026-11-25 (proposed 2026-11-24)
- Decided by: Jakob Bolenbach

## Context

Version 0.1.4 uses German everywhere: identifiers (`leseRezept`, `skaliereZeile`), comments, UI strings, note sections. Public documentation is English. Contributors and users outside Germany expect English code and an English UI, while the author and first users are German-speaking.

Options were: German stays (no effort, barrier for contributors), gradual renaming (mixed code for months, every pull request decides the language again), or one rename now (one large mechanical change while there are few files, no outside contributors and no open pull requests).

## Decision

- **Code identifiers and comments:** English, changed in **one rename** before 0.5. The rename is mechanical (TypeScript rename, no behavior change) and lands as its own pull request; open pull requests are merged or rebased first. New code is English from now on.
- **Public docs** (README, docs/, issues, commit messages): English.
- **UI:** strings in translation files, English as default, German as first translation (milestone 0.5).
- **Note format:** a data format, not code. German and English section names are both accepted; frontmatter field names stay as they are until the field mapping (issue #1).

## Consequences

- One large diff in the history; `git blame` skips it via `.git-blame-ignore-revs`.
- Contributors read and write English code only.
- Settings keys in `data.json` are renamed with a migration, so existing installations keep their settings.
