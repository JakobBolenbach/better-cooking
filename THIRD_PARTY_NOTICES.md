# Third-party notices

Better Cooking includes or bundles the following components. Their licenses apply to those components only.

| Component                                                     | Use                                                                                        | License                                 | Notice                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Preact](https://github.com/preactjs/preact)                  | UI rendering, bundled into `main.js`                                                       | MIT                                     | Copyright (c) 2015-present Jason Miller. Full text: [licenses/MIT-Preact.txt](licenses/MIT-Preact.txt)                                                                           |
| [MiniSearch](https://github.com/lucaong/minisearch)           | Full-text search, bundled into `main.js`                                                   | MIT                                     | Copyright 2022 Luca Ongaro. Full text: [licenses/MIT-MiniSearch.txt](licenses/MIT-MiniSearch.txt)                                                                                |
| [Lucide](https://lucide.dev)                                  | Icon paths in `src/ui/icons.tsx` and the app icon in `src/view.ts`, both also in `main.js` | ISC, MIT for parts derived from Feather | Copyright (c) 2026 Lucide Icons and Contributors; copyright (c) 2013-present Cole Bemis (Feather). Full text: [licenses/Lucide-ISC-and-MIT.txt](licenses/Lucide-ISC-and-MIT.txt) |
| [Source Serif 4](https://github.com/adobe-fonts/source-serif) | Font, embedded in `styles.css`                                                             | SIL Open Font License 1.1               | Full text: [licenses/OFL-1.1-Source-Serif-4.txt](licenses/OFL-1.1-Source-Serif-4.txt)                                                                                            |
| [IBM Plex Sans](https://github.com/IBM/plex)                  | Font, embedded in `styles.css`                                                             | SIL Open Font License 1.1               | Copyright 2019 IBM Corp. Full text: [licenses/OFL-1.1-IBM-Plex-Sans.txt](licenses/OFL-1.1-IBM-Plex-Sans.txt)                                                                     |

The fonts are taken unmodified from the [@fontsource](https://fontsource.org) packages (Latin subset) and embedded as data URIs because Obsidian cannot load relative font files from plugin styles.

The notices of Preact, MiniSearch and Lucide are also at the top of `main.js` (built from the files in `licenses/` by `esbuild.config.mjs`).

Development tools (TypeScript, esbuild, ESLint, Vitest, Prettier and their dependencies) are not part of the released plugin.
