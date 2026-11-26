# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Imports are made for cooking mode: long instructions of recipe websites and pasted text are split into steps with one action or waiting time each, with a short bold title and the duration (`**Kneten (10 Min.):** …`, waiting times such as "30 Minuten gehen lassen" as steps of their own). Section names of the page go in front of the step titles, ingredient groups of pasted text are kept, and the own AI is asked for the same form including ingredient groups and equipment (#62).

## [0.5.0] - 2026-11-26

First beta for testers: English interface and notes, own AI for imports, shopping list, meal plan, sharing and translations, with the fixes from the first test round and a cooking mode that works well on phones.

### Added

- Recipe websites with schema.org microdata instead of JSON-LD are read directly in the plugin too.
- The interface is available in English and German and follows Obsidian's language (English for all other languages).
- Setting "Note format": write recipe notes with English field names, status values and headings (`status: to-try`, `## Ingredients`) or German ones. Both are always read, also mixed. New installations follow Obsidian's language; existing ones stay German.
- Setting "Own field names": map fields to your own frontmatter names, for example `category: tags` (#1).
- The settings appear in Obsidian's settings search (Obsidian 1.13 and later, #3).
- Own AI for imports: pasted text and pages without recipe data go to your own Anthropic key or any OpenAI-compatible server (also a local model such as Ollama). Better Cooking checks the answer and writes the note itself, without Git (#5).
- Shopping list: "Add to shopping list" on a recipe page puts its ingredients for the servings shown (without the ones you checked as already there) into a Markdown checklist note; equal items with compatible units are merged, with the recipes they are for. Command "Open shopping list" (#7).
- Pasted recipe text works without AI: when no processor is set up, Better Cooking splits it into title, description, yield, ingredients, steps and tips by simple rules (headings such as "Zutaten"/"Ingredients" help) and writes the note itself (#15).
- Share a recipe with people without Obsidian: copy it as text, print it or save it as PDF (desktop), or use the device's share menu, always with the quantities for the servings shown (#9).
- Meal plan: "Plan" on a recipe page puts it on one of the next seven days in a Markdown note (`## 2026-11-30 · Monday`, `- [[Recipe]] · 4 servings`). Commands to open the plan, to put the next seven days on the shopping list (quantities for the planned servings) and to export the plan as a calendar file (.ics) (#11).
- Translations with your own AI: "Translate" on a recipe page writes a linked note in another language (quantities and times stay); the recipe page switches between the original and its translations, the overview lists the recipe once (#10).
- Shopping list per store: setting "Stores" sorts new items into `## Store` sections by words; items moved by hand under a store go there again next time. Command to remove checked items (#12).
- Setting "Colors": the plugin's kitchen palette or the colors and fonts of the active Obsidian theme. The kitchen palette's main colors and both fonts can be changed with the Style Settings plugin (#14).
- Cooking mode: tap the left third of the step area to go back and the rest to go on, like in a story (touch and pen; the mouse keeps the buttons and arrow keys). Buttons, timer chips, links, the ingredient list and their surroundings (12 px), long presses, drags, scrolling or stopping a scroll, text selection, two-finger gestures and the outermost 16 px are left alone. The first time, a short hint shows how it works; the step number is announced by screen readers. The step area no longer allows pinch zoom (#57).
- Processor "None (import without AI)": pasted text is split by rules and recipe websites are read directly, even when a Claude token is set up; social media links stay locked with a hint on what to choose (#47).
- Cooking mode shows for how many servings it calculates, e.g. "for 9 pieces" (#45).

### Security

- Imported page text can no longer carry inline code, Markdown links, Templater commands or action addresses (`obsidian://`, `javascript:`) into a note (#6).
- Notes delivered by a processor are checked on arrival; Templater commands, code blocks, Dataview queries, active HTML, action links and embedded notes trigger a warning and a hint on the recipe page (#6).

### Changed

- Code identifiers, file names and comments are English (ADR 0004). No change in behavior; settings saved by 0.2.1 and earlier are migrated automatically.
- "Made today" is a plain action with the date of the last time as second line, and offers "Undo" for ten seconds after a click, which writes back exactly what the note had before (also an empty template line) and does nothing if the note was changed in the meantime. A double click does not undo (#45).
- Amounts without a unit (eggs, onions, bananas) and in counted units (Stück, Zehe, Dose, Scheibe, Blatt, piece, clove, can, slice, …) scale to whole or half pieces from 1 up, not to thirds: "3 ½ Eier". Below 1, and for spoons and cups, thirds and quarters stay (#45).

### Fixed

- "What did you change?" and "How was it?" in the attempt dialog accept text again (broken since the code was renamed to English).
- Yields without a unit of their own get words in the note's language (`4 servings` in English notes instead of `4 Portionen`), and `for 4 people` is read as 4 servings (#24).
- English recipes: "25 minutes", "1 hour" and "2 hrs" in steps become timers, cups, spoons, ounces and pounds are units (fractions, scaling, merging on the shopping list), "2 to 3" is a range; scaled ranges and timer labels use the interface language (#28).
- English steps no longer show unrelated ingredients under "In this step" because of words like "brown" or "ground".
- Amounts in litres, kilograms, decilitres and centilitres are no longer treated as millilitres or grams: `1.2 l` stays 1,2 l on the shopping list, and scaled amounts such as 1,8 l are no longer rounded to whole or half litres. `L`, English litres and grams are read as units, small weights are written in mg instead of "0 g", and long forms such as Deziliter are merged with the short ones (#40).
- Shopping list and recipe page, from the beta test: "3 Eier" and "6 Ei(er)" are merged (Eier, Ei(er) and the plurals Zwiebeln, Tomaten, eggs stay one item, "Butter" and "Butt" do not); units follow the amount ("2 Prisen", "1 Prise", "2 handfuls", "2 cloves", also when scaling servings); a comma right after the unit ("1 TL, gestr. Backpulver") belongs to the text, also without the comma or before the unit, so the list reads "1 TL Backpulver"; a line that is only counted up moves into the store section that fits by now, unless you put it in a section yourself or it has indented notes below it; "Blatt" and "Glas" stay singular after a number; the settings show the default names of the shopping list and meal plan (`Einkaufsliste.md`, `Wochenplan.md`) for the chosen note format right after switching it (#46).
- Setting "Colors" = "Obsidian theme" now applies the theme's background, sidebar and accent color in dark mode too, not only its fonts (#43).
- Servings control on the recipe page: "−", the value and "+" no longer move when the "Original amount" button appears, so repeated clicks on "+" keep counting up (#42).
- Attempt dialog: the date is shown in the interface language ("26 Nov 2026" in English); the note still gets `DD.MM.YYYY`. An invalid date shows a hint instead of silently using today (#45).
- Key facts on the recipe page: the yield follows the servings control instead of staying at "4 servings"; ranges ("4-6 servings") and text before the amount ("Ergibt ca. 12 Stück") are read, and servings are written the same way in the key facts, servings control, cooking mode, sharing and meal plan (#45).
- Cooking mode: "In this step" also finds ingredients named by their last word ("oil" for "olive oil", "Öl" for "Olivenöl", "Ei", "Eier", "Vanilleeis" for "Eis"), without hits on "salt" in "unsalted butter" or "Eis" in "Reis" (#45).
- Cooking mode: Obsidian's status bar no longer covers the "Next" button (#45).
- Plugin buttons and ingredient rows no longer turn grey on hover or focus in themes that style `button:hover`, and the focus ring keeps the pill shape of buttons. Servings, star, chip and segment buttons show a quiet hover (#45).
- Esc in the recipe view closes the topmost layer (dialog, recipe page, cooking mode) instead of switching to another tab, leaves a text field before closing its dialog, and clears the search. A share, plan or translate dialog no longer reappears on the next recipe, and the focus stays in the view after closing a layer (#41).
- Import cards no longer appear among search results; in "All recipes" and "To try" they sit under their own "Imports" heading, apart from the recipes (#44).
- The error text of a failed import follows the interface language, also for jobs saved before (#44).
- An empty overview says when the recipe folder does not exist and how to fix it, and notices when the folder is created (#44).
- Cooking mode: swiping the step area to the left or right changes the step on touch screens again (#57).
- The hint for a locked import now names the chosen processor that is not fully set up (for example own AI without a key) and the ones that are set up and can be chosen, instead of "No processor set up yet"; the short note in the dialog says the same (#47).
- German interface: one term for the status "ausprobieren" on lists and cards ("Zum Ausprobieren", "zum Ausprobieren") (#47).
- Mobile: buttons, timers and dialogs stay clear of Obsidian's navigation bar, the home indicator and the on-screen keyboard (the larger of bar and safe area counts, not both), and a focused field in a dialog scrolls into view (#56).

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
