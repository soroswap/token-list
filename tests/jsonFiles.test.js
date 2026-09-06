'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readJsonFile, readAssetEntries } = require('../scripts/lib/jsonFiles');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'token-list-test-'));
}

test('readJsonFile parses a JSON file', () => {
  const dir = tempDir();
  const file = path.join(dir, 'a.json');
  fs.writeFileSync(file, '{"code":"USDC"}');

  assert.deepEqual(readJsonFile(file), { code: 'USDC' });
});

test('readJsonFile wraps parse errors in a descriptive message', () => {
  const dir = tempDir();
  const file = path.join(dir, 'broken.json');
  fs.writeFileSync(file, '{ not json');

  assert.throws(() => readJsonFile(file), /Failed to parse JSON from file/);
});

test('readAssetEntries reads only .json files and pairs each with its filename', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'b.json'), '{"code":"B"}');
  fs.writeFileSync(path.join(dir, 'a.json'), '{"code":"A"}');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignore me');

  const entries = readAssetEntries(dir);

  assert.deepEqual(
    entries.sort((x, y) => x.file.localeCompare(y.file)),
    [
      { file: 'a.json', data: { code: 'A' } },
      { file: 'b.json', data: { code: 'B' } },
    ],
  );
});
