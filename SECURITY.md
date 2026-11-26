# Security policy

## Reporting a vulnerability

Please do **not** open a public issue. Report privately through GitHub: **Security → Report a vulnerability** in this repository. You will get an answer within 7 days.

## Supported versions

Only the latest release receives fixes.

## Areas of particular interest

- **Imported content is untrusted.** Recipes come from arbitrary websites and social media. Anything that lets imported text execute code, inject markup into the plugin view, or steer an AI processor into actions beyond writing one recipe note (prompt injection) is a security issue.
- **Tokens.** Anthropic and GitHub tokens must only live in Obsidian's secret storage and only be sent to the service they belong to.
- **Vault writes.** The plugin may only change recipe notes in the recipe folder, and only the fields documented in [docs/architecture.md](docs/architecture.md). The local website import may only create one new note and its cover image there, never overwrite a file.
- **Local website import.** Page text goes into the note only as plain text: HTML is stripped, and every line is neutralized so it cannot add frontmatter, headings, embeds (`![[…]]`), wikilinks or HTML tags. Only http(s) images of known image types up to 15 MB are saved, and only from public hosts: image addresses pointing to `localhost`, local host names or private, loopback, link-local or multicast IPs are not fetched (`src/network.ts`), so a hostile page cannot make the plugin send requests into the user's network. Redirects are followed by Obsidian and cannot be checked. Backticks, Markdown links, Templater commands (`<%`) and action addresses (`obsidian://`, `javascript:` …) are neutralized too, so the note contains nothing that Templater, Dataview or other plugins could run. Tests with hostile pages: `tests/schemaorg.test.ts`, `tests/importCheck.test.ts`.
- **Notes from processors.** Notes written by a processor (Claude, GitHub workflow) are checked when they arrive (`src/importCheck.ts`): Templater commands, code blocks, inline Dataview queries, active HTML, links that trigger actions and embeds of notes are reported as a warning and on the recipe page. The plugin does not execute or render any of it itself; the check protects against other plugins acting on the note. Requirements for processors: [docs/import-contract.md](docs/import-contract.md#security-requirements-for-processors).
