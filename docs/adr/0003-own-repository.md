# 0003: Own repository, port of version 0.1.4

- Status: Accepted
- Date: 2026-11-24
- Decided by: Jakob Bolenbach

## Context

Version 0.1.4 was developed inside the author's private Obsidian vault (as plugin `rezepte`). That location mixes private data with the code and cannot be published.

## Decision

- Development continues in this repository; the plugin gets the ID `better-cooking` and the name "Better Cooking" (the ID was free in the directory on 2026-11-24).
- The code of 0.1.4 is ported with only the changes needed for a public repository: private defaults (repository, scheduled task ID) removed, test recipes replaced by self-written examples, fonts taken from npm packages instead of the vault, references to private documentation replaced by `docs/`, lint findings fixed without changing behavior, `minAppVersion` raised to 1.11.4 because secret storage needs it.
- Behavioral changes (configurable folder, English UI, removing self-reload) follow in separate pull requests.

## Consequences

- The private vault switches from its own copy to release builds of this repository once 0.5 is out. Until then the vault copy stays as is.
- Size and test count of 0.1.4 serve as the baseline for measuring code erosion later.
