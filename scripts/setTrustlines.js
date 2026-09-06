'use strict';
const { Horizon, Keypair, Networks } = require('@stellar/stellar-sdk');
const { readJsonFile } = require('./lib/jsonFiles');
const { partitionAssetsByTrustline, submitTrustline } = require('./lib/trustlines');

const HORIZON_URL = 'https://horizon.stellar.org';
// Resolved against the CWD on purpose: every npm script runs from the repo root.
const TOKEN_LIST_PATH = './tokenList.json';

const trustlinesWalletSecretKey = process.argv[2];
if (!trustlinesWalletSecretKey) {
  console.error('Please provide a trustlines wallet secret key');
  process.exit(1);
}

const assetsList = readJsonFile(TOKEN_LIST_PATH);
if (assetsList.assets.length == 0) {
  console.error('No assets found in tokenList.json');
  process.exit(1);
}

const horizonServer = new Horizon.Server(HORIZON_URL);
const keypair = Keypair.fromSecret(trustlinesWalletSecretKey);

async function main() {
  const source = await horizonServer.loadAccount(keypair.publicKey());
  const { trustedAssets, untrustedAssets, skippedAssets } = partitionAssetsByTrustline(
    assetsList.assets,
    source.balances,
  );
  console.log('Trusted Assets: ', trustedAssets.length);
  console.log('Untrusted Assets: ', untrustedAssets.length);
  console.log('Skipped (no code/issuer, non-SAC): ', skippedAssets.length);

  if (untrustedAssets.length == 0) {
    console.log('No new trustlines needed');
    process.exit(0);
  }

  for (const asset of untrustedAssets) {
    await submitTrustline({
      horizonServer,
      keypair,
      code: asset.code,
      issuer: asset.issuer,
      networkPassphrase: Networks.PUBLIC,
    });
  }
}

main()
  .then(() => {
    console.log('Trustlines set successfully');
  })
  .catch((error) => {
    console.error('Error setting trustlines: ', error);
  });
