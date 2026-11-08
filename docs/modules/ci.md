# CI and Publishing Module

> **Living document.** Read this before modifying the module. Update it in the same change whenever a workflow, secret, or the contribution flow changes.

**Source:** `.github/` · **Last verified:** 2026-11-08

## Purpose

Four GitHub Actions workflows own the whole lifecycle: gate incoming token PRs, unit-test script changes, regenerate and publish `tokenList.json` after merge (announcing newly listed tokens on Discord), and keep listed Soroban contracts alive. The PR template is the contributor-facing half of the gate.

## Structure

| File | Trigger | Purpose |
|---|---|---|
| `workflows/verify-new-tokens.yml` | `pull_request`, `workflow_dispatch` (`:3-7`) | Runs `yarn verify` on every PR (`:23`). |
| `workflows/test.yml` | `pull_request` and `push` to `main`, only for `scripts/**`, `tests/**`, `package.json`, `yarn.lock` and itself (`:5-10`, `:14-19`) | `yarn install --frozen-lockfile` then `yarn test` (`:33`, `:36`). |
| `workflows/update-token-list.yml` | `push` to `main` touching `assets/**` (`:3-8`) | Regenerates the list, commits it, announces new tokens on Discord, sets trustlines. |
| `workflows/restore-footprint-of-contracts.yml` | `workflow_dispatch` and cron `"7 1 * * *"`, 01:07 UTC (`:3-7`) | Runs `yarn restore-footprints` (`:26`). |
| `PULL_REQUEST_TEMPLATE.md` | every new PR | Token-submission checklist (one file under `assets/`, no `tokenList.json` edits, domain equals `home_domain`, `yarn verify` passes, SAC vs custom token) plus a short maintainer-change section. |

All workflows use `actions/checkout@v7` and `actions/setup-node@v7` with Node `22`.

## Pipeline

**PR gate** (`workflows/verify-new-tokens.yml:20-23`): `yarn install`, then `yarn verify`. See [scripts.md](scripts.md) for what `verify` asserts.

**Unit tests** (`test.yml`): path-filtered so token-only PRs do not run it.

**Publish** (`update-token-list.yml`), in order:
1. The current `tokenList.json` is copied to `$RUNNER_TEMP/tokenList.before.json` (`:31`).
2. `yarn merge` regenerates `tokenList.json` (`:34`).
3. `stefanzweifel/git-auto-commit-action@v7` commits with message `"Update tokenList.json"` (`:39`).
4. `scripts/announceNewTokens.js` diffs the two lists and posts one Discord embed per token whose `contract` was not listed before, to the webhook in `secrets.DISCORD_TOKEN_LIST_WEBHOOK`, linking the merged PR when `gh api .../commits/<sha>/pulls` finds one (`:47-55`). Edits to listed tokens are not announced. The step is `continue-on-error`, so a failed post leaves the job green with a `::warning` annotation and is not retried later, and it skips when the secret is unset.
5. `yarn set-trustlines ${{ secrets.TRUSTLINES_PRIVATE_KEY }}` (`:58`).

The indexer sync step was removed in #115.

**Footprint restore** (`workflows/restore-footprint-of-contracts.yml:26-31`): `yarn restore-footprints` with `PRIVATE_KEY`, `RPC_URL`, `HORIZON_URL` (secret, defaulting to `https://horizon.stellar.org`) and `SOROSWAP_API_KEY`.

## Contribution flow (how a token gets added)

From `README.md:29-56`:
1. Fork and clone.
2. Add `assets/<CONTRACT_ADDRESS>.json` (`README.md:40`).
3. Fill the fields, cross-checking the asset's Stellar TOML.
4. Run `yarn` then `yarn verify` locally.
5. Open a PR that only adds the asset file and fill in the template (`README.md:50`).

PRs touching anything else are closed (`README.md:54`), and `tokenList.json` must not be edited by hand because the merge workflow regenerates it (`README.md:55`).

`.claude/skills/token-pr-security-check/SKILL.md` is a repo-local review skill for auditing open token PRs (SAC derivation, issuer `home_domain`, Horizon records, icon, issuer lock status). It is advisory and explicitly never merges (`:9`).

## Dependencies

- Secrets consumed: `DISCORD_TOKEN_LIST_WEBHOOK`, `TRUSTLINES_PRIVATE_KEY` (`workflows/update-token-list.yml:50,58`), `PRIVATE_KEY`, `RPC_URL`, `SOROSWAP_API_KEY`, optional `HORIZON_URL` (`workflows/restore-footprint-of-contracts.yml:28-31`), plus the default `GITHUB_TOKEN`.
- Downstream: a Discord channel through the webhook. The indexer sync described in `GITHUB_ACTIONS_INTEGRATION.md` no longer runs (removed in #115).

## Gotchas & invariants

- **`SOROSWAP_API_KEY` must exist as a repository secret** or the nightly footprint job fails inside `populatePairs` after a successful startup. Before 2026-09-06 the workflow set neither `HORIZON_URL` nor `SOROSWAP_API_KEY`, so the job exited at startup and had not been restoring anything; the workflow now sets both, but the secret itself is created in the GitHub UI, not in this repo.
- **`GITHUB_ACTIONS_INTEGRATION.md` is a proposal, not the live config.** Its example workflow (`:64-117`) uses `actions/checkout@v4`, Node 20 and a manual git commit; the real `update-token-list.yml` uses v7, Node 22 and `git-auto-commit-action`. Read the workflow file, not the doc, for current behavior.
- **The publish workflow only fires on `assets/**` pushes** (`workflows/update-token-list.yml:7-8`). Editing `tokenList.json` directly on `main` never triggers a sync.
- **The Discord announcement is public and built from contributor data.** Text fields are escaped, including `:` and `<` so bare URLs and mentions do not render, newlines are collapsed, and `allowed_mentions` is empty so nothing pings. `Domain` is shown only for tokens with an issuer, the one case the gate checks it against `home_domain`; tokens without an issuer are labelled `Soroban token (not verified on-chain)`. `name`, `org`, `code` and the icon are still whatever the contributor wrote, and a token with no issuer passes the gate with no on-chain checks at all, so a green check does not mean it is genuine. Anything merged is announced, so review before merging, not after.
- **`yarn set-trustlines` is the last step** (`workflows/update-token-list.yml:58`). It only fails on a missing secret or an empty list. Actual trustline submission failures are swallowed and the step still exits 0, so a missing trustline never blocks, or signals, the publish.
- **`ipfs.io` rate limiting can fail a legitimate token PR.** GitHub runners share egress IPs, and the icon host answers a burst with 429 and `Retry-After: 900`. The gate reports it as "rate limited by the icon host" rather than a broken icon; re-run the job after 15 minutes before asking the contributor for anything.
- **The unit-test workflow does not run on token PRs.** It is path-filtered to script and test changes, so a contributor cannot see it and a token PR is judged by `verify-new-tokens.yml` alone.
- The funded footprint account is documented as `GB5KBIU6KUCKEVVDZOMIIJAKGAEOKQOBZX5TMOBXGCU3D5RAO22WETXE` (`README.md:75`) and the trustlines wallet as `GBHYCV7DRS3GTFZYTW4MTHMBKRJJSZKV7LSCAERQQKUHZRYBW34FGUE4` (`README.md:100`).

## Testing

`test.yml` runs `yarn test` in CI for script changes. `scripts/test-pr-verify.sh` reproduces the PR gate locally by setting `GITHUB_EVENT_NAME=pull_request GITHUB_ACTIONS=true` before `yarn verify`.
