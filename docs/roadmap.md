# Roadmap

Versions map to [milestones](https://github.com/JakobBolenbach/better-cooking/milestones); details live in the linked issues. Order and scope can change.

## 0.5: Works in any vault (beta)

Done in 0.5.0:

- Recipe folder, English or German note format and own field names; English and German interface.
- Import from recipe websites (schema.org JSON-LD and microdata) directly in the plugin; pasted text by offline rules or the own AI (Anthropic, OpenAI-compatible or local), which writes the note itself without Git.
- Safeguards against imported content that other plugins would run.
- Shopping list with merging and sections per store, weekly meal plan with calendar export, sharing as text or PDF, translations with the own AI.
- Obsidian theme colors and Style Settings for the palette.

Open:

- Test in Obsidian on desktop and phone, then the BRAT beta with first testers (#4).

## 0.8: Import without extra services

- Optional Apify token for social media posts with the own AI.
- The Claude and GitHub processors still deliver through GitHub; delivering their result to the plugin needs a change of the import contract (#13).

## 1.0: Community Directory

- Release 1.0.0 and the submission at community.obsidian.md (#8).
- A calmer default palette (#14).

## After 1.0 (ideas)

- PDF on mobile without the print dialog.
- Price comparison for the shopping list (#12).
- Web app and mobile app that reuse the pure modules (#16).
