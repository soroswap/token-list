# Scripts Module

> **Living document.** Read this before modifying the module. Update it in the same change whenever the module's behavior, commands, or dependencies change.

**Source:** `scripts/`, `scripts/lib/`, `tests/`, `docker/` · **Last verified:** 2026-11-26

## Purpose

Node code that validates contributed asset files, regenerates `tokenList.json`, keeps a hot wallet's trustlines in sync with the list, and announces newly listed tokens on Discord. Soroban footprint TTLs are not managed here: each issuer extends its own token's, and the nightly restore job was removed on 2026-11-26. CI calls the entry scripts directly, so a change here changes what merges and what gets published.

## Structure

Entry points are composition roots: they read env and files, wire real Horizon clients, print, and set the exit code. Every decision lives in `scripts/lib/` with injected dependencies so `tests/` can run it offline.

| File | Purpose |
|---|---|
| `scripts/verifyTokens.js` | The PR gate. Wires `verifyAssets` to the real Horizon client and global `fetch`. |
| `scripts/createTokenList.js` | Wires `mergeAssets`; writes `tokenList.json` only when something changed. |
| `scripts/setTrustlines.js` | Wires `partitionAssetsByTrustline` and `submitTrustline` for the wallet whose secret is `argv[2]`. |
| `scripts/announceNewTokens.js` | Run by the publish workflow with the list before and after `yarn merge`; posts new tokens to `DISCORD_WEBHOOK_URL`, skips when it is unset. With `ANNOUNCE_CONTRACT` set it posts that one listed token again instead (`announce-token.yml`). Not an npm script. |
| `scripts/fromTokenListToAssetsDir.js` | Reverse tool: explodes `tokenList.json` back into `assets/` files. Not wired to any npm script. |
| `scripts/lib/assetSchema.js` | The one AJV schema and `createAssetValidator`. |
| `scripts/lib/jsonFiles.js` | `readJsonFile`, `writeJsonFile`, `readAssetEntries`. |
| `scripts/lib/version.js` | `incrementVersion`, the odometer-style version bump. |
| `scripts/lib/tokenList.js` | `mergeAssets`, `detectChangedKeys`: pure merge of `assets/` into the list. |
| `scripts/lib/horizon.js` | `createHorizonClient`: the two Horizon lookups the gate needs, retried on 429/5xx, then errors mapped to `null`. |
| `scripts/lib/retry.js` | `withRetry` and `TransientError`: bounded backoff for rate limits, gateway errors and dropped connections. |
| `scripts/lib/verify.js` | `verifyAssets`, `checkIconUrl`, `shouldFailPullRequest`: the gate's decisions. |
| `scripts/lib/announce.js` | `findNewAssets`, `findListedAssets`, `thumbnailUrl`, `buildDiscordPayloads`, `postToDiscord`: which tokens are new and the Discord webhook messages for them. |
| `scripts/lib/trustlines.js` | `partitionAssetsByTrustline`, `buildChangeTrustTransaction`, `submitTrustline`. |
| `scripts/test-pr-verify.sh` | Runs `yarn verify` with GitHub Actions PR env vars faked. |
| `tests/*.test.js`, `tests/helpers.js` | Unit tests and shared fakes (USDC fixture, fake Horizon, fake fetch, log collector). |
| `docker/run.sh` | Local harness: runs the repo in a `node:22` container with `.env` mounted (`README.md:78-85`). |

## Commands

All from `package.json:12-17`:

| Command | Script |
|---|---|
| `yarn test` | `node --test tests/*.test.js` |
| `yarn merge` | `scripts/createTokenList.js` |
| `yarn verify` | `scripts/verifyTokens.js` |
| `yarn set-trustlines <SECRET>` | `scripts/setTrustlines.js` |

## Key methods

- **`verifyAssets({ assetEntries, existingList, validate, horizon, fetchImpl, networkPassphrase, log })`** (`scripts/lib/verify.js:94`) returns `{ verifiedNewAssets, assetChanges, verificationErrors }` and never exits. For each entry: schema-validate, then branch on whether the `contract` is already listed. A new asset with an `issuer` runs `verifyClassicAsset` (`:83`) with the domain check on; an edited one runs it with the domain check on only when `domain` is among the changed keys. `shouldFailPullRequest` (`:153`) is the "PR changed nothing" rule. `checkIconUrl` (`:46`) retries 408/425/429/5xx and network errors up to 3 times with 1s then 2s backoff through `withRetry` (`scripts/lib/retry.js:24`), honors a `Retry-After` of up to 10s and otherwise fails at once with a message naming the rate limit; a 404 or a non-image response is final on the first try. The entry script turns errors into exit 1 (`scripts/verifyTokens.js:38`, `:46`, `:56`).
- **`createHorizonClient(url, { server, sleep })`** (`scripts/lib/horizon.js:31`) exposes `getIssuerDomain(issuer)` and `getAssetRecords(code, issuer)`. Both retry a 429, a 5xx or a request with no response up to 3 times (`callWithRetry`, `:12`), then return `null`, which the gate reports as a failed check rather than a crash. `server` is injectable for tests.
- **`mergeAssets(existingList, assetEntries, validate)`** (`scripts/lib/tokenList.js:15`) returns `{ list, added, updated, removed, invalid, changesDetected }` and never mutates its input. Only when `changesDetected` does the version bump and the sort by `contract` happen.
- **`incrementVersion(version)`** (`scripts/lib/version.js:5`) is not semver. Patch increments, rolls to minor at `>9`, minor rolls to major at `>9`, major clamped at 999.
- **`partitionAssetsByTrustline(assets, balances)`** (`scripts/lib/trustlines.js:19`) splits the list into trusted, untrusted and skipped (no `code`/`issuer`). **`submitTrustline`** (`:62`) retries up to `MAX_TRIES = 3` with fee `INITIAL_FEE * tries` (`:4-5`) and resolves `undefined` after the last failure instead of throwing.

## Dependencies

- npm (`package.json:18-22`): `@stellar/stellar-sdk` ^17.4.0, `ajv` ^8.20.0, `ajv-formats` ^3.0.1. Node >= 22.12.0 (`package.json:9-11`). Tests use only `node:test` and `node:assert`.
- Horizon mainnet `https://horizon.stellar.org`, hardcoded in `scripts/verifyTokens.js:9` and `scripts/setTrustlines.js:6`. Network passphrase is `Networks.PUBLIC` everywhere.
- Env vars: `TRUSTLINES_PRIVATE_KEY` passed as `argv[2]` to `setTrustlines`, and `PR_URL`, `DISCORD_WEBHOOK_URL`, `ANNOUNCE_CONTRACT` read by `scripts/announceNewTokens.js:11`, `:19`, `:24`. `.env.local.example` lists only `TRUSTLINES_PRIVATE_KEY`, with no value.

## Gotchas & invariants

- **Run from the repo root.** `assets/` is resolved relative to the script but `tokenList.json` is CWD-relative (`scripts/verifyTokens.js:12`, `scripts/createTokenList.js:9`, `scripts/setTrustlines.js:8`).
- **`yarn verify` exits 1 in PR context when nothing changed.** `GITHUB_EVENT_NAME=pull_request` plus `GITHUB_ACTIONS` set turns `shouldFailPullRequest` on. Locally this is inert unless you use `scripts/test-pr-verify.sh`.
- **`yarn merge` skips invalid assets instead of failing.** `mergeAssets` reports them in `invalid` and the entry script only logs, so a bad file after merge means a silently missing token, not a red build. The PR gate is what should have caught it.
- **A write failure now fails the merge.** `writeJsonFile` no longer swallows errors; an unwritable `tokenList.json` exits non-zero instead of printing and continuing.
- **Keep the SDK at 17.3.0 or newer.** Since mainnet ledger 65633433 (2026-11-23 17:00:11Z) headers carry `StellarValueType` 3 (`stellarValueSignedMs`), which 17.3.0 added to the XDR; on 17.0.1, `rpc.Server.getLatestLedger` throws `LedgerHeader.scpValue.ext.v: unknown enum value 3`. No remaining script decodes a ledger header (the removed footprint job did), but any new RPC code would. Do not pin below 17.3.0.
- **SAC derivation keeps the code's case.** Since SDK 17.3.0, `new Asset(code, issuer)` no longer turns any spelling of `xlm` into `XLM`, so `assertContractMatchesAsset` (`scripts/lib/verify.js:64-71`) derives a different contract for an issued asset coded `xlm`, `Xlm` and so on. No listed asset has such a code.
- **`setTrustlines` never fails the build for a rejected trustline.** `submitTrustline` swallows the last error, and `main()`'s `.catch` only logs (`scripts/setTrustlines.js:51-57`), so a missing trustline never blocks the publish workflow. The only fatal cases are a missing secret (`:13`) and an empty list (`:19`).
- **Icon hosts that rate-limit get a capped retry.** `ipfs.io`, which used to host 17 icons, answered bursts with 429 and `Retry-After: 900`; no listed icon uses it since 2026-11-19 because its gateway is retired. Any host that answers 429 or 5xx is retried a few times, and the cap is deliberately far below 900s so CI fails fast instead of hanging. Wait and re-run.
- **Never log secrets.** The old `printKeypair()` that printed the secret key was removed in the SDK 17 migration. Do not add it back.

## Testing

`yarn test` runs 90 tests across nine files with Node's built-in runner, no network. Fakes live in `tests/helpers.js`: the real USDC code/issuer/contract so SAC derivation runs for real, a fake Horizon (`getIssuerDomain`, `getAssetRecords`), a fake `fetch`, and a log collector. `tests/retry.test.js` and `tests/horizon.test.js` pin the backoff schedule, the `Retry-After` cap and which Horizon statuses are retried, all with an injected `sleep` so no test waits. New behavior in `scripts/lib/` gets its failing test first; the entry scripts are covered by running them (`yarn verify` on a clean tree, `yarn merge` as a no-op, the missing-env exit codes).
