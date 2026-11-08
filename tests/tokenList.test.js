'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeAssets, detectChangedKeys } = require('../scripts/lib/tokenList');
const { createAssetValidator } = require('../scripts/lib/assetSchema');
const { asset, WASM_TOKEN, tokenList } = require('./helpers');

const validate = createAssetValidator();
const entry = (data, file = `${data.contract}.json`) => ({ file, data });

test('adds a new asset, bumps the version and reports it as added', () => {
  const list = tokenList([asset()], '1.5.1');
  const result = mergeAssets(list, [entry(asset()), entry({ ...WASM_TOKEN })], validate);

  assert.equal(result.changesDetected, true);
  assert.deepEqual(result.added, [`${WASM_TOKEN.contract}.json`]);
  assert.equal(result.list.version, '1.5.2');
  assert.equal(result.list.assets.length, 2);
});

test('updates a changed asset in place and reports it as updated', () => {
  const list = tokenList([asset()]);
  const changed = asset({ icon: 'https://example.com/new.png' });
  const result = mergeAssets(list, [entry(changed)], validate);

  assert.deepEqual(result.updated, [`${changed.contract}.json`]);
  assert.equal(result.list.assets[0].icon, 'https://example.com/new.png');
  assert.equal(result.list.assets.length, 1);
});

test('removes an asset whose file is no longer in the directory', () => {
  const list = tokenList([asset(), { ...WASM_TOKEN }]);
  const result = mergeAssets(list, [entry(asset())], validate);

  assert.deepEqual(result.removed, [WASM_TOKEN.contract]);
  assert.deepEqual(result.list.assets.map((a) => a.contract), [asset().contract]);
});

test('skips an invalid asset file but does not treat its contract as deleted', () => {
  const list = tokenList([asset()], '1.5.1');
  const result = mergeAssets(list, [entry(asset({ website: 'x' }), 'bad.json')], validate);

  assert.deepEqual(result.invalid.map((i) => i.file), ['bad.json']);
  assert.deepEqual(result.removed, []);
  assert.equal(result.changesDetected, false);
  assert.equal(result.list.version, '1.5.1');
  assert.equal(result.list.assets.length, 1);
});

test('reports no changes when the directory matches the list', () => {
  const list = tokenList([asset()], '1.5.1');
  const result = mergeAssets(list, [entry(asset())], validate);

  assert.equal(result.changesDetected, false);
  assert.equal(result.list.version, '1.5.1');
  assert.deepEqual(result.list.assets, [asset()]);
});

test('sorts assets by contract after a change', () => {
  const list = tokenList([asset()]);
  const result = mergeAssets(list, [entry(asset()), entry({ ...WASM_TOKEN })], validate);

  assert.deepEqual(
    result.list.assets.map((a) => a.contract),
    [WASM_TOKEN.contract, asset().contract],
  );
});

test('does not mutate the list it was given', () => {
  const list = tokenList([asset()], '1.5.1');
  mergeAssets(list, [entry(asset()), entry({ ...WASM_TOKEN })], validate);

  assert.equal(list.version, '1.5.1');
  assert.equal(list.assets.length, 1);
});

test('detectChangedKeys lists only the keys whose values differ', () => {
  const changed = asset({ icon: 'https://example.com/new.png' });
  assert.deepEqual(detectChangedKeys(changed, asset()), ['icon']);
  assert.deepEqual(detectChangedKeys(asset(), asset()), []);
});
