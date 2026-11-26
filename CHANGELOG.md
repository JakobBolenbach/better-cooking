# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- The interface is available in English and German and follows Obsidian's language (English for all other languages).
- Setting "Note format": write recipe notes with English field names, status values and headings (`status: to-try`, `## Ingredients`) or German ones. Both are always read, also mixed. New installations follow Obsidian's language; existing ones stay German.
- Setting "Own field names": map fields to your own frontmatter names, for example `category: tags` (#1).
- The settings appear in Obsidian's settings search (Obsidian 1.13 and later, #3).
- Own AI for imports: pasted text and pages without recipe data go to your own Anthropic key or any OpenAI-compatible server (also a local model such as Ollama). Better Cooking checks the answer and writes the note itself, without Git (#5).

### Security

- Imported page text can no longer carry inline code, Markdown links, Templater commands or action addresses (`obsidian://`, `javascript:`) into a note (#6).
- Notes delivered by a processor are checked on arrival; Templater commands, code blocks, Dataview queries, active HTML, action links and embedded notes trigger a warning and a hint on the recipe page (#6).

### Changed

- Code identifiers, file names and comments are English (ADR 0004). No change in behavior; settings saved by 0.2.1 and earlier are migrated automatically.

## [0.2.1] - 2026-11-25

### Security

- Website import no longer fetches cover images from `localhost`, local host names or private network addresses.

## [0.2.0] - 2026-11-25

### Added

- Own repository with license (PolyForm Noncommercial 1.0.0), docs, ADRs, CI, release workflow and contribution rules.
- Self-written example recipes for tests and the browser preview.
- Setting "Rezeptordner" for the recipe folder, with folder suggestions; default `Recipes`. Changing it re-reads the open view, and the empty overview names the folder it reads.
- Recipe websites are imported directly in the plugin from their schema.org data (JSON-LD): note in the documented format plus cover image, no AI and no processor needed. Pages without recipe data still go to the configured processor.
- Setting "Rezeptseiten selbst lesen": off sends recipe websites to the configured processor instead of the local import.
- Setting "Zusätzliche Eigenschaften": `name: value` lines added to the frontmatter of notes the plugin creates, for example `kontext: privat`.
- English section names in recipe notes (Ingredients, Steps/Instructions, Tips, Attempts, Notes, Images, Timeline), also mixed with German ones.

### Changed

- Plugin ID `better-cooking`, name "Better Cooking" (was `rezepte` in a private vault).
- `minAppVersion` 1.11.4 (secret storage for tokens needs it; was 1.5.0).
- No default processor: the Claude task ID and GitHub repository must be set by each user.
- Fonts come from the @fontsource packages; license notices added.
- Release builds no longer reload themselves when the plugin files change, and the "reload plugin" command is gone; both exist only in development builds (`pnpm dev`), as Obsidian's developer policies require.

### Fixed

- Findings of Obsidian's ESLint rules without behavior changes: promise handling in buttons, `activeDocument` for popout windows, inline styles moved to CSS, typed JSON parsing.
- Keyboard shortcuts ("/", Esc, arrow keys) only act when the recipe view is meant; before, "/" could not be typed in other notes while the view was open in a background tab.
- The timeline graphic (Ablauf SVG) is sanitized with an allowlist of drawing elements; event handlers, links, images and animations are removed.
- Notes with empty frontmatter (`---` directly followed by `---`) are read correctly.
- Sizes in the middle of an ingredient line ("Springform (26 cm)") are no longer scaled with the servings.
- An import job that never produces a note is marked as failed after 20 minutes even if nothing else changes in the recipe folder.
- `pnpm version` creates tags without a "v" prefix, so the release workflow starts.

## [0.1.4] - 2026-11-24

Last version developed in the private vault, taken over as the starting point: overview, search, recipe page with servings and timers, cooking mode, attempts log, import jobs via Claude or a GitHub workflow.
