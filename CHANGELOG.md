# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Ingredients, steps and tips that start like Markdown syntax (a dash, a number with a dot, `#`, `>` and so on) are written with a backslash in front, as before; the plugin now shows them without the backslash (also on the page, in cooking mode and in the shopping list). The shopping list's fingerprint of a recipe (`recipeSig`) therefore changes for such ingredients once, which can show their old amounts as "unsure" until the recipe is added again (#131).
- The language of the key facts line and of new headings that "Fetch again" or the recipe editor write follows the headings of the note first, then its key facts line, then the setting "Language of new notes" (before: the key facts line, then the setting) (#131).

### Added

- A first version at once for social media posts (#133, part 2 of #121, [ADR 0007](docs/adr/0007-improvements-arrive-as-proposals.md)). When Claude or GitHub is set up, a link to an Instagram, TikTok, YouTube or Pinterest post is read by the plugin itself, **also when Claude or GitHub was chosen on purpose** (before, a chosen processor got the link without any reading; "Automatic" already read the post). If the offline rules or the own AI find at least part of a recipe, the note appears at once with the import state `open` / `offen` and the processor improves it in a few minutes (the notice says so). **A run only follows where it is worth it:** with Claude or GitHub chosen on purpose always; with "Automatic" only if the result is incomplete (only ingredients or only steps), a complete one is saved as before, without a run and without cost. The import dialog says beforehand whether a run follows. New setting "Instant first version from the post" (on, shown when Claude or GitHub is set up): off, a processor chosen on purpose gets the link without any reading by the plugin and "Automatic" behaves as before this change. In the overview the recipe is a normal card with the badge "Being improved" and no separate job card; its page has a line with "Sync now" and "View run". You can cook, plan and edit meanwhile. If the processor cannot be asked, the note is closed at once in the state it has without a job (done, or partial with what is missing and the reason), the import dialog shows a warning and a notice offers "Retry". If no improvement arrives in time, the note is closed the same way and the job's card on the overview offers "Retry" (as for every failed job). The same closing applies when a processor reports a failed improvement, when you discard a proposal and when you undo a merge. A post that the plugin cannot read goes to the processor as before. Without a processor nothing changes.
- Improvements arrive as proposals (#132, part 1 of #121, [ADR 0007](docs/adr/0007-improvements-arrive-as-proposals.md)). A processor never rewrites a note; for a job with `verbessern` (Claude: field in the job text; GitHub: workflow input) it writes one file `Verbesserungen/<job id>.md` with images named after the job ID, and Better Cooking merges it into the note that carries the job ID in `auftrag`, with the rules of "Fetch again": what you edited by hand stays, the old version goes to `Vorversionen/`. On the device that started the job it happens at once, if no part you edited would change and the proposal holds nothing suspicious, with the notice "Verbessert: <title>" and Undo. Otherwise the recipe page shows "Verbesserte Fassung bereit" and the dialog of "Fetch again" lists the changes, with "Replace your edit" per part. A proposal without a recipe is listed as "Rezept nicht gefunden" (save as a new recipe or discard). A failed improvement leaves the first version, shows the reason and deletes the proposal. The import state `offen` / `open` (a first version that is still being improved) is now known. A workflow without the input `verbessern` is reported as "Update your workflow to the 0.9 contract". Processors and the GitHub workflow need the 0.9 contract ([import contract](docs/import-contract.md)); nothing changes for normal imports. A proposal is only used if its file name is a job ID that equals its `auftrag`; a note is found only for a known improvement job or one that says `import: offen`; a note without a readable fingerprint always asks first. The review dialog also lists a changed import state or missing timeline, unfolds the new text and can discard the proposal. Deleting a recipe drops its open improvement job (and a waiting proposal). A retry of an improvement starts a new run with a new job ID. The review of a proposal is kept in the job, so it survives a restart. Dataview inline fields (`key:: value`) and Obsidian comments (`%%`) from imports are defused too. The first version itself (instant note) follows in #133.

- Recipe editor (#131, part of #118). The recipe page menu "⋯" has a new first entry "Edit": a full-screen dialog for title, yield, active and total time, category (with suggestions; a category that is a YAML list is only shown), ingredients per group (one per line), steps as cards (title, text, up, down, delete) and tips. Only what you changed is written: the `# Title` line (the file is never renamed, so links stay), the frontmatter fields under the names the note already uses, the key facts line if yield or times changed, and the changed items of the first Ingredients, Steps and Tips sections. Unchanged items keep their exact text (checkboxes, indented lines, `### Group` headings, hints); attempts, notes, images, own sections and own fields stay as they are. A notice "Saved: Ingredients, Steps" has "Undo" for 10 seconds (only while the note is exactly what the edit wrote). If a part changed meanwhile (for example by sync), nothing is written: the parts you did not change take the new text and for each part both changed you choose "Keep my version" or "Take the new one". A note with a `servings` field gets it as an own field. On the first edit of an imported note without a fingerprint, `import_hash` is written from the state before the edit, so the edit counts as made by hand ([ADR 0006](docs/adr/0006-hand-edits-and-the-import-fingerprint.md)). Cooking mode forgets its remembered step if the steps changed in any way (count, text or order). Translations do not change with their original.
- "Fetch again" keeps your hand edits (#130, part of #118). Every import now writes a field `import_hash` (a short fingerprint per imported part: title, description, yield, times, ingredients, steps, tips). If a part differs from it, "Fetch again" marks it "edited by you" and keeps it unless you tick "Replace your edit"; if only such parts differ, the button is locked until you tick one. Formatting changes, bullets, step numbers, ticked checkboxes and the language of the headings do not count as edits. Notes without the field (imported before, or by Claude or the GitHub action) behave as before: everything is replaced and the backup keeps the old version; they are protected once "Fetch again" has written the field. The field can have an own name under "Own field names" (`importHash`). See [ADR 0006](docs/adr/0006-hand-edits-and-the-import-fingerprint.md).
- Delete a recipe completely (#119). The recipe page has a new menu "⋯" with Fetch again, Translate, Open in Obsidian and "Delete recipe". A dialog names what goes before anything happens: the note, its cover image and timeline graphic and other images in `Bilder/` that no other note uses, older versions in `Vorversionen/`, its translations (a checkbox, on by default) and its entries in the meal plan from today on (past days stay). Everything is deleted with Obsidian's own delete, so your setting "Deleted files" decides whether it goes to a trash. Open shopping list items stay, their amounts per recipe are no longer shown. The dialog also offers "Discarded" for when you want a warning if you import the link again.

### Fixed

- A translation whose original was deleted is listed in the overview as a recipe of its own instead of disappearing.

## [0.8.3] - 2026-11-27

Fixes from the beta test of 0.8.2: cooking mode continues where you stopped, recipe pages fit a phone, failed processor imports say why, pasted captions are split better, and smaller fixes on the shopping list, meal plan and settings.

### Added

- Cooking mode continues where you stopped (#114). Closing it (X, Esc, another page) and starting it again for the same recipe within 12 hours continues at that step, also after a restart; a small line "Continuing at step N. Start over" says so and takes you back to step 1. It goes away with the first step change. Per device only (Obsidian's local storage, up to 20 recipes), nothing is written to the note or `data.json`. Reaching the end forgets the recipe; a recipe that now has fewer steps starts at step 1.

### Fixed

- Pasted text and captions: the title loses emoji (also ©®™) and a yield at its end ("für 2 Personen", "(for 4)"; the yield is read from it, but "Grundteig für 12 Muffins", "Meal Prep für 5 Tage" or "für 2026" keep their title), steps the author numbered stay whole (an enumeration in one line is split at its numbers, a step of three or more sentences at the sentence ends), a one-line caption keeps its steps apart from its ingredients (from the first part with a verb on, closing lines such as "Enjoy!" are dropped), a list in the middle of the ingredients is split part by part unless most parts are actions, two or more hashtags at the end mark a caption (not a "Tags:" line), and the hint for missing parts says "text" instead of "page" (English in lowercase for both). "1.5 EL Öl" is no longer read as step number 1 with "5 EL Öl". The title, numbering and list rules apply to every pasted text (#116).
- Cooking mode: the one-time hint "Tap left or right to change steps" is no longer shown on a device without touch (desktop with a mouse), where a click does not turn the page. It is not marked as seen there, so a phone still shows it once (#117).
- Recipe page: a long yield text (for example `1 Focaccia (Backblech oder Backform)`) no longer makes the page wider than a phone screen. The servings control wraps the text onto a second line, and recipe card titles wrap at whole words (long words are hyphenated) instead of breaking inside a word (#113).
- Settings: no more console errors ("t is not a function") when the language changes (#117).
- Shopping list: a can, jar or pack keeps its unit and size ("1 (14 oz) can crushed tomatoes" is "1 can crushed tomatoes (14 oz)", not "1 crushed tomatoes"; also Dose/Dosen, Glas and Packung; the size may stand in front, behind the unit or at the end, with "à", "je", "each" or "ca."). A bracket in front of a unit ("2 (kleine) Dosen Mais") no longer hides the unit. Cans of the same size are added up; cans of different sizes, and a can without a size next to one with a size, stay on separate lines, in any order. Lines that were on the list before this update are not rewritten; adding a recipe again can give a second line next to them (#117).
- Shopping list: "½ lemon, juiced" loses ", juiced" like "1 onion, diced" does; the same for zested, cubed, halved, quartered, entsaftet and abgerieben after a comma. In front of the noun these words still count like the other kitchen words ("cubed potatoes" is not "potatoes"). "Lemon, juice and zest" stays its own line (#117).
- "Fetch again" is no longer shown on recipes that were not imported (no import marker), on translations or for sources that are not a recipe page (#117).
- Meal plan: "+" and "-" on an entry that counts things (loaf, tray, Zopf, pieces) step by 1 instead of halves ("1 ½ loaves"), and the buttons are labelled "one more" / "one less" instead of "one serving more". "-" at 1 or less is disabled; an old entry of ½ is never raised by it (#117).
- The tab title follows a language change at once instead of after reopening the view (#117).
- Import: when a processor fails and writes its failure note, the import now ends as failed instead of "Recipe arrived" (#115). A failure note is a note with `import: failed`, a job ID and no recipe content (no ingredients, steps, tips, notes or attempts); a recipe with `import: failed` and content stays a normal recipe. The job stays on the import cards as failed with the reason from `import_error`, on every device, and the device that started it shows one notice "Import failed: <reason>". "Remove" asks first, naming the notes, and deletes the failure notes (Obsidian's trash setting decides where they go). "Retry" keeps the old failure note but hides it while the new job is open; if the new job fails too, "Remove" deletes both, and if it succeeds, the old failure note is deleted and a notice says so. A failure note without an open job is hidden from the recipe list, the search and the counts and shown under "Failed imports" with its reason.
- "Sync now" says what came of it (#115). After the pull command the plugin looks at the vault for up to 8 seconds (Obsidian Git gives no signal when it is done) for the jobs that were open before. The card then reads "Sync started. Nothing here yet: Claude may still be working, or the sync is taking longer", or says why the sync did not run (already running, no network, Obsidian Git missing). The hint on a waiting card now reads "Claude puts the recipe in your Git repo. This device picks it up at the next sync."

## [0.8.2] - 2026-11-27

Meal plan entries show the unit they were written with, and the shopping list factor no longer mixes servings with loaves.

### Fixed

- Meal plan: an entry like `· 8 servings` for a recipe that yields `1 loaf` showed "8 loaf". The unit written in the entry now wins ("8 servings"); the recipe's unit is used only for a bare number (`· 2` shows "2 loaves") or an entry without servings. "Week to the shopping list" uses the same rule for its factor: the entry's number divided by the recipe's amount, except where the entry and the recipe clearly count different things (servings or people against a concrete unit such as loaf, Zopf or Stück, or the other way round); then the recipe is added as written (factor 1) instead of eight times, and the plan page says so under the number ("Shopping list: 1 loaf"). Units of a yield with a known plural (loaf, roll, slice, cake, tray, muffin, cookie, Zopf, Brot, Blech, Kuchen) are shown in the plural for a number other than 1 on the plan, the recipe page and in new plan entries; other units stay as written. The ingredient parser is unchanged (#109).

## [0.8.1] - 2026-11-27

A calm palette to try under Settings → Colors.

### Added

- A calmer palette: setting "Colors" has the new choice "Calm" (muted sage and off-white in light mode, anthracite with a soft sage in dark mode, text contrast at least 4.5:1). "Kitchen" stays the default (#14).

## [0.8.0] - 2026-11-27

Timers that alert with sound and survive a restart, the amount per recipe on the shopping list, and the groundwork for the Community Directory (safer timeline graphics and page keys, license notices, English command IDs).

### Added

- Shopping list: a tap on a line shared by several recipes shows how much each recipe needs ("Brötchen 200 g, Hefezopf 300 g"), and removing a recipe's ingredients takes exactly its amount off a shared line instead of leaving the full amount. For lines that were added before, changed by hand or whose recipe was edited, no amount is shown or only the name is removed, as before. How a recipe was added (servings factor, left out ingredients) is remembered in the plugin data, not in the note (#68).
- Timers with an alert (#58): they belong to the plugin now, so they keep running when the view is closed and survive a restart (kept per device in Obsidian's local storage, nothing is written into the vault). One timeout per timer, a check every second while timers exist, and a check when the window is visible or in focus again, so a timer rings within a second of the device waking up. When a timer ends: a notice with a Stop button (clicking it away stops the timer), a gong that repeats until Stop (two minutes at most; setting "Timer volume": off, quiet, normal, loud, kept per device), vibration where the device has it, and on the desktop a system notification (asked once when a timer starts; a click opens the recipe) plus a status bar entry with the next timer. A timer found more than 15 minutes late only gets a notice, no gong. The timer bar has "+1 min" and "Stop". The audio context is woken in the tap that starts a timer and on later taps (iOS). On a phone the screen stays on while a timer runs and while the gong plays, and is requested again when Obsidian returns to the foreground (the browser released it before and the screen went dark); the desktop keeps it on only in cooking mode. On a phone the timer still rings only while Obsidian is open; a hint says so once and in the settings.

### Changed

- Command IDs are English now: `oeffnen` is `open-recipes` and `holen` is `import-recipe`. The command names in the palette are unchanged. A hotkey set on one of these two commands, and every reference to them in the mobile toolbar, Commander, QuickAdd or a button, must be set again (#94).
- The license notices of the bundled libraries (Preact, MiniSearch, Lucide icon paths) are kept in `main.js` again (about 6.5 KB more, mostly the full license texts) (#94).

### Security

- Keys that come from page content (microdata `itemprop` names, JSON-LD keys, entity names) can no longer reach the prototype of a local object or pick up inherited values: `__proto__`, `constructor` and `prototype` are dropped, reads use own properties only. A page with `&constructor;` used to put the source of `Object` into the text (#101).
- The timeline graphic of an import is inserted as DOM nodes, and its sanitizer keeps only an allow-list of SVG elements and attributes (no `style`, no references to other files); only the palette classes are kept, ids get a prefix, and input with DOCTYPE or ENTITY is rejected (#94).

## [0.7.0] - 2026-11-27

Social media posts without a processor or AI vendor, captions read by rules, faster arrival of processor imports, settings that follow other devices, and fewer double lines on the shopping list.

### Added

- Social media posts are imported without a processor: Better Cooking reads the public page of an Instagram, TikTok or YouTube link (caption or description, cover image, author) or the recipe link of a Pinterest pin, handles the caption like pasted text (offline rules or your own AI), or, if the caption holds no recipe, follows up to three links in the post to a recipe website with schema.org data (never short links or platform links; an already saved page stops the import). With "Automatic" a set up processor still takes over if nothing readable or no recipe comes back; "Claude" or "GitHub" chosen on purpose work as before. Facebook says to paste the text. This is a single request you start, without login (see SECURITY.md) (#87).
- Pasted text and social media captions: a caption that only points to the recipe ("recipe in bio", "link in bio", "full recipe on my blog", "comment RECIPE") now gives a clear message instead of an empty note, also instead of a request to the own AI (#88).
- While an import by Claude or GitHub waits for its note, the plugin runs the pull of Obsidian Git on the device that started it (not in the first 90 s, then every 30 to 60 s, at most about 23 times, never faster than every 25 s; also when Obsidian returns to the foreground), so the recipe no longer waits for the Git plugin's interval. New setting "Sync during an import" (on by default) and a "Sync now" button on the card of a running import (#82).

### Changed

- The offline text rules read pasted social media captions: the Instagram prefix ("1,234 likes, 56 comments - user on …"), lines of only hashtags or mentions, number and bullet emoji, emoji headings ("🛒 Ingredients"), headings inside a line ("Ingredients: 200 g flour, 1 egg Method: …"), one-line captions with the ingredients separated by commas, and a yield in a heading ("Ingredients for 4 people") or in brackets after the title ("(for 4)"). Headings inside a line and one-line captions are split only for texts that are clearly captions (Instagram prefix, hashtags, number emoji); other pasted texts are not rewritten.
- For every pasted text: headings like "## Ingredients:", "**Ingredients:**" and "#Ingredients" count as headings; "Servings: 4", "For 2 people" and "Serves 4" are read as the yield (a line with a time or a measure such as "For 20 min." is not), without the lead word; "Yield 12" is read as a yield when scaling (#88).
- Shopping list: kitchen work in front of onions, garlic, parsley, chives, carrots, celery, leek, peppers, zucchini, potatoes and apples no longer makes a line of its own. "gehackte Zwiebeln" and "Zwiebeln" or "fein gehackte Petersilie" and "Petersilie" are one line now, and "frisch"/"fresh" is ignored for these. Spices that are also sold dried or ground (ginger, coriander, thyme, basil and the like) are left out on purpose. Varieties and products stay apart ("rote Zwiebeln", "getrocknete Petersilie", "gehackte Tomaten"). An old line like "2 gehackte Zwiebeln" is renamed to "Zwiebeln" when merged. The list is in docs/shopping-identity.md (#69).

### Fixed

- Settings and import jobs that another device changes in `data.json` (Obsidian Sync, Git, iCloud) are picked up while Obsidian runs and merged with this device's state instead of being overwritten by the next save: a job started on the phone stays when the PC saves afterwards, and removals on one device carry over to the other. Open views and the settings tab update. Only the device that started an import closes it and shows "Recipe arrived"; other devices leave it for the starter. Limit: if two devices change the file at the same time while offline and the sync replaces the whole file, the file wins, and a closed job can show up again (it is closed again without a notice). All devices need this version; older versions still overwrite the file (#90).

## [0.6.2] - 2026-11-26

Taps instead of swipes: cooking mode turns pages with a tap on the left or right, and no gesture of the plugin collides with Obsidian's sidebars any more.

### Fixed

- Cooking mode on a phone: a tap on the left or right of the step area changes the step again. The tap is decided when the finger lifts instead of on the click that Obsidian mobile does not always deliver. The outermost strip no longer ignores taps, and the ingredient boxes no longer block the area beside them; only buttons, links, fields and timer chips keep their own tap. The click that follows a turn is swallowed, so it cannot hit a button that appears at that spot (for example "Note attempt" after the last step) (#81).

### Changed

- Swiping is removed from cooking mode (steps) and the meal plan (weeks), because the same gesture opens Obsidian's sidebars. Cooking mode uses taps; the meal plan keeps its arrows for the previous and next week. The recipe page no longer goes back by swiping from the left edge (it collided with Obsidian's left sidebar); the back button and Esc stay (#81).

## [0.6.1] - 2026-11-26

One language setting for the whole plugin, and shopping list and meal plan keep their notes when the language changes.

### Changed

- New setting "Language" at the top (Automatic like Obsidian, Deutsch, English): the view and the settings switch at once, command names after a restart. "Note format" is now "Language of new notes" (Like the interface, Deutsch, English); existing installations keep their stored value, new ones store the language they start in. What is written into the shopping list and the meal plan (weekday headings, servings words, decimal separator) follows it (#77).

### Fixed

- The interface is shown in one language: generic servings words (Portionen, servings, Personen, people) and decimal separators ("1,5 l" or "1.5 l") follow the interface language, also for notes written in the other language; the meal plan page no longer shows "4 Portionen" in an English interface. Units of a recipe (Zopf, Brötchen) stay as written. "1.000 g" and "1,500 ml" are read as 1000 g and 1500 ml, "1,500 kg" as 1.5 kg, in both languages. The placeholder of the translation dialog is translated too (#77).
- Shopping list and meal plan keep their file: changing the note format (or Obsidian's language) no longer switches to a note with another name, so a plan no longer looks empty. An existing note under a default name of either language is found at every access (any letter case), nothing is stored for it; a note that shows up later counts at once. If two notes have entries, the one with more is used (kept while the conflict lasts), the page shows both names with a button to choose, and the choice is stored. Nothing is merged or deleted. The settings show the path you set (empty: automatic) and the file in use (#76).

## [0.6.0] - 2026-11-26

Shopping list and meal plan inside the view, imports made for cooking mode, fetching a recipe again, and one line per ingredient on the shopping list.

### Added

- "Fetch again" on a recipe page of an imported recipe: reads the source once more in the plugin (your own AI only when you press "Read with my AI") and shows what would change (sections, number of ingredients and steps, old to new, a changed cover image). After you confirm it updates title, description, yield, times, ingredients, steps, tips and the cover image, fills category and author only where they are empty and have the standard name (never a field with your own name), and keeps status, rating, last made, attempts, your notes and sections, extra properties and your own header lines. The old version is copied into `Vorversionen/` right before writing (without the job ID, marked with `vorversion`); the plugin never deletes it. Claude and the GitHub action cannot update notes, the dialog says so (#63).
- Meal plan page: the plan as a week (seven days from today, arrows or a swipe to other weeks, today highlighted) with a small card per planned recipe. Add a recipe to a day from your collection (with search), move it to another day, change the servings, remove it, open the recipe or cooking mode, add the shown week to the shopping list, and export the calendar file. The note stays the storage (#65).
- Shopping list page: the shopping list and the meal plan have their own area in the sidebar (wide) and in the lists sheet (narrow). The shopping list shows the list note as a checklist with large tick targets, store sections, a field to add your own items (the amount is recognised), a tap on an item shows which recipes need it, recipe chips remove all ingredients of a recipe, checked items move to "Done" and can be removed. The note stays the storage; the page follows changes to it. "Open note" is a small secondary button; the command "Open shopping list" now opens the page, "Open shopping list as note" the note. The notice after "Add to shopping list" leads to the page (#64).

### Changed

- Shopping list: the same ingredient from different recipes is one line ("200 g Mehl" and "300 g Mehl, gesiebt" become "500 g Mehl"). Preparation and state words (gehackt, fein, zimmerwarm, chopped, softened, ...), brackets, plural forms and spelling variants are ignored; kinds stay apart (Dinkelmehl and Weizenmehl, Type 405 and 550, brauner and weißer Zucker, Milch and Vollmilch). The merged line shows the plainest name. The rules are in `docs/shopping-identity.md` (#66).
- "Retry" on an import card replaces the old job instead of adding a second one. A failed job can be retried at once; a running one after two minutes and after a question, because its run cannot be stopped (#63).
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
