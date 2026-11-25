# 0002: Tooling and quality gates

- Status: Accepted
- Date: 2026-11-24
- Decided by: Jakob Bolenbach

## Context

The plugin will be developed largely with AI agents over many sessions. Codebases built that way tend to erode: files and functions grow, duplicates appear, conventions drift. Quality has to be enforced by tools, not by memory.

## Decision

- **pnpm 10** with a committed lockfile, Node.js 22.
- **TypeScript strict**, bundled with **esbuild**; Preact for the UI.
- **ESLint with `eslint-plugin-obsidianmd` (recommended)**, the same rules the Obsidian Community Directory uses in its automated review, including type-checked typescript-eslint rules.
- **Prettier** (print width 120) for formatting.
- **Vitest** for all logic in pure modules.
- `pnpm check` runs format check, lint, typecheck and tests; **CI** runs it plus the build on every pull request and on `main`.
- **Releases** are built by CI from a version tag; build output is never committed.
- **Dependabot** proposes dependency updates weekly as pull requests.
- **Size budget:** new files stay under about 400 lines; larger files are split before new features are added to them.
- Decisions with lasting impact are recorded as ADRs; user-visible changes go to the changelog.

## Consequences

- A change only lands on `main` through a pull request with green CI (enforced by convention; branch protection needs GitHub Pro or a public repository and should be switched on when the repository goes public).
- The lint rules mirror the directory review, so submission problems show up early.
- Major updates (TypeScript 7, Vitest 5, ESLint 10, Preact 11) are separate pull requests with their own checks.
