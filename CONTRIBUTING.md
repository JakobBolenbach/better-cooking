# Contributing

Thanks for your interest in Better Cooking.

## Issues first

- **Bugs:** use the bug report template. Include your Obsidian version, platform (desktop or mobile) and, if possible, a recipe note that shows the problem (remove anything private).
- **Ideas:** use the feature request template. Describe the problem you want solved, not only the solution.
- **Security:** never in a public issue, see [SECURITY.md](SECURITY.md).

## Code contributions

Better Cooking is licensed under the PolyForm Noncommercial License, and the maintainer offers separate commercial licenses. To keep that possible, every code contribution needs a **contributor license agreement (CLA)** that lets the maintainer license your contribution under both. The CLA is not set up yet, so **pull requests from outside contributors cannot be merged for now**. Please open an issue instead; your idea will be credited.

## Workflow (maintainers)

1. Create a branch from `main`: `feat/…`, `fix/…`, `docs/…`, `chore/…`, `refactor/…`.
2. Commit with [Conventional Commits](https://www.conventionalcommits.org/) (`feat: shopping list from selected recipes`).
3. Run `pnpm check` before pushing. CI runs the same checks plus the build.
4. Open a pull request, fill in the template, squash-merge when CI is green.
5. Add a line to `CHANGELOG.md` under "Unreleased" for every user-visible change.
6. Record decisions with lasting impact as an ADR in `docs/adr/`.

## Code guidelines

- TypeScript in strict mode; logic as pure functions in `src/*.ts` with Vitest tests, UI in `src/ui/`.
- Keep files and functions small. Files should stay under about 400 lines; split before they grow.
- Follow Obsidian's [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines); `pnpm lint` enforces Obsidian's own ESLint rules.
- No network access without the user starting it, no telemetry, no secrets in `data.json`.
- Never commit build output (`main.js`, `styles.css`); releases are built by CI.

## AI-assisted contributions

Using AI tools is fine. You are responsible for every line you submit: read it, test it, and keep it within the guidelines above. Agents working in this repository follow [AGENTS.md](AGENTS.md).
