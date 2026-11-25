# Beta testing

Better Cooking is in beta. Testers install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat) (Beta Reviewers Auto-update Tester), which also keeps it up to date. No account or token is needed.

## Install

1. In Obsidian: Settings → Community plugins → Browse, install and enable **BRAT**.
2. Settings → BRAT: turn on the option to update beta plugins when Obsidian starts.
3. Command palette: **BRAT: Add a beta plugin for testing**, enter `JakobBolenbach/better-cooking`, confirm.
4. Settings → Community plugins: enable **Better Cooking**. Obsidian 1.11.4 or later is required.

On a phone or tablet repeat the steps there.

<details>
<summary>Only if the repository is private (invited testers)</summary>

BRAT then needs a GitHub token to read the repository:

1. Accept the invitation to `JakobBolenbach/better-cooking` on GitHub.
2. On GitHub: Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token. Repository access: only `JakobBolenbach/better-cooking` (or "All repositories" if it is not offered). Permissions: Contents, read-only, nothing else. Expiration: end of the beta.
3. Settings → BRAT: enter the token in the field for a GitHub personal access token, then continue with step 3 above. The same token works on every device; delete it on GitHub when you leave the beta.

</details>

## First steps

- Settings → Better Cooking: choose the recipe folder (default `Recipes`). An empty folder is fine.
- Open the chef's hat in the left sidebar, then **+**: paste the link of a recipe website. Sites with schema.org recipe data (most large recipe sites) are imported without AI or account.
- Recipe notes you write yourself follow [docs/recipe-format.md](recipe-format.md).

## What to look at

- Overview, search, recipe page with servings, cooking mode with timers, on desktop and on the phone.
- Import of recipe websites you actually use: what worked, what was missing.
- Anything confusing, slow or broken.

## Feedback

Open an issue with the bug or feature template. Leave out private data (tokens, personal paths, other people's recipes). For a security problem use a private security advisory instead (see [SECURITY.md](../SECURITY.md)).

## Leaving the beta

BRAT: remove Better Cooking from the beta list, then uninstall it in Community plugins. Your recipe notes stay in your vault.
