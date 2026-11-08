'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Account, Keypair } = require('@stellar/stellar-sdk');
const {
  FootprintRestorer,
  normalizePools,
  getPairsWithContract,
  getOtherAsset,
  needsBump,
} = require('../scripts/lib/footprint');
const { USDC, collectLog } = require('./helpers');

function fakeServer({ entries = [], latestLedger = 1000, sendResult } = {}) {
  const calls = { prepare: 0, send: 0 };
  return {
    calls,
    async getLatestLedger() {
      return { sequence: latestLedger };
    },
    async getAccount(publicKey) {
      return new Account(publicKey, '0');
    },
    async getLedgerEntries() {
      return { entries };
    },
    async prepareTransaction(tx) {
      calls.prepare += 1;
      return { tx, sign() {} };
    },
    async sendTransaction() {
      calls.send += 1;
      return sendResult || { status: 'PENDING', hash: 'h' };
    },
  };
}

function make(server, extra = {}) {
  return new FootprintRestorer({
    server,
    horizonServer: {},
    keypair: Keypair.random(),
    sleep: async () => {},
    log: () => {},
    ...extra,
  });
}

const pairs = [
  { tokenA: 'A', tokenB: 'B', address: 'P1' },
  { tokenA: 'C', tokenB: 'A', address: 'P2' },
  { tokenA: 'C', tokenB: 'D', address: 'P3' },
];

test('normalizePools accepts a bare array, a data wrapper and a pools wrapper', () => {
  const pool = { tokenA: 'A', tokenB: 'B', address: 'P' };
  assert.deepEqual(normalizePools([pool]), [pool]);
  assert.deepEqual(normalizePools({ data: [pool] }), [pool]);
  assert.deepEqual(normalizePools({ pools: [pool] }), [pool]);
  assert.deepEqual(normalizePools({ unexpected: true }), []);
});

test('getPairsWithContract returns the pairs that hold the contract on either side', () => {
  assert.deepEqual(getPairsWithContract(pairs, 'A').map((p) => p.address), ['P1', 'P2']);
  assert.deepEqual(getPairsWithContract(pairs, 'Z'), []);
});

test('getOtherAsset returns the counterpart of the contract in a pair, or null', () => {
  assert.equal(getOtherAsset(pairs[0], 'A'), 'B');
  assert.equal(getOtherAsset(pairs[0], 'B'), 'A');
  assert.equal(getOtherAsset(pairs[0], 'Z'), null);
});

test('needsBump is true only when the latest ledger is past the entry TTL', () => {
  assert.equal(needsBump(1000, 500), true);
  assert.equal(needsBump(1000, 1000), false);
  assert.equal(needsBump(1000, 2000), false);
});

test('populatePairs throws when no API key is given', async () => {
  await assert.rejects(() => make(fakeServer()).populatePairs(undefined), /SOROSWAP_API_KEY/);
});

test('populatePairs maps the API pools into tokenA, tokenB and address', async () => {
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return { data: [{ tokenA: 'A', tokenB: 'B', address: 'P', reserves: 1 }] };
    },
  });
  const restorer = make(fakeServer(), { fetchImpl });

  await restorer.populatePairs('key');

  assert.deepEqual(restorer.allPairs, [{ tokenA: 'A', tokenB: 'B', address: 'P' }]);
});

test('populatePairs sends the API key as a bearer token', async () => {
  let seenHeaders;
  const fetchImpl = async (_url, options) => {
    seenHeaders = options.headers;
    return { ok: true, async json() { return []; } };
  };

  await make(fakeServer(), { fetchImpl }).populatePairs('secret-key');

  assert.equal(seenHeaders.Authorization, 'Bearer secret-key');
});

test('restoreFootprintToContract does nothing when the contract has no ledger entry', async () => {
  const server = fakeServer({ entries: [] });
  const restorer = make(server);
  await restorer.setup();

  await restorer.restoreFootprintToContract(USDC.contract);

  assert.equal(server.calls.prepare, 0);
  assert.equal(server.calls.send, 0);
});

test('restoreFootprintToContract does nothing while the entry is still live', async () => {
  const server = fakeServer({ entries: [{ liveUntilLedgerSeq: 2000 }], latestLedger: 1000 });
  const restorer = make(server);
  await restorer.setup();

  await restorer.restoreFootprintToContract(USDC.contract);

  assert.equal(server.calls.prepare, 0);
  assert.equal(server.calls.send, 0);
});

test('restoreFootprintToContract submits one restore transaction once the entry has expired', async () => {
  const server = fakeServer({ entries: [{ liveUntilLedgerSeq: 500 }], latestLedger: 1000 });
  const restorer = make(server);
  await restorer.setup();

  await restorer.restoreFootprintToContract(USDC.contract);

  assert.equal(server.calls.prepare, 1);
  assert.equal(server.calls.send, 1);
});

test('checkRestoration reports no restoration when the simulation has no preamble', () => {
  assert.deepEqual(make(fakeServer()).checkRestoration({}), [false, null]);
});

test('checkRestoration flags restoration when the preamble lists read-write keys', () => {
  const restorePreamble = {
    minResourceFee: '1',
    transactionData: { getReadOnly: () => [], getReadWrite: () => ['key'] },
  };

  assert.deepEqual(make(fakeServer()).checkRestoration({ restorePreamble }), [true, restorePreamble]);
});

test('sendTransaction recognises an insufficient-balance error result', async () => {
  const { lines, log } = collectLog();
  const server = fakeServer({
    sendResult: { status: 'ERROR', errorResult: { result: { type: 'txInsufficientBalance' } } },
  });

  await make(server, { log }).sendTransaction({ sign() {} });

  assert.ok(lines.some((line) => /Insufficient balance/.test(line)), lines.join('\n'));
});

test('updateAccount explains how to fund an account that does not exist on the network', async () => {
  const { lines, log } = collectLog();
  const server = {
    async getAccount(publicKey) {
      // SDK v17 rejects with a plain Error and no `code` field.
      throw new Error(`Account not found: ${publicKey}`);
    },
  };
  const restorer = make(server, { logError: log });

  await assert.rejects(() => restorer.updateAccount(), /Account not found/);

  assert.ok(lines.some((line) => /fund this account/i.test(line)), lines.join('\n'));
});
