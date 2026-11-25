# Better Cooking

Browse, search and cook your recipe notes in [Obsidian](https://obsidian.md): a card overview, instant search, a recipe page with a servings calculator, a step-by-step cooking mode with timers, and import from a link.

> **Status: beta (0.x).** Better Cooking grew out of a private vault and is being prepared for the Obsidian Community Directory ([Roadmap](docs/roadmap.md)). The recipe folder is configurable, the note format is documented in [docs/recipe-format.md](docs/recipe-format.md), and the interface is available in English and German, following Obsidian's language.

## Features

- **Overview:** recipe cards with photo, time, category, status and rating; lists for tried and tested, to try, recently cooked, by category.
- **Search:** instant, offline full-text search with prefix matching, typo tolerance, German normalization (ä = ae) and compound words (`mehl` finds `Dinkelmehl`).
- **Recipe page:** servings calculator with sensible rounding, checkable ingredients, timeline graphic, numbered steps where every duration is a timer button, tips, attempts log, photos.
- **Cooking mode:** one step per screen in large type, ingredients used in that step, screen stays on, multiple timers.
- **Track your cooking:** status, star rating, "made today" and an attempts log, written to the note's frontmatter.
- **Import (optional):** paste a link or recipe text and hand it to a processor you set up yourself. Duplicate sources are detected before anything is sent.
- Light and dark "kitchen" palette, works on desktop and mobile.

## Installation

Not yet in the Community Directory. Beta testers install it with BRAT and get updates automatically: [docs/beta-testing.md](docs/beta-testing.md). Or install a release manually:

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/JakobBolenbach/better-cooking/releases).
2. Copy them to `<your vault>/.obsidian/plugins/better-cooking/`.
3. Reload Obsidian and enable **Better Cooking** under Settings → Community plugins.

Requires Obsidian 1.11.4 or later.

## Recipe notes

Better Cooking reads Markdown notes with a fixed structure (frontmatter plus sections such as `## Zutaten` and `## Schritte`). The format is described in [docs/recipe-format.md](docs/recipe-format.md). Making the folder and section names configurable is planned for 0.5.

## Network use, accounts and privacy

Better Cooking works fully offline. It only uses the network when **you** start an import, and only with services **you** configure:

- **Claude (Anthropic):** sends the link or text to your own scheduled task through Anthropic's API. Needs your own Anthropic account and token.
- **GitHub:** starts a workflow in your own repository through the GitHub API. Needs your own GitHub token.

Tokens are stored in Obsidian's secret storage (the device keychain), never in the vault or in `data.json`. There is no telemetry and no tracking. Details of what a processor receives and must return: [docs/import-contract.md](docs/import-contract.md).

## License

Better Cooking is **source-available** under the [PolyForm Noncommercial License 1.0.0](LICENSE).

- You may use, copy, modify and share it for any **noncommercial** purpose: personal use, hobby projects, research, education, charities and similar.
- **Commercial use** (selling it, bundling it with a paid product or service, using it in a business) needs a separate license. Ask via [GitHub](https://github.com/JakobBolenbach).

Because it restricts commercial use, this is not an "open source" license in the sense of the [Open Source Definition](https://opensource.org/osd). The reasoning is recorded in [ADR 0001](docs/adr/0001-license.md). Third-party components and their licenses: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Contributing

Bug reports and ideas are welcome as [issues](https://github.com/JakobBolenbach/better-cooking/issues). Code contributions need a contributor license agreement first, see [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

## Development

Requires Node.js 22 and pnpm 10.

```sh
pnpm install
pnpm check      # format, lint (Obsidian's rules), typecheck, tests
pnpm build      # styles.css + main.js
pnpm preview    # then open dev/preview.html in a browser, no Obsidian needed
pnpm dev        # watch build; in Obsidian, this build reloads itself after each rebuild
```

Architecture: [docs/architecture.md](docs/architecture.md). Decisions: [docs/adr/](docs/adr/). Changes: [CHANGELOG.md](CHANGELOG.md).
