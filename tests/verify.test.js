'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Networks } = require('@stellar/stellar-sdk');
const { verifyAssets, checkIconUrl, shouldFailPullRequest } = require('../scripts/lib/verify');
const { createAssetValidator } = require('../scripts/lib/assetSchema');
const { asset, WASM_TOKEN, tokenList, fakeHorizon, fakeFetch } = require('./helpers');

const validate = createAssetValidator();
const entry = (data, file = `${data.contract}.json`) => ({ file, data });

async function run({ entries, existing = [], horizon = fakeHorizon(), fetchImpl = fakeFetch() }) {
  return verifyAssets({
    assetEntries: entries,
    existingList: tokenList(existing),
    validate,
    horizon,
    fetchImpl,
    networkPassphrase: Networks.PUBLIC,
    log: () => {},
  });
}

test('verifies a new classic asset whose domain, contract, records and icon all check out', async () => {
  const result = await run({ entries: [entry(asset())] });

  assert.deepEqual(result.verificationErrors, []);
  assert.equal(result.verifiedNewAssets.length, 1);
  assert.equal(result.assetChanges.length, 0);
});

test('rejects a new asset whose domain does not match the issuer home_domain', async () => {
  const result = await run({ entries: [entry(asset({ domain: 'evil.com' }))] });

  assert.equal(result.verifiedNewAssets.length, 0);
  assert.match(result.verificationErrors[0], /Domain mismatch/);
});

test('rejects a new asset whose contract is not the SAC of its code and issuer', async () => {
  const result = await run({ entries: [entry(asset({ contract: WASM_TOKEN.contract }))] });

  assert.equal(result.verifiedNewAssets.length, 0);
  assert.match(result.verificationErrors[0], /Contract mismatch/);
});

test('rejects a new asset that Horizon has no records for', async () => {
  const result = await run({ entries: [entry(asset())], horizon: fakeHorizon({ records: [] }) });

  assert.match(result.verificationErrors[0], /no records/);
});

test('rejects a new asset when the Horizon asset lookup fails', async () => {
  const result = await run({ entries: [entry(asset())], horizon: fakeHorizon({ records: null }) });

  assert.match(result.verificationErrors[0], /no records/);
});

test('rejects a new asset whose icon URL is not an image', async () => {
  const result = await run({
    entries: [entry(asset())],
    fetchImpl: fakeFetch({ contentType: 'text/html' }),
  });

  assert.match(result.verificationErrors[0], /does not point to an image/);
});

test('rejects a new asset whose icon URL fails to load', async () => {
  const result = await run({
    entries: [entry(asset())],
    fetchImpl: fakeFetch({ ok: false, status: 404 }),
  });

  assert.match(result.verificationErrors[0], /404/);
});

test('accepts a Soroban-only token without touching Horizon or the icon', async () => {
  const horizon = fakeHorizon();
  const fetchImpl = fakeFetch();
  const result = await run({ entries: [entry({ ...WASM_TOKEN })], horizon, fetchImpl });

  assert.equal(result.verifiedNewAssets.length, 1);
  assert.deepEqual(horizon.calls, []);
  assert.deepEqual(fetchImpl.calls, []);
});

test('reports nothing for an asset identical to its listed entry', async () => {
  const horizon = fakeHorizon();
  const result = await run({ entries: [entry(asset())], existing: [asset()], horizon });

  assert.equal(result.verifiedNewAssets.length, 0);
  assert.equal(result.assetChanges.length, 0);
  assert.deepEqual(result.verificationErrors, []);
  assert.deepEqual(horizon.calls, []);
});

test('re-verifies a listed asset whose icon changed and reports the change', async () => {
  const fetchImpl = fakeFetch();
  const changed = asset({ icon: 'https://example.com/new.png' });
  const result = await run({ entries: [entry(changed)], existing: [asset()], fetchImpl });

  assert.deepEqual(result.verificationErrors, []);
  assert.equal(result.assetChanges.length, 1);
  assert.deepEqual(fetchImpl.calls, ['https://example.com/new.png']);
});

test('rejects an edit that changes a listed asset domain to one the issuer does not own', async () => {
  const result = await run({ entries: [entry(asset({ domain: 'evil.com' }))], existing: [asset()] });

  assert.match(result.verificationErrors[0] || '', /Domain mismatch/);
});

test('reports schema errors for a malformed asset file', async () => {
  const result = await run({ entries: [entry(asset({ website: 'x' }), 'bad.json')] });

  assert.match(result.verificationErrors[0], /Asset validation failed for bad\.json/);
  assert.equal(result.verifiedNewAssets.length, 0);
});

const noSleep = async () => {};

test('checkIconUrl resolves for an image response', async () => {
  await assert.doesNotReject(() => checkIconUrl('https://example.com/a.png', { fetchImpl: fakeFetch(), log: () => {}, sleep: noSleep }));
});

test('checkIconUrl rejects a non-image response', async () => {
  await assert.rejects(
    () => checkIconUrl('https://example.com/a.png', { fetchImpl: fakeFetch({ contentType: 'application/json' }), log: () => {}, sleep: noSleep }),
    /does not point to an image/,
  );
});

test('checkIconUrl retries a transient gateway error and passes once it clears', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return { ok: false, status: 503, headers: { get: () => null } };
    return { ok: true, status: 200, headers: { get: (h) => (h === 'Content-Type' ? 'image/png' : null) } };
  };
  await assert.doesNotReject(() => checkIconUrl('https://example.com/a.png', { fetchImpl, log: () => {}, sleep: noSleep }));
  assert.equal(calls, 2);
});

test('checkIconUrl retries when fetch itself throws a network error', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('fetch failed');
    return { ok: true, status: 200, headers: { get: (h) => (h === 'Content-Type' ? 'image/png' : null) } };
  };
  await assert.doesNotReject(() => checkIconUrl('https://example.com/a.png', { fetchImpl, log: () => {}, sleep: noSleep }));
  assert.equal(calls, 2);
});

test('checkIconUrl reports a persistent 429 as rate limiting, with the Retry-After', async () => {
  const fetchImpl = async () => ({ ok: false, status: 429, headers: { get: (h) => (h === 'Retry-After' ? '900' : null) } });
  await assert.rejects(
    () => checkIconUrl('https://example.com/a.png', { fetchImpl, log: () => {}, sleep: noSleep }),
    /429.*rate limit.*900/i,
  );
});

test('checkIconUrl does not retry a 404', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: false, status: 404, headers: { get: () => null } }; };
  await assert.rejects(() => checkIconUrl('https://example.com/a.png', { fetchImpl, log: () => {}, sleep: noSleep }), /404/);
  assert.equal(calls, 1);
});

test('verifyAssets passes an injected sleep through to the icon check', async () => {
  let calls = 0;
  const delays = [];
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return { ok: false, status: 502, headers: { get: () => null } };
    return { ok: true, status: 200, headers: { get: (h) => (h === 'Content-Type' ? 'image/png' : null) } };
  };
  const result = await verifyAssets({
    assetEntries: [entry(asset())],
    existingList: tokenList([]),
    validate,
    horizon: fakeHorizon(),
    fetchImpl,
    networkPassphrase: Networks.PUBLIC,
    log: () => {},
    sleep: async (ms) => { delays.push(ms); },
  });

  assert.deepEqual(result.verificationErrors, []);
  assert.equal(result.verifiedNewAssets.length, 1);
  assert.equal(delays.length, 1);
});

test('shouldFailPullRequest is true only in a GitHub PR with nothing new or changed', () => {
  const nothing = { verifiedNewAssets: [], assetChanges: [] };
  assert.equal(shouldFailPullRequest({ isPullRequest: true, isGitHubActions: true, ...nothing }), true);
  assert.equal(shouldFailPullRequest({ isPullRequest: true, isGitHubActions: false, ...nothing }), false);
  assert.equal(shouldFailPullRequest({ isPullRequest: false, isGitHubActions: true, ...nothing }), false);
  assert.equal(
    shouldFailPullRequest({ isPullRequest: true, isGitHubActions: true, verifiedNewAssets: [asset()], assetChanges: [] }),
    false,
  );
  assert.equal(
    shouldFailPullRequest({ isPullRequest: true, isGitHubActions: true, verifiedNewAssets: [], assetChanges: [asset()] }),
    false,
  );
});

test('does not re-check the domain when an edit leaves the domain untouched', async () => {
  // The listed domain is stale on purpose: an icon-only edit must still pass.
  const horizon = fakeHorizon({ homeDomain: 'circle.com' });
  const listed = asset({ domain: 'centre.io' });
  const edited = asset({ domain: 'centre.io', icon: 'https://example.com/new.png' });
  const result = await run({ entries: [entry(edited)], existing: [listed], horizon });

  assert.deepEqual(result.verificationErrors, []);
  assert.equal(result.assetChanges.length, 1);
  assert.ok(!horizon.calls.some(([name]) => name === 'getIssuerDomain'), JSON.stringify(horizon.calls));
});
