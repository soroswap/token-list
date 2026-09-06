# Token List Data Module

> **Living document.** Read this before modifying the module. Update it in the same change whenever the module's behavior, files, or schema change.

**Source:** `assets/`, `tokenList.json` · **Last verified:** 2026-09-06

## Purpose

Holds the curated set of Stellar / Soroban assets Soroswap trusts. `assets/` is the source of truth, one JSON file per token. `tokenList.json` is the generated aggregate that downstream consumers read. Editing these files changes what can be swapped and what the indexer stores.

## Structure

| File | Purpose |
|---|---|
| `assets/<CONTRACT>.json` | One token, one file. Named after the token's contract address (`README.md:40`). 47 files at time of writing. |
| `tokenList.json` | Generated aggregate. Never hand-edited in a PR (`README.md:55`). |

## Public surface

`tokenList.json` top-level fields, all present in the committed file:

| Field | Value in repo | Line |
|---|---|---|
| `name` | `"Assets curated by Soroswap Protocol"` | `tokenList.json:2` |
| `provider` | `"Soroswap Protocol"` | `tokenList.json:3` |
| `description` | list description | `tokenList.json:4` |
| `version` | `"1.5.1"` | `tokenList.json:5` |
| `feedback` | `https://github.com/soroswap/token-list` | `tokenList.json:6` |
| `network` | `"mainnet"` | `tokenList.json:7` |
| `assets` | array of asset objects | `tokenList.json:8` |

The same shape is documented as the indexer payload contract in `GITHUB_ACTIONS_INTEGRATION.md:139-158`.

## Asset schema (enforced)

The authoritative schema is the `assetSchema` object in `scripts/lib/assetSchema.js`, compiled by `createAssetValidator` (`:31`). Both the PR gate and the merge import it, so there is exactly one copy.

| Property | Constraint |
|---|---|
| `name` | string, minLength 4, maxLength 30 |
| `contract` | string, `^C[A-Z0-9]{55}$` |
| `code` | string, `^[A-Za-z0-9]{1,12}$` |
| `issuer` | string, `^G[A-Z0-9]{55}$` |
| `org` | string, minLength 5, maxLength 30 |
| `domain` | string, bare-domain regex (no scheme) |
| `icon` | string, `format: uri` OR `^baf[a-zA-Z0-9]+$` |
| `decimals` | integer, 0 to 38 |
| `comment` | string, maxLength 150 |

- Required: `name` and `org` only.
- Plus `anyOf`: either `contract`, or both `code` and `issuer`.
- `additionalProperties: false`, so any field not in the table above fails validation.

`tests/assetSchema.test.js` pins each of these rules.

## What the PR gate checks beyond the schema

For an asset with an `issuer` (`verifyAssets`, `scripts/lib/verify.js:94`):

| Check | New asset | Edited asset |
|---|---|---|
| Issuer `home_domain` on Horizon equals `domain` (`assertIssuerDomain`, `:53`) | always | only when the `domain` field changed |
| `Asset(code, issuer).contractId(PUBLIC)` equals `contract` (`assertContractMatchesAsset`, `:64`) | always | always |
| Horizon has at least one record for code+issuer (`assertAssetExists`, `:73`) | always | always |
| `icon` returns HTTP 200 with an `image/*` content type (`checkIconUrl`, `:46`) | always | always |

Assets without an `issuer` get schema validation only. Transient icon failures (429, 5xx, a dropped connection) are retried a few times; a 404 or a non-image response is final.

## Gotchas & invariants

- **`decimals: 7` is a convention, not a rule.** The schema allows 0 to 38 and the list already deviates: 44 of 47 assets use 7, the two Centrifuge tokens use 18, and `assets/CDDS7IQJGQ2ZMO66E3MUYXZ56H2OO7RBTTAGZLZKOEA4EXCGZX65JGA7.json` (Stellarcarbon CARBON) uses 3.
- **`comment` is schema-legal but unused.** No asset file in `assets/` currently sets it.
- **Seven listed domains no longer match the issuer's on-chain `home_domain`** as of 2026-09-06: USDC (`centre.io` vs `circle.com`), BLND (`blend.capital` vs no home_domain set), oUSD, xLMNR, and the three FxDAO tokens GBPx, EURx, USDx (`fxdao.io` vs `assets.fxdao.io`). Editing the `domain` of any of these triggers the domain check and fails until the file matches the chain; editing other fields does not. A data PR that fixes all seven is the clean way out.
- **Three listed icons are dead as of 2026-09-06.** ZOMB (`assets/CATNYPHNO3U72V7ZVUE6QESDWTSBORW2BE7WFM3BQABQNNZQ32F2HYNC.json`) and STROOPY (`assets/CDDL6HGNYGVRCQB37DDFTIFYMGTX36AQMCXI6U3NOAO2BBZDNGKMGQSY.json`) point at `xlmeme.com`, which now serves an HTML redirect to a parking page for every user agent; BEN (`assets/GB3RF5WN3FDIMORX4A7PRXVNGQXSQAJRBCILM4EGQDRHDXK4XYUDR22J.json`) points at a `lu.meme` URL that returns 404. Consumers rendering these get no image, and any edit to these entries fails the icon check until the URL is replaced.
- **17 of the 47 icons live on `ipfs.io`**, which rate-limits with `Retry-After: 900` after a burst. Fine for one PR, a problem for a full re-check; see the ipfs gotcha in [scripts.md](scripts.md).
- **To re-verify the whole list**, run `yarn verify` with an empty `assets` array in `tokenList.json` (every file is then treated as new, so every on-chain check runs), then restore the file with `git checkout tokenList.json`. Expect the ipfs rate limit to hit partway through; run it twice, 15 minutes apart, to cover everything.
- **`icon` is optional in the schema but effectively required for any asset with an `issuer`.** `verifyClassicAsset` (`scripts/lib/verify.js:83`) always calls `checkIconUrl(asset.icon)`, and `fetch(undefined)` throws. All 47 assets currently set `icon`.
- **`domain` is genuinely optional and 4 assets omit it.** Two have no issuer (the Centrifuge pair, so no check runs at all); two do have an issuer: `assets/CBEM2CAIYLM3HBOPU5HLQL7V5BUAKM3N77DYQKX4FNHTQLQUUD2ZFBOX.json` (LIBRE) and `assets/CBSJZEIO5C7KC2SF3MKSNXXJSW5G3VTNBX4ATMKUI3B2MR4JKM4R26YF.json` (USDT0). The domain check compares with strict inequality, so an omitted `domain` passes only when the issuer's on-chain `home_domain` is also unset.
- **Filename must be the contract address, but no script enforces it.** `README.md:40` states the rule; `assets/GB3RF5WN3FDIMORX4A7PRXVNGQXSQAJRBCILM4EGQDRHDXK4XYUDR22J.json` is named after the issuer while its `contract` is `CBPZITKDNHAMPX25OVSF7BCBT3BCFXSPR3WXER5E3T77F46NRXHKYFZC`. Both `mergeAssets` and `verifyAssets` key on the `contract` field, not the filename, so the mismatch passes CI.
- **Assets with no `issuer` skip every on-chain check.** Non-SAC Soroban tokens (for example `assets/CBI7UCH5KGSVQRO5H4SUCZUTZABCITZLRHQQZTWL2TK4RZ72TAR6IHRV.json` and `assets/CC64WBDGS6QQP22QTTIACYIXT3WF7BBQEYOQPLTP7GTKYY7PZ74QYGSL.json`) get schema validation only, and the trustline script skips them too (`partitionAssetsByTrustline`, `scripts/lib/trustlines.js:19`). The repo's review skill treats these as needing a code audit (`.claude/skills/token-pr-security-check/SKILL.md:15-25`).
- **Deleting an `assets/` file removes the token from `tokenList.json`.** `mergeAssets` (`scripts/lib/tokenList.js:15`) diffs directory contents against the list and drops what is missing.
- **Removing a field from an asset file does not remove it from the list.** `mergeAssets` applies edits with `Object.assign` onto the existing entry, and `detectChangedKeys` (`scripts/lib/tokenList.js:6`) only looks at keys present in the file. To drop a field, delete and re-add the asset, or edit `tokenList.json` by hand in a maintainer PR.
- **`assets` is always re-sorted by `contract`** on every regeneration, so diffs can move unrelated entries.

## Testing

Unit tests, offline: `tests/assetSchema.test.js` (schema rules), `tests/tokenList.test.js` (merge, deletion, sorting, version bump), `tests/verify.test.js` (every gate check, including the retry and rate-limit paths, with a fake Horizon and a fake `fetch`). Run with `yarn test`. The live gate is `yarn verify`; on a clean tree it makes no network calls because nothing is new or changed.
