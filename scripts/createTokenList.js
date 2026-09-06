'use strict';
const path = require('path');
const { createAssetValidator } = require('./lib/assetSchema');
const { readJsonFile, writeJsonFile, readAssetEntries } = require('./lib/jsonFiles');
const { mergeAssets } = require('./lib/tokenList');

const ASSETS_DIR = path.join(__dirname, '../assets');
// Resolved against the CWD on purpose: every npm script runs from the repo root.
const TOKEN_LIST_PATH = './tokenList.json';

function main() {
  const existingList = readJsonFile(TOKEN_LIST_PATH);
  if (!existingList || !Array.isArray(existingList.assets)) {
    console.error(`Existing asset list is invalid or not found at ${TOKEN_LIST_PATH}`);
    return;
  }

  const result = mergeAssets(existingList, readAssetEntries(ASSETS_DIR), createAssetValidator());

  result.invalid.forEach(({ file, errors }) => {
    console.error(`Asset validation failed for ${file}:`, errors);
  });
  result.added.forEach((file) => console.log(`Adding new asset from file ${file}`));
  result.updated.forEach((file) => console.log(`Changes detected for asset in file ${file}`));
  if (result.removed.length > 0) {
    console.log(`Removing deleted assets: ${result.removed.join(', ')}`);
  }

  if (!result.changesDetected) {
    console.log('------------------------------------');
    console.log('No new assets were added, changes detected, or assets deleted.');
    console.log('------------------------------------');
    return;
  }

  writeJsonFile(TOKEN_LIST_PATH, result.list);
  console.log(`Successfully written data to ${TOKEN_LIST_PATH}`);
}

main();
