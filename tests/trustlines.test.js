'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Account, Keypair, Networks } = require('@stellar/stellar-sdk');
const { partitionAssetsByTrustline, buildChangeTrustTransaction, submitTrustline } = require('../scripts/lib/trustlines');
const { USDC, WASM_TOKEN, asset } = require('./helpers');

test('skips tokens that have no code or issuer', () => {
  const result = partitionAssetsByTrustline([{ ...WASM_TOKEN }], []);

  assert.deepEqual(result.skippedAssets, [WASM_TOKEN]);
  assert.deepEqual(result.trustedAssets, []);
  assert.deepEqual(result.untrustedAssets, []);
});

test('treats an asset with a matching credit_alphanum4 balance as trusted', () => {
  const balances = [{ asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: USDC.issuer, balance: '0' }];
  const result = partitionAssetsByTrustline([asset()], balances);

  assert.deepEqual(result.trustedAssets, [asset()]);
  assert.deepEqual(result.untrustedAssets, []);
});

test('treats an asset with a matching credit_alphanum12 balance as trusted', () => {
  const long = asset({ code: 'LONGCODE12' });
  const balances = [{ asset_type: 'credit_alphanum12', asset_code: 'LONGCODE12', asset_issuer: USDC.issuer, balance: '0' }];
  const result = partitionAssetsByTrustline([long], balances);

  assert.deepEqual(result.trustedAssets, [long]);
});

test('treats an asset with no matching balance as untrusted', () => {
  const balances = [{ asset_type: 'native', balance: '10' }];
  const result = partitionAssetsByTrustline([asset()], balances);

  assert.deepEqual(result.untrustedAssets, [asset()]);
  assert.deepEqual(result.trustedAssets, []);
});

test('builds a changeTrust transaction whose fee scales with the attempt number', () => {
  const keypair = Keypair.random();
  const sourceAccount = new Account(keypair.publicKey(), '0');
  const tx = buildChangeTrustTransaction({
    sourceAccount,
    code: 'USDC',
    issuer: USDC.issuer,
    tries: 3,
    networkPassphrase: Networks.PUBLIC,
  });

  assert.equal(tx.fee, '300');
  assert.equal(tx.operations.length, 1);
  assert.equal(tx.operations[0].type, 'changeTrust');
  assert.equal(tx.operations[0].line.code, 'USDC');
  assert.equal(tx.operations[0].line.issuer, USDC.issuer);
});

test('retries a failed submission with a higher fee until it succeeds', async () => {
  const keypair = Keypair.random();
  const fees = [];
  let attempts = 0;
  const horizonServer = {
    async loadAccount(publicKey) {
      return new Account(publicKey, String(attempts));
    },
    async submitTransaction(tx) {
      attempts += 1;
      fees.push(tx.fee);
      if (attempts < 3) throw new Error('tx_bad_seq');
      return { hash: 'abc' };
    },
  };

  const response = await submitTrustline({
    horizonServer,
    keypair,
    code: 'USDC',
    issuer: USDC.issuer,
    networkPassphrase: Networks.PUBLIC,
    maxTries: 3,
    log: () => {},
  });

  assert.deepEqual(fees, ['100', '200', '300']);
  assert.equal(response.hash, 'abc');
});

test('gives up without throwing once the max number of tries is reached', async () => {
  const keypair = Keypair.random();
  let attempts = 0;
  const horizonServer = {
    async loadAccount(publicKey) {
      return new Account(publicKey, '0');
    },
    async submitTransaction() {
      attempts += 1;
      throw new Error('op_no_trust');
    },
  };

  const response = await submitTrustline({
    horizonServer,
    keypair,
    code: 'USDC',
    issuer: USDC.issuer,
    networkPassphrase: Networks.PUBLIC,
    maxTries: 2,
    log: () => {},
  });

  assert.equal(attempts, 2);
  assert.equal(response, undefined);
});
