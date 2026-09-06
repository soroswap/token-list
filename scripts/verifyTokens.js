'use strict';
const path = require('path');
const { Networks } = require('@stellar/stellar-sdk');
const { createAssetValidator } = require('./lib/assetSchema');
const { readJsonFile, readAssetEntries } = require('./lib/jsonFiles');
const { createHorizonClient } = require('./lib/horizon');
const { verifyAssets, shouldFailPullRequest } = require('./lib/verify');

const HORIZON_URL = 'https://horizon.stellar.org';
const ASSETS_DIR = path.join(__dirname, '../assets');
// Resolved against the CWD on purpose: every npm script runs from the repo root.
const TOKEN_LIST_PATH = './tokenList.json';

async function main() {
  const { verifiedNewAssets, assetChanges, verificationErrors } = await verifyAssets({
    assetEntries: readAssetEntries(ASSETS_DIR),
    existingList: readJsonFile(TOKEN_LIST_PATH),
    validate: createAssetValidator(),
    horizon: createHorizonClient(HORIZON_URL),
    networkPassphrase: Networks.PUBLIC,
  });

  if (verifiedNewAssets.length > 0) {
    console.log('Verified new assets:', verifiedNewAssets);
  } else {
    console.log('No new assets were added.');
  }

  if (assetChanges.length > 0) {
    console.log('Detected changes in assets:', assetChanges);
  } else {
    console.log('No changes detected in existing assets.');
  }

  if (verificationErrors.length > 0) {
    console.error('\n❌ Verification errors found:');
    verificationErrors.forEach((error) => console.error(error));
    process.exit(1);
  }

  const isPullRequest = process.env.GITHUB_EVENT_NAME === 'pull_request';
  const isGitHubActions = !!process.env.GITHUB_ACTIONS;
  if (shouldFailPullRequest({ isPullRequest, isGitHubActions, verifiedNewAssets, assetChanges })) {
    console.error('\n❌ Pull request validation failed: No new tokens added and no changes detected.');
    console.error('Please add at least one new token or modify an existing token in this pull request.');
    process.exit(1);
  }
}

main()
  .then(() => {
    console.log('✅ Verification completed successfully');
  })
  .catch((error) => {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  });
