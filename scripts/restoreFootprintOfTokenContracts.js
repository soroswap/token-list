'use strict';
const { Horizon, Keypair, rpc } = require('@stellar/stellar-sdk');
const tokenList = require('../tokenList.json');
const { FootprintRestorer, isAccountNotFound } = require('./lib/footprint');

async function main() {
  try {
    const privateKey = process.env.PRIVATE_KEY;
    const rpcUrl = process.env.RPC_URL;
    const horizonUrl = process.env.HORIZON_URL;

    if (!privateKey) {
      console.error('Please provide a private key');
      process.exit(1);
      return;
    }
    if (!rpcUrl) {
      console.error('Please provide a RPC URL');
      process.exit(1);
      return;
    }
    if (!horizonUrl) {
      console.error('Please provide a Horizon URL');
      process.exit(1);
      return;
    }

    const footprintRestorer = new FootprintRestorer({
      server: new rpc.Server(rpcUrl, { allowHttp: true }),
      horizonServer: new Horizon.Server(horizonUrl),
      keypair: Keypair.fromSecret(privateKey),
    });

    await footprintRestorer.setup();
    await footprintRestorer.populatePairs(process.env.SOROSWAP_API_KEY);
    await footprintRestorer.restoreFootprints(tokenList.assets);
  } catch (error) {
    // A missing or malformed account was already explained to the user by the restorer.
    if (!isAccountNotFound(error) && error.code !== 400) {
      console.error('\n❌ Unexpected error:', error.message || error);
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
    }
    process.exit(1);
  }
}

main();
