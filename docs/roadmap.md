# Roadmap

Versions map to [milestones](https://github.com/JakobBolenbach/better-cooking/milestones); details live in the linked issues. Order and scope can change.

## Released (beta, via BRAT)

- **0.5:** works in any vault: recipe folder, English or German notes and interface, website import without AI, own AI (Anthropic, OpenAI-compatible or local), shopping list with stores, meal plan with calendar export, sharing and PDF, translations, theme colors.
- **0.6:** fetch a recipe again, imports made for cooking mode, shopping list and meal plan as pages in the view, the same ingredient from several recipes as one line, one language setting for the whole plugin, taps instead of swipes in cooking mode.
- **0.7:** social media posts without a processor or AI vendor ([ADR 0005](adr/0005-imports-without-an-ai-vendor.md)), offline rules for captions, faster arrival of processor imports (Obsidian Git pull while a job waits), `data.json` changes from other devices are merged, kitchen work in front of onions and herbs no longer splits a line.
- **0.8:** timers that alert with sound and survive a restart, amount per recipe on the shopping list, safer timeline graphics and page keys, license notices, English command IDs. 0.8.3: cooking mode continues at the last step, recipe pages fit a phone, failed processor imports say why, better pasted captions.
- **0.9:** edit a recipe by hand (hand edits survive "Fetch again", [ADR 0006](adr/0006-hand-edits-and-the-import-fingerprint.md)), delete a recipe completely, feedback and fetch again with it, an instant first version of a social post that the processor improves later ([ADR 0007](adr/0007-improvements-arrive-as-proposals.md)).

## 1.0: Community Directory

- Test on desktop and phone, first testers via BRAT (#4).
- Decide the default palette (#14: a calm palette is available as an option).
- README screenshots, release 1.0.0, preview scan and submission at community.obsidian.md (#8).

## After 1.0 (ideas)

- Calendar integration for the meal plan (#67).
- Shopping lists per store and price comparison (#12).
- A model on the device as an optional companion plugin, desktop first (#83).
- Processors hand their result to the plugin without Git (#13).
- PDF on mobile without the print dialog.
- Real phone timers through iOS Shortcuts or Android (#122).
- Web app and mobile app that reuse the pure modules (#16).
