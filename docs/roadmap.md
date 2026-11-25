# Roadmap

Versions map to [milestones](https://github.com/JakobBolenbach/better-cooking/milestones); details live in the linked issues. Order and scope can change.

## 0.5: Works in any vault (beta)

- Recipe folder and section names configurable; tolerant parsing of missing or English sections.
- No defaults from the original vault; processors are configured by each user.
- No self-reload in release builds (Obsidian policy).
- UI strings in a translation file, English and German.
- Split `App.tsx` into components below the size budget.
- Beta via BRAT with first testers.

## 0.8: Import without extra services

- Read schema.org Recipe data (JSON-LD, microdata) from recipe websites directly in the plugin, no AI needed.
- Optional own AI (Anthropic, OpenAI-compatible or local) and optional Apify token for social media.
- Prompt injection safeguards: imported content as data only, AI output validated against the note format.
- The plugin writes imported notes itself, so every import works in vaults that are not in a Git repository (today the Claude and GitHub processors deliver through GitHub, #13).

## 1.0: Community Directory

- README with screenshots and disclosures, release automation, submission at community.obsidian.md.
- Shopping list: pick recipes, merge ingredients, check them off; add single ingredients from a recipe.
- Appearance: a calm default palette, an option to use the colors of the current Obsidian theme, and colors adjustable through the Style Settings plugin.

## After 1.0 (ideas)

- Share and export as PDF, also on mobile.
- Multilingual recipes (for example German and Spanish), switchable per recipe.
- Weekly meal plan, shopping list from the plan, optional calendar export (ICS).
- Shopping lists per store; price comparison.
- Structure pasted recipe text offline (rules for quantities and steps, or a small on-device model).
- Web app and mobile app that reuse the pure modules (parsing, quantities, search).
