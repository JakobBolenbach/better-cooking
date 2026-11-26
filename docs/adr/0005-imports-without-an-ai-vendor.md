# 0005: Imports without an AI vendor

- Status: Proposed
- Date: 2026-11-26
- Decided by: Jakob Bolenbach

## Context

Recipe websites with schema.org data are imported by the plugin itself, without AI. Pasted text goes through offline rules or the user's own AI (Anthropic or any OpenAI-compatible endpoint, which includes local servers such as Ollama or LM Studio). Social media posts (Instagram, TikTok, YouTube, Facebook, Pinterest) can only be imported through a processor: a Claude scheduled task or a GitHub workflow with Apify. That needs accounts at outside vendors, tokens, a Git round trip and several minutes of waiting (issue #82).

Tests on 26.11.2026 (issue #83, anonymous requests without login):

- **Instagram:** the post and reel pages carry the full caption (`og:description`) and a cover image (`og:image`); the embed page carries the caption with line breaks. They answer only to a request that looks like a navigation from a mobile browser.
- **TikTok:** the page carries the caption, the cover image and often automatic subtitles; oEmbed no longer returns the caption.
- **YouTube:** the watch and Shorts pages carry the full description and a large image.
- **Pinterest:** the pin page carries the link to the recipe website, which the existing import reads.
- **Facebook:** login wall.

In a small sample about a third of the captions contain a full recipe, another third link to a website, the rest has the recipe only in the video or "in the bio".

A language model inside the plugin is possible only with a WASM runtime (wllama: llama.cpp, about 3 MB gzipped) inlined into `main.js`, because Obsidian installs only `main.js`, `manifest.json` and `styles.css`, and code downloaded at runtime is remote code. On an iPhone the WebView leaves roughly 0.5 GB for a model, which allows models of about 0.6B parameters that are probably too weak for reliable extraction; desktops run 1.7B to 3B models.

The platforms' terms forbid automated collection. Single requests that the user starts for their own recipe collection, without login and without getting around tokens, are the narrowest form of it; this remains a grey area.

## Options

1. Keep processors as the only way for social media (status quo).
2. The plugin reads public captions itself and continues like pasted text: offline rules, or the own AI. Links in a caption to a recipe website go to the existing website import.
3. Option 2, plus a language model inside Better Cooking (wllama inlined).
4. Option 2, plus a language model in a separate, optional companion plugin.
5. Download the model runtime at runtime (rejected: remote code, against the Obsidian developer policies).

## Decision (proposed)

Option 2 now, in three steps: read captions per platform (pure parsers with fixtures, a thin fetch layer, a clear fallback "paste the caption"), follow a recipe link found in the caption, and improve the offline rules for captions (hashtags, mentions, number emoji, one-line captions, "recipe in bio" detected and named). Local models are served through the existing OpenAI-compatible setting and documented (Ollama, LM Studio). Option 4 only later and only on demand, desktop first. Processors stay an option but are no longer required for any source.

## Consequences

- No vendor account is needed for any source; no Git round trip and no waiting for a processor when the caption is enough.
- No new runtime dependency in Better Cooking.
- The parsers depend on undocumented page formats and will break from time to time: fixtures per platform, the fallback to pasting, quick releases.
- The terms-of-use grey area is named in README and SECURITY.md; requests stay single, user-started and without login.
- Recipes that exist only in the video stay out of reach without a processor.
- Docs to update: `import-contract.md`, `architecture.md` (the plugin still writes only the recipe note and its cover image), SECURITY.md, README.
