# 0001: PolyForm Noncommercial license

- Status: Accepted
- Date: 2026-11-24
- Decided by: Jakob Bolenbach

## Context

The plugin should be free for everyone to use, read, modify and share, while the right to sell it or license it commercially stays with the author. The repository started with an MIT license, which would allow anyone to sell the plugin. The repository was private until this decision, so no copy was ever distributed under MIT.

Options considered:

| Option                                | Commercial use by others | "Open source" (OSD) | Fit                                                                           |
| ------------------------------------- | ------------------------ | ------------------- | ----------------------------------------------------------------------------- |
| MIT                                   | allowed                  | yes                 | does not keep sales rights                                                    |
| GPL/AGPL plus commercial dual license | allowed under copyleft   | yes                 | others may still sell under GPL terms                                         |
| CC BY-NC 4.0                          | not allowed              | no                  | made for media, not for software (no patent or code-specific terms)           |
| PolyForm Noncommercial 1.0.0          | not allowed              | no                  | written for software, clear noncommercial definition, includes patent license |

## Decision

License the code under the **PolyForm Noncommercial License 1.0.0**, with the required notice `Copyright (c) 2026 Jakob Bolenbach`. Commercial licenses are granted separately by the author on request.

## Consequences

- The project is described as **source-available**, not as open source.
- The Obsidian Community Directory accepts it; it requires a `LICENSE` file, not an OSI license.
- External code contributions need a contributor license agreement before they can be merged, so the author can keep offering commercial licenses (see CONTRIBUTING.md).
- Third-party components keep their own licenses (THIRD_PARTY_NOTICES.md); all of them (MIT, ISC, SIL OFL) allow this combination.
- This is not legal advice; before selling commercial licenses, the terms should be checked by a lawyer.
