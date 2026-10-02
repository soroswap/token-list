const { Horizon } = require('@stellar/stellar-sdk');

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = 'https://soroban-testnet.stellar.org';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

if (!PRIVATE_KEY) {
  console.error('ERROR: PRIVATE_KEY environment variable is required');
  process.exit(1);
}

const server = new Horizon.Server(HORIZON_URL);
const stellarKeypair = Horizon.Keypair.fromSecret(PRIVATE_KEY);
const stellarAccount = stellarKeypair.publicKey();

async function main() {
  console.log('Starting trustline setup...');
  console.log(`Account: ${stellarAccount}`);

  const tokenList = require('../tokenList.json');

  for (const token of tokenList.tokens) {
    // Skip non-SAC (contract-only) tokens that don't have code/issuer
    if (!token.code || !token.issuer) {
      console.log(`⊘ Skipping ${token.symbol || token.name} (non-SAC, no code/issuer)`);
      continue;
    }

    try {
      console.log(`Setting trustline for ${token.symbol} (${token.issuer})...`);
      
      // Check if trustline already exists
      const account = await server.loadAccount(stellarAccount);
      const hasTrustline = account.lines.some(line => line.asset_code === token.code && line.asset_issuer === token.issuer);
      
      if (hasTrustline) {
        console.log(`  ✓ Trustline already exists for ${token.symbol}`);
        continue;
      }

      // Create trustline transaction
      const baseFee = Horizon.DEFAULT_FEE;
      const transaction = new Horizon.TransactionBuilder(account, { fee: baseFee })
        .addOperation(Horizon.Operation.changeTrust({
          asset: new Horizon.Asset(token.code, token.issuer),
          limit: '1000000000',
        }))
        .setTimeout(30)
        .build();

      transaction.sign(stellarKeypair);
      const submitResponse = await server.submitTransaction(transaction);
      console.log(`  ✓ Trustline set for ${token.symbol}: ${submitResponse.hash}`);
    } catch (error) {
      console.error(`  ✗ Failed to set trustline for ${token.symbol}: ${error.message}`);
    }
  }

  console.log('Done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
