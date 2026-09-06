'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAssetValidator, assetSchema } = require('../scripts/lib/assetSchema');
const { asset, WASM_TOKEN } = require('./helpers');

const validate = createAssetValidator();

test('accepts a well-formed classic asset', () => {
  assert.equal(validate(asset()), true);
});

test('accepts a Soroban-only token that has a contract but no code or issuer', () => {
  assert.equal(validate({ ...WASM_TOKEN }), true);
});

test('accepts an asset identified only by code and issuer', () => {
  const { contract, ...rest } = asset();
  assert.equal(validate(rest), true);
});

test('rejects an asset missing name', () => {
  const { name, ...rest } = asset();
  assert.equal(validate(rest), false);
});

test('rejects an asset with neither contract nor code and issuer', () => {
  const { contract, code, ...rest } = asset();
  assert.equal(validate(rest), false);
});

test('rejects unknown properties', () => {
  assert.equal(validate(asset({ website: 'https://circle.com' })), false);
});

test('rejects decimals above 38', () => {
  assert.equal(validate(asset({ decimals: 39 })), false);
});

test('rejects a domain that includes a scheme', () => {
  assert.equal(validate(asset({ domain: 'https://circle.com' })), false);
});

test('accepts an IPFS CID as icon', () => {
  assert.equal(validate(asset({ icon: 'bafkreih6jv72q2zuthweyyzq5vqu4dcnxbkefd7o7shgs2llnqrdeufyiy' })), true);
});

test('rejects an icon that is neither a URI nor a CID', () => {
  assert.equal(validate(asset({ icon: 'not an icon' })), false);
});

test('rejects a contract address that is not a C-strkey', () => {
  assert.equal(validate(asset({ contract: asset().issuer })), false);
});

test('exposes the schema object for reuse', () => {
  assert.equal(assetSchema.additionalProperties, false);
  assert.deepEqual(assetSchema.required, ['name', 'org']);
});
