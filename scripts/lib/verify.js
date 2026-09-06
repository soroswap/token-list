'use strict';
const { Asset } = require('@stellar/stellar-sdk');
const { detectChangedKeys } = require('./tokenList');
const { TransientError, withRetry } = require('./retry');

// Statuses that describe the host's moment, not the URL. Anything else (404, 403, 410)
// means the icon is gone and retrying would only hide that.
const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function parseRetryAfterMs(headers) {
  const value = headers && typeof headers.get === 'function' ? headers.get('Retry-After') : null;
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}

function describeStatus(status, retryAfterMs) {
  if (status === 429) {
    const hint = retryAfterMs ? `, Retry-After ${retryAfterMs / 1000}s` : '';
    return `Request failed with status 429 (rate limited by the icon host${hint})`;
  }
  return `Request failed with status ${status}`;
}

async function fetchIconOnce(url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, { headers: { Accept: 'image/*' } });
  } catch (error) {
    throw new TransientError(`fetch failed for ${url}: ${error.message}`, { cause: error });
  }
  if (!response.ok) {
    const retryAfterMs = parseRetryAfterMs(response.headers);
    const message = describeStatus(response.status, retryAfterMs);
    if (TRANSIENT_STATUSES.has(response.status)) {
      throw new TransientError(message, { retryAfterMs });
    }
    throw new Error(message);
  }
  const contentType = response.headers.get('Content-Type');
  if (!contentType || !contentType.startsWith('image/')) {
    throw new Error('URL does not point to an image');
  }
}

async function checkIconUrl(url, { fetchImpl = fetch, log = console.log, sleep, attempts = 3 } = {}) {
  await withRetry(() => fetchIconOnce(url, fetchImpl), { attempts, sleep });
  log('URL points to a valid image');
}

// The issuer account's on-chain home_domain is the only thing that ties a listing to an
// organisation, so a mismatch means the submitter does not control the domain they claim.
async function assertIssuerDomain(asset, horizon) {
  const issuerDomain = await horizon.getIssuerDomain(asset.issuer);
  if (issuerDomain !== asset.domain) {
    throw new Error(
      `Domain mismatch for asset ${asset.code}: expected ${issuerDomain}, got ${asset.domain}`,
    );
  }
}

// A classic asset's Soroban contract is deterministic, so a mismatch here means the file
// points at a contract that is not the SAC of the code/issuer it names.
function assertContractMatchesAsset(asset, networkPassphrase) {
  const derived = new Asset(asset.code, asset.issuer).contractId(networkPassphrase);
  if (derived !== asset.contract) {
    throw new Error(
      `Contract mismatch for asset ${asset.code}: expected ${derived}, got ${asset.contract}`,
    );
  }
}

async function assertAssetExists(asset, horizon) {
  const records = await horizon.getAssetRecords(asset.code, asset.issuer);
  if (!records || records.length <= 0) {
    throw new Error("Asset has no records or doesn't exist");
  }
}

// `checkDomain` is always on for new assets. For edits it is on only when the `domain`
// field itself changed: that is the one edit the old gate let through unverified, while
// re-checking it on every icon or name edit would block tokens whose issuer moved domains.
async function verifyClassicAsset(asset, { horizon, fetchImpl, networkPassphrase, log, sleep }, { checkDomain }) {
  if (checkDomain) {
    await assertIssuerDomain(asset, horizon);
  }
  assertContractMatchesAsset(asset, networkPassphrase);
  await assertAssetExists(asset, horizon);
  await checkIconUrl(asset.icon, { fetchImpl, log, sleep });
}

// Verifies every assets/ entry against the schema and, for classic assets, against the
// chain. Returns what the CLI needs to decide the exit code; it never exits itself.
async function verifyAssets({
  assetEntries,
  existingList,
  validate,
  horizon,
  fetchImpl = fetch,
  networkPassphrase,
  log = console.log,
  sleep,
}) {
  const existingByContract = new Map(
    (existingList && existingList.assets ? existingList.assets : []).map((asset) => [asset.contract, asset]),
  );
  const deps = { horizon, fetchImpl, networkPassphrase, log, sleep };
  const verifiedNewAssets = [];
  const assetChanges = [];
  const verificationErrors = [];

  for (const { file, data } of assetEntries) {
    if (!data || !validate(data)) {
      const errors = JSON.stringify(validate.errors, null, 2);
      verificationErrors.push(`Asset validation failed for ${file}:\n${errors}`);
      continue;
    }

    const existing = existingByContract.get(data.contract);

    if (existing) {
      const changes = detectChangedKeys(data, existing);
      if (changes.length === 0) continue;

      log(`Changes detected for asset ${data.contract}:`, changes);
      if (data.issuer) {
        try {
          await verifyClassicAsset(data, deps, { checkDomain: changes.includes('domain') });
        } catch (error) {
          verificationErrors.push(`Verification failed for asset ${file}: ${error.message}`);
        }
      }
      assetChanges.push({ ...data });
      continue;
    }

    // Soroban-only tokens have no issuer, so nothing on-chain can be cross-checked here.
    if (data.issuer) {
      try {
        await verifyClassicAsset(data, deps, { checkDomain: true });
      } catch (error) {
        verificationErrors.push(`Verification failed for asset ${file}: ${error.message}`);
        continue;
      }
    }
    verifiedNewAssets.push(data);
  }

  return { verifiedNewAssets, assetChanges, verificationErrors };
}

// A PR that neither adds nor changes a token has nothing to review.
function shouldFailPullRequest({ isPullRequest, isGitHubActions, verifiedNewAssets, assetChanges }) {
  return Boolean(
    isPullRequest && isGitHubActions && verifiedNewAssets.length === 0 && assetChanges.length === 0,
  );
}

module.exports = { checkIconUrl, verifyAssets, shouldFailPullRequest };
