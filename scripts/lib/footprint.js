'use strict';
const {
  Address,
  Contract,
  Networks,
  Operation,
  SorobanDataBuilder,
  TransactionBuilder,
  nativeToScVal,
} = require('@stellar/stellar-sdk');

const SOROSWAP_POOLS_ENDPOINT = 'https://api.soroswap.finance/pools?network=mainnet&protocol=soroswap';
const SOROSWAP_ROUTER = 'CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH';
// Pause between submissions so the public RPC does not rate-limit the nightly run.
const RATE_LIMIT_PAUSE_MS = 10000;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// rpc.Server.getAccount used to reject with `{ code: 404 }`; since SDK v17 it rejects with a
// plain Error whose message starts with "Account not found". Accept both shapes.
function isAccountNotFound(error) {
  return Boolean(error) && (error.code === 404 || /Account not found/i.test(error.message || ''));
}

// The Soroswap API has answered with a bare array and with wrapped objects over time.
function normalizePools(responseData) {
  if (Array.isArray(responseData)) return responseData;
  return responseData.data || responseData.pools || [];
}

function getPairsWithContract(allPairs, contractAddress) {
  return allPairs.filter((pair) => pair.tokenA == contractAddress || pair.tokenB == contractAddress);
}

function getOtherAsset(pair, contract) {
  if (pair.tokenA === contract) return pair.tokenB;
  if (pair.tokenB === contract) return pair.tokenA;
  return null;
}

// An entry is archived once the ledger moves past its TTL; equal means still live.
function needsBump(latestLedgerSeq, liveUntilLedgerSeq) {
  return latestLedgerSeq > liveUntilLedgerSeq;
}

function getCurrentTimePlusOneHour(now = Date.now()) {
  return now + 3600000;
}

function unitToStroops(unit) {
  return unit.replace('.', '');
}

class FootprintRestorer {
  // Every external dependency is injected so the orchestration can run against fakes.
  constructor({
    server,
    horizonServer,
    keypair,
    fetchImpl = fetch,
    sleep = defaultSleep,
    log = console.log,
    logError = console.error,
  }) {
    this.server = server;
    this.horizonServer = horizonServer;
    this.keypair = keypair;
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
    this.log = log;
    this.logError = logError;
    this.allPairs = [];
  }

  async setup() {
    await this.updateAccount();
    await this.updateLatestLedgerSeq();
  }

  async updateLatestLedgerSeq() {
    try {
      this.latestLedgerSeq = (await this.server.getLatestLedger()).sequence;
    } catch (error) {
      this.logError('Error updating latest ledger sequence:', error);
      throw error;
    }
  }

  async updateAccount() {
    try {
      this.account = await this.server.getAccount(this.keypair.publicKey());
    } catch (error) {
      if (isAccountNotFound(error)) {
        this.logError(`\n❌ Account not found: ${this.keypair.publicKey()}`);
        this.logError("This account doesn't exist on the Stellar network.");
        this.logError("Please fund this account with XLM first. Unfunded accounts don't exist on Stellar.");
        this.logError(`\nTo fund the account, send XLM to: ${this.keypair.publicKey()}`);
      } else {
        this.logError('Error updating account:', error.message || error);
      }
      throw error;
    }
  }

  async populatePairs(apiKey) {
    if (!apiKey) {
      throw new Error('SOROSWAP_API_KEY environment variable is required. Please add it to your .env file.');
    }

    try {
      const response = await this.fetchImpl(SOROSWAP_POOLS_ENDPOINT, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        this.log(response);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const pools = normalizePools(await response.json());
      this.allPairs = pools.map(({ tokenA, tokenB, address }) => ({ tokenA, tokenB, address }));
      this.log(`Fetched ${this.allPairs.length} pairs from Soroswap API`);
    } catch (error) {
      this.logError('Error fetching pairs', error);
      throw error;
    }
  }

  savePairs() {
    const fs = require('fs');
    fs.writeFileSync('pairs.json', JSON.stringify(this.allPairs, null, 2));
  }

  async getFundedAddress(asset) {
    const holders = await this.getAssetHolders(asset);
    const holdersWithBalance = holders.filter((holder) => holder.balance > 0);
    if (holdersWithBalance.length > 0) {
      return holdersWithBalance[0];
    }
    this.log(`No funded account found for ${asset.code}`);
    return null;
  }

  async getAssetHolders(asset, limit = 10) {
    try {
      const accountsWithTrustline = await this.horizonServer.accounts().forAsset(asset).limit(limit).call();
      return accountsWithTrustline.records.map((account) => ({
        accountId: account.id,
        balance: account.balances.find(
          (balance) => balance.asset_code === asset.code && balance.asset_issuer === asset.issuer,
        ).balance,
      }));
    } catch (error) {
      this.logError('Error fetching asset holders:', error);
      return [];
    }
  }

  getPairsWithAsset(tokenListAsset) {
    return this.getPairsWithContract(tokenListAsset.contract);
  }

  getPairsWithContract(contractAddress) {
    return getPairsWithContract(this.allPairs, contractAddress);
  }

  getOtherAsset(pair, contract) {
    const other = getOtherAsset(pair, contract);
    if (other === null) this.log('Contract not found in pair', contract);
    return other;
  }

  async restoreFootprintToContract(contract) {
    try {
      this.log(`Processing contract: ${contract}`);
      const instance = new Contract(contract).getFootprint();
      const ledgerEntries = await this.server.getLedgerEntries(instance);
      if (ledgerEntries.entries.length === 0) {
        this.log('No footprint found for contract', contract);
        return;
      }

      const currentTtl = ledgerEntries.entries[0].liveUntilLedgerSeq;
      if (!needsBump(this.latestLedgerSeq, currentTtl)) {
        this.log('it should not be bumped');
        return;
      }

      this.log('it should be bumped');
      await this.updateAccount();
      await this.sendTransaction(await this.restoreFootprintTransaction(instance));
      await this.sleep(RATE_LIMIT_PAUSE_MS);
    } catch (error) {
      this.log('Error restoring footprint', error);
    }
  }

  // Note: this transaction only restores the instance storage of a contract.
  async restoreFootprintTransaction(instance) {
    const tx = new TransactionBuilder(this.account, {
      fee: '100',
      networkPassphrase: Networks.PUBLIC,
    })
      .setSorobanData(new SorobanDataBuilder().setReadWrite([instance]).build())
      .addOperation(Operation.restoreFootprint({}))
      .setTimeout(30)
      .build();
    const preparedTx = await this.server.prepareTransaction(tx);
    preparedTx.sign(this.keypair);
    return preparedTx;
  }

  async sendTransaction(preparedTx) {
    try {
      const txRes = await this.server.sendTransaction(preparedTx);
      this.log('🚀 ~ FootprintRestorer ~ restoreFootprintTransaction ~ txRes:', txRes);
      if (txRes.status === 'ERROR') {
        // SDK v17 XDR unions expose the discriminant as a `.type` string on the arm.
        const errorResult = txRes.errorResult?.result?.type;
        if (errorResult === 'txInsufficientBalance') {
          this.log('Insufficient balance to restore footprint. Please fund the account.');
        } else {
          this.log('Error restoring footprint transaction', JSON.stringify(txRes, null, 2));
        }
      }
      return txRes;
    } catch (error) {
      this.log('Error restoring footprint transaction', error);
      return undefined;
    }
  }

  checkRestoration(simulation) {
    const restorePreamble = simulation.restorePreamble;

    if (restorePreamble && restorePreamble.minResourceFee) {
      this.log(`Minimum resource fee needed: ${restorePreamble.minResourceFee}`);
    }

    if (restorePreamble && restorePreamble.transactionData) {
      let needRestoration = false;
      const sorobanDataBuilder = restorePreamble.transactionData;

      const readOnlyKeys = sorobanDataBuilder.getReadOnly();
      const readWriteKeys = sorobanDataBuilder.getReadWrite();

      if (readOnlyKeys.length > 0) {
        this.log('Read-only entries that may need restoration:');
        readOnlyKeys.forEach((key, index) => {
          this.log(`Entry ${index + 1}:`, key);
        });
        needRestoration = true;
      }

      if (readWriteKeys.length > 0) {
        needRestoration = true;
      }
      return [needRestoration, restorePreamble];
    }
    return [false, null];
  }

  async skimTransaction(pairAddress) {
    const pair = new Contract(pairAddress);

    const skimTx = new TransactionBuilder(this.account, {
      fee: '100',
      networkPassphrase: Networks.PUBLIC,
    })
      .addOperation(pair.call('skim', new Address(this.keypair.publicKey()).toScVal()))
      .setTimeout(30)
      .build();
    return this.server.simulateTransaction(skimTx);
  }

  async swapTransaction(fundedAddress, contract1, contract2, amount0) {
    const routerContract = new Contract(SOROSWAP_ROUTER);
    const path = [contract1, contract2].map((address) => new Address(address));
    const amount1 = '0';

    const args = [
      nativeToScVal(amount0, { type: 'i128' }),
      nativeToScVal(amount1, { type: 'i128' }),
      nativeToScVal(path),
      new Address(fundedAddress).toScVal(),
      nativeToScVal(getCurrentTimePlusOneHour(), { type: 'u64' }),
    ];

    const fundedAccount = await this.server.getAccount(fundedAddress);

    const tx = new TransactionBuilder(fundedAccount, {
      fee: '100',
      networkPassphrase: Networks.PUBLIC,
    })
      .addOperation(routerContract.call('swap_exact_tokens_for_tokens', ...args))
      .setTimeout(30)
      .build();

    const simulatedTransaction = await this.server.simulateTransaction(tx);
    if (simulatedTransaction.error) {
      const errorMessage = simulatedTransaction.error;
      if (errorMessage.includes('trustline entry is missing for account')) {
        this.log('Trustline is missing for the account. Please create the trustline.');
      } else {
        this.log('An error occurred during the transaction simulation:', errorMessage);
      }
    }
    return simulatedTransaction;
  }

  async handleLedgerEntriesRestoration(restorePreamble) {
    this.log('restoring ledger entries..');
    await this.updateAccount();
    const restoreTx = new TransactionBuilder(this.account, {
      fee: restorePreamble.minResourceFee,
      networkPassphrase: Networks.PUBLIC,
    })
      .setSorobanData(restorePreamble.transactionData.build())
      .addOperation(Operation.restoreFootprint({}))
      .setTimeout(30)
      .build();
    const preparedTx = await this.server.prepareTransaction(restoreTx);
    preparedTx.sign(this.keypair);
    await this.sendTransaction(preparedTx);

    await this.sleep(RATE_LIMIT_PAUSE_MS);
  }

  async restoreLedgerEntriesForTokenListAsset(tokenListAsset) {
    const pairs = this.getPairsWithContract(tokenListAsset.contract);
    if (pairs.length === 0) {
      this.log(
        `No pairs found for ${tokenListAsset.code}:${tokenListAsset.issuer}, contract: ${tokenListAsset.contract}`,
      );
      return;
    }
    for (const pair of pairs) {
      const txSimulated = await this.skimTransaction(pair.address);
      const [needsRestoration, restorePreamble] = this.checkRestoration(txSimulated);
      if (needsRestoration) {
        this.log('Restoration needed for pair', pair.address);
        await this.handleLedgerEntriesRestoration(restorePreamble);
      } else {
        this.log('No restoration needed for pair', pair.address);
      }
    }
  }

  async restoreFootprints(assets) {
    for (const asset of assets) {
      await this.restoreFootprintToContract(asset.contract);
      await this.restoreLedgerEntriesForTokenListAsset(asset);
    }
  }
}

module.exports = {
  FootprintRestorer,
  isAccountNotFound,
  normalizePools,
  getPairsWithContract,
  getOtherAsset,
  needsBump,
  getCurrentTimePlusOneHour,
  unitToStroops,
  SOROSWAP_POOLS_ENDPOINT,
  SOROSWAP_ROUTER,
  RATE_LIMIT_PAUSE_MS,
};
