'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHorizonClient } = require('../scripts/lib/horizon');

// Minimal stand-in for Horizon.Server's call-builder chain.
function fakeServer({ accountResults = [], assetResults = [] }) {
  // Each queued entry is a thunk producing the next call() result, in order.
  const next = (queue) => () => queue.shift()();
  return {
    accounts: () => ({ accountId: () => ({ call: next(accountResults) }) }),
    assets: () => ({ forCode: () => ({ forIssuer: () => ({ call: next(assetResults) }) }) }),
  };
}
const rateLimited = () => Promise.reject(Object.assign(new Error('Too Many Requests'), { response: { status: 429 } }));

test('getIssuerDomain retries a Horizon 429 and returns the home_domain', async () => {
  const delays = [];
  const server = fakeServer({ accountResults: [rateLimited, async () => ({ home_domain: 'circle.com' })] });
  const client = createHorizonClient('https://horizon.example', { server, sleep: async (ms) => { delays.push(ms); }, logError: () => {} });

  assert.equal(await client.getIssuerDomain('GISSUER'), 'circle.com');
  assert.equal(delays.length, 1);
});

test('getAssetRecords returns null once the retries are exhausted', async () => {
  const server = fakeServer({ assetResults: [rateLimited, rateLimited, rateLimited, rateLimited] });
  const client = createHorizonClient('https://horizon.example', { server, sleep: async () => {}, logError: () => {} });

  assert.equal(await client.getAssetRecords('USDC', 'GISSUER'), null);
});

test('getIssuerDomain does not retry a 404', async () => {
  let calls = 0;
  const notFound = () => { calls += 1; return Promise.reject(Object.assign(new Error('Not Found'), { response: { status: 404 } })); };
  const server = fakeServer({ accountResults: [notFound, notFound] });
  const client = createHorizonClient('https://horizon.example', { server, sleep: async () => {}, logError: () => {} });

  assert.equal(await client.getIssuerDomain('GISSUER'), null);
  assert.equal(calls, 1);
});
