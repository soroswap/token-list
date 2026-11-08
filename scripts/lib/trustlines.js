'use strict';
const { Asset, Operation, TransactionBuilder, TimeoutInfinite } = require('@stellar/stellar-sdk');

const MAX_TRIES = 3;
const INITIAL_FEE = 100;
const CLASSIC_ASSET_TYPES = new Set(['credit_alphanum4', 'credit_alphanum12']);

function hasTrustline(balances, asset) {
  return balances.some(
    (balance) =>
      CLASSIC_ASSET_TYPES.has(balance.asset_type) &&
      balance.asset_code === asset.code &&
      balance.asset_issuer === asset.issuer,
  );
}

// Splits the list by whether the wallet already trusts each asset. Soroban-only tokens
// have no classic code/issuer and therefore no trustline concept, so they are skipped.
function partitionAssetsByTrustline(assets, balances) {
  const trustedAssets = [];
  const untrustedAssets = [];
  const skippedAssets = [];

  for (const asset of assets) {
    if (!asset.code || !asset.issuer) {
      skippedAssets.push(asset);
      continue;
    }
    (hasTrustline(balances, asset) ? trustedAssets : untrustedAssets).push(asset);
  }

  return { trustedAssets, untrustedAssets, skippedAssets };
}

// The fee grows linearly with the attempt so a retry can outbid the surge pricing that
// most likely rejected the previous submission.
function buildChangeTrustTransaction({
  sourceAccount,
  code,
  issuer,
  tries = 1,
  networkPassphrase,
  initialFee = INITIAL_FEE,
}) {
  return new TransactionBuilder(sourceAccount, {
    fee: String(initialFee * tries),
    timebounds: { minTime: 0, maxTime: 0 },
    networkPassphrase,
  })
    .addOperation(
      Operation.changeTrust({
        source: sourceAccount.accountId(),
        asset: new Asset(code, issuer),
      }),
    )
    .setTimeout(TimeoutInfinite)
    .build();
}

// Resolves with the Horizon response on success, or undefined after exhausting retries.
// It never throws: one bad asset must not stop the rest of the list from being processed.
async function submitTrustline({
  horizonServer,
  keypair,
  code,
  issuer,
  networkPassphrase,
  maxTries = MAX_TRIES,
  initialFee = INITIAL_FEE,
  log = console.log,
}) {
  for (let tries = 1; tries <= maxTries; tries += 1) {
    const sourceAccount = await horizonServer.loadAccount(keypair.publicKey());
    const tx = buildChangeTrustTransaction({ sourceAccount, code, issuer, tries, networkPassphrase, initialFee });
    tx.sign(keypair);

    try {
      const response = await horizonServer.submitTransaction(tx);
      log('Trustline set for ', code);
      return response;
    } catch (error) {
      if (tries < maxTries) {
        log('Error trying to set trustline for ', code);
        log(error);
        log('Retrying...');
      } else {
        log('Max tries reached for ', code, '. Unable to set trustline.');
        log(error);
      }
    }
  }
  return undefined;
}

module.exports = { partitionAssetsByTrustline, buildChangeTrustTransaction, submitTrustline, MAX_TRIES, INITIAL_FEE };
