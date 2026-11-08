# Module Documentation Index

Living docs, one per module. **Read the relevant doc before modifying a module; update it in the same change.** See the "Module Documentation Convention" section in `CLAUDE.md` for the workflow.

| Doc | Module | One-liner |
|---|---|---|
| [token-list-data.md](token-list-data.md) | `assets/`, `tokenList.json` | The curated asset data: one JSON file per token plus the generated aggregate list. |
| [scripts.md](scripts.md) | `scripts/`, `scripts/lib/`, `tests/`, `docker/` | Node code that validates assets, regenerates `tokenList.json`, sets trustlines and restores Soroban footprints, with its unit tests. |
| [ci.md](ci.md) | `.github/` | GitHub Actions that gate PRs, run unit tests, regenerate and publish the list, and run the daily footprint job; plus the PR template. |
