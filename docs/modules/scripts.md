# Scripts Module

> **Living document.** Read this before modifying the module. Update it in the same change whenever the module's behavior, commands, or dependencies change.

**Source:** `scripts/`, `scripts/lib/`, `tests/`, `docker/` · **Last verified:** 2026-09-06

## Purpose

Node code that validates contributed asset files, regenerates `tokenList.json`, keeps a hot wallet's trustlines in sync with the list, and bumps Soroban footprint TTLs for listed contracts and their pools. CI calls the entry scripts directly, so a change here changes what merges and what gets published.

## Structure

Entry points are composition roots: they read env and files, wire real Horizon / RPC clients, print, and set the exit code. Every decision lives in `scripts/lib/` with injected dependencies so `tests/` can run it offline.

| File | Purpose |
|---|---|
| `scripts/verifyTokens.js` | The PR gate. Wires `verifyAssets` to the real Horizon client and global `fetch`. |
| `scripts/createTokenList.js` | Wires `mergeAssets`; writes `tokenList.json` only when something changed. |
| `scripts/setTrustlines.js` | Wires `partitionAssetsByTrustline` and `submitTrustline` for the wallet whose secret is `argv[2]`. |
| `scripts/restoreFootprintOfTokenContracts.js` | Wires `FootprintRestorer` to `rpc.Server` and `Horizon.Server` from env. |
| `scripts/fromTokenListToAssetsDir.js` | Reverse tool: explodes `tokenList.json` back into `assets/` files. Not wired to any npm script. |
| `scripts/lib/assetSchema.js` | The one AJV schema and `createAssetValidator`. |
| `scripts/lib/jsonFiles.js` | `readJsonFile`, `writeJsonFile`, `readAssetEntries`. |
| `scripts/lib/version.js` | `incrementVersion`, the odometer-style version bump. |
| `scripts/lib/tokenList.js` | `mergeAssets`, `detectChangedKeys`: pure merge of `assets/` into the list. |
| `scripts/lib/horizon.js` | `createHorizonClient`: the two Horizon lookups the gate needs, retried on 429/5xx, then errors mapped to `null`. |
| `scripts/lib/retry.js` | `withRetry` and `TransientError`: bounded backoff for rate limits, gateway errors and dropped connections. |
| `scripts/lib/verify.js` | `verifyAssets`, `checkIconUrl`, `shouldFailPullRequest`: the gate's decisions. |
| `scripts/lib/trustlines.js` | `partitionAssetsByTrustline`, `buildChangeTrustTransaction`, `submitTrustline`. |
| `scripts/lib/footprint.js` | `FootprintRestorer` plus pure helpers (`normalizePools`, `needsBump`, `isAccountNotFound`, ...). |
| `scripts/restore-footprints.sh` | Sources `.env` then runs `yarn restore-footprints`. |
| `scripts/test-pr-verify.sh` | Runs `yarn verify` with GitHub Actions PR env vars faked. |
| `scripts/restoreEntriesXLMAQUAXTAR.json` | Data file. No script references it. |
| `tests/*.test.js`, `tests/helpers.js` | Unit tests and shared fakes (USDC fixture, fake Horizon, fake fetch, log collector). |
| `docker/run.sh` | Local harness: runs the repo in a `node:22` container with `.env` mounted (`README.md:78-85`). |

## Commands

All from `package.json:12-19`:

| Command | Script |
|---|---|
| `yarn test` | `node --test tests/*.test.js` |
| `yarn merge` | `scripts/createTokenList.js` |
| `yarn verify` | `scripts/verifyTokens.js` |
| `yarn set-trustlines <SECRET>` | `scripts/setTrustlines.js` |
| `yarn restore-footprints` | `scripts/restoreFootprintOfTokenContracts.js` |
| `yarn restore-footprints:env` | `scripts/restore-footprints.sh` |

## Key methods

- **`verifyAssets({ assetEntries, existingList, validate, horizon, fetchImpl, networkPassphrase, log })`** (`scripts/lib/verify.js:94`) returns `{ verifiedNewAssets, assetChanges, verificationErrors }` and never exits. For each entry: schema-validate, then branch on whether the `contract` is already listed. A new asset with an `issuer` runs `verifyClassicAsset` (`:83`) with the domain check on; an edited one runs it with the domain check on only when `domain` is among the changed keys. `shouldFailPullRequest` (`:153`) is the "PR changed nothing" rule. `checkIconUrl` (`:46`) retries 408/425/429/5xx and network errors up to 3 times with 1s then 2s backoff through `withRetry` (`scripts/lib/retry.js:24`), honors a `Retry-After` of up to 10s and otherwise fails at once with a message naming the rate limit; a 404 or a non-image response is final on the first try. The entry script turns errors into exit 1 (`scripts/verifyTokens.js:38`, `:46`, `:56`).
- **`createHorizonClient(url, { server, sleep })`** (`scripts/lib/horizon.js:31`) exposes `getIssuerDomain(issuer)` and `getAssetRecords(code, issuer)`. Both retry a 429, a 5xx or a request with no response up to 3 times (`callWithRetry`, `:12`), then return `null`, which the gate reports as a failed check rather than a crash. `server` is injectable for tests.
- **`mergeAssets(existingList, assetEntries, validate)`** (`scripts/lib/tokenList.js:15`) returns `{ list, added, updated, removed, invalid, changesDetected }` and never mutates its input. Only when `changesDetected` does the version bump and the sort by `contract` happen.
- **`incrementVersion(version)`** (`scripts/lib/version.js:5`) is not semver. Patch increments, rolls to minor at `>9`, minor rolls to major at `>9`, major clamped at 999.
- **`partitionAssetsByTrustline(assets, balances)`** (`scripts/lib/trustlines.js:19`) splits the list into trusted, untrusted and skipped (no `code`/`issuer`). **`submitTrustline`** (`:62`) retries up to `MAX_TRIES = 3` with fee `INITIAL_FEE * tries` (`:4-5`) and resolves `undefined` after the last failure instead of throwing.
- **`FootprintRestorer`** (`scripts/lib/footprint.js:54`) takes `{ server, horizonServer, keypair, fetchImpl, sleep, log, logError }`. `restoreFootprintToContract` (`:174`) reads the contract instance footprint, compares `liveUntilLedgerSeq` with the latest ledger via `needsBump` (`:42`), and submits a `restoreFootprint` transaction only when expired. `restoreLedgerEntriesForTokenListAsset` (`:330`) simulates `skim` on every Soroswap pool holding the asset (`skimTransaction`, `:264`) and, if the simulation returns a `restorePreamble` (`checkRestoration`, `:234`), submits it (`handleLedgerEntriesRestoration`, `:312`). `populatePairs(apiKey)` (`:105`) fetches pools from `SOROSWAP_POOLS_ENDPOINT` (`:12`).

## Dependencies

- npm (`package.json:20-24`): `@stellar/stellar-sdk` ^17.0.1 (Protocol 28 XDR), `ajv` ^8.20.0, `ajv-formats` ^3.0.1. Node >= 22.12.0 (`package.json:9-11`). Tests use only `node:test` and `node:assert`.
- Horizon mainnet `https://horizon.stellar.org`, hardcoded in `scripts/verifyTokens.js:9` and `scripts/setTrustlines.js:6`; the footprint script takes it from `HORIZON_URL`. Network passphrase is `Networks.PUBLIC` everywhere.
- Soroswap API for pool data and the Soroswap router `SOROSWAP_ROUTER` (`scripts/lib/footprint.js:12-13`).
- Env vars: `PRIVATE_KEY`, `RPC_URL`, `HORIZON_URL` (checked at `scripts/restoreFootprintOfTokenContracts.js:14`, `:19`, `:24`), `SOROSWAP_API_KEY` (checked inside `populatePairs`), and `TRUSTLINES_PRIVATE_KEY` passed as `argv[2]` to `setTrustlines`. `.env.local.example` lists all five names and no values.

## Gotchas & invariants

- **Run from the repo root.** `assets/` is resolved relative to the script but `tokenList.json` is CWD-relative (`scripts/verifyTokens.js:12`, `scripts/createTokenList.js:9`, `scripts/setTrustlines.js:8`). The footprint script is the exception: it `require`s `../tokenList.json` relative to itself.
- **`yarn verify` exits 1 in PR context when nothing changed.** `GITHUB_EVENT_NAME=pull_request` plus `GITHUB_ACTIONS` set turns `shouldFailPullRequest` on. Locally this is inert unless you use `scripts/test-pr-verify.sh`.
- **`yarn merge` skips invalid assets instead of failing.** `mergeAssets` reports them in `invalid` and the entry script only logs, so a bad file after merge means a silently missing token, not a red build. The PR gate is what should have caught it.
- **A write failure now fails the merge.** `writeJsonFile` no longer swallows errors; an unwritable `tokenList.json` exits non-zero instead of printing and continuing.
- **`SorobanRpc` is gone.** SDK 17 exposes the RPC client as `rpc.Server` (`scripts/restoreFootprintOfTokenContracts.js:29`). The scripts never touch the `xdr` namespace directly, which is where most of the v17 API rewrite landed.
- **`rpc.Server.getAccount` rejects with a plain `Error` in SDK 17**, no `code: 404`. `isAccountNotFound` (`scripts/lib/footprint.js:21`) matches on the message so the "fund this account" hint still prints and the entry script does not double-log it.
- **`sendTransaction` reads the failure code as `errorResult.result.type`** (`scripts/lib/footprint.js:214`). Under SDK 12 this was `errorResult._attributes.result._switch.name`; the v17 XDR objects expose the discriminant as a `.type` string.
- **A failed `skim` simulation counts as "no restoration needed".** `checkRestoration` returns `[false, null]` whenever there is no `restorePreamble`, including when the simulation errored for an unrelated reason. Read the logs, not just the exit code.
- **Restore sleeps 10 seconds after every submission** (`RATE_LIMIT_PAUSE_MS`, `scripts/lib/footprint.js:15`) to dodge public RPC rate limits. A run over 47 assets and their pools is slow by design.
- **`savePairs`, `getFundedAddress`, `getAssetHolders` and `swapTransaction`** are defined on the restorer but not called by the nightly path (`restoreFootprints`, `:350`). They are exploration helpers kept from the original script.
- **`setTrustlines` never fails the build for a rejected trustline.** `submitTrustline` swallows the last error, and `main()`'s `.catch` only logs (`scripts/setTrustlines.js:51-57`), so a missing trustline never blocks the publish workflow. The only fatal cases are a missing secret (`:13`) and an empty list (`:19`).
- **`ipfs.io` hosts 17 of the 47 icons and rate-limits bursts with `Retry-After: 900`.** A single-token PR makes one request and is fine. A full re-verification of the list trips the limit after roughly a dozen requests, and every remaining ipfs icon then fails with the rate-limit message. Wait 15 minutes and re-run; the retry cap is deliberately far below 900s so CI fails fast instead of hanging.
- **Never log secrets.** The old `printKeypair()` that printed the secret key was removed in the SDK 17 migration. Do not add it back.

## Testing

`yarn test` runs 78 tests across nine files with Node's built-in runner, no network. Fakes live in `tests/helpers.js`: the real USDC code/issuer/contract so SAC derivation runs for real, a fake Horizon (`getIssuerDomain`, `getAssetRecords`), a fake `fetch`, and a log collector. `tests/footprint.test.js` drives `FootprintRestorer` against a fake RPC server that counts `prepareTransaction` and `sendTransaction` calls. `tests/retry.test.js` and `tests/horizon.test.js` pin the backoff schedule, the `Retry-After` cap and which Horizon statuses are retried, all with an injected `sleep` so no test waits. New behavior in `scripts/lib/` gets its failing test first; the entry scripts are covered by running them (`yarn verify` on a clean tree, `yarn merge` as a no-op, the missing-env exit codes).
