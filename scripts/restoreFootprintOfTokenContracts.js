const StellarSdk = require("stellar-sdk");
const tokenList = require("../tokenList.json"); // Adjust the path as needed
const rpc = process.env.RPC_URL;
const horizonUrl = process.env.HORIZON_URL;
const addressWithTrustlines = "GBHYCV7DRS3GTFZYTW4MTHMBKRJJSZKV7LSCAERQQKUHZRYBW34FGUE4"

const addedElementForTest = {
    "contract": "CBCU5VMZ3GNHHKJUWZ2GI7K36MEAXOJW2RJCIJHFPVFGBME3WADLXA6W",
    "code": "BLAH",
    "name": "BlabberCoin",
    "icon": "https://app.soroswap.finance/unknown-token.png",
    "decimals": 7
}

class FootprintRestorer {

    constructor(rpc, horizonUrl, keypair) {
        this.keypair = keypair;
        this.server = new StellarSdk.SorobanRpc.Server(rpc, { allowHttp: true });
        this.horizonServer = new StellarSdk.Horizon.Server(rpc);
    }

    async setup() {
        await this.updateAccount()
        await this.updateLatestLedgerSeq()
    }

    async updateLatestLedgerSeq() {
        this.latestLedgerSeq = (await this.server.getLatestLedger()).sequence;
    }

    async updateAccount() {
        this.account = await this.server.getAccount(this.keypair.publicKey());
    }

    getAllPairsEndpoint() {
        const endpoint = "https://info.soroswap.finance/api/pairs/plain?network=MAINNET&full=true";
        return endpoint;
    }

    async populatePairs() {
        const endpoint = this.getAllPairsEndpoint();
        try {
            const response = await fetch(endpoint);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.allPairs = await response.json();

        } catch (error) {
            console.error("Error fetching pairs", error);
            return;
        }
    }
    async savePairs() {
        const fs = require('fs');
        const pairs = this.allPairs.map(pair => {
            return {
                tokenA: pair.tokenA,
                tokenB: pair.tokenB,
                address: pair.address
            }
        });
        const data = JSON.stringify(pairs, null, 2);
        fs.writeFileSync('pairs.json', data);

    }

    async getFundedAddress(asset) {
        const holders = await this.getAssetHolders(asset);
        const holdersWithBalance = holders.filter(h => h.balance > 0);
        if (holdersWithBalance.length > 0) {
            return holdersWithBalance[0];
        } else {
            console.log(`No funded account found for ${asset.code}`);
            return null;
        }

    }

    async getAssetHolders(asset, limit = 10) {
        try {
            const accountsWithTrustline = await this.horizonServer.accounts()
                .forAsset(asset)
                .limit(limit)
                .call();
            const balances = accountsWithTrustline.records.map(account => ({
                accountId: account.id,
                balance: account.balances.find(b => b.asset_code === asset.code && b.asset_issuer === asset.issuer).balance
            }));
            return balances;
        } catch (error) {
            console.error('Error fetching asset holders:', error);
            return [];
        }
    }

    getPairsWithAsset(tokenListAsset) {
        return this.getPairsWithContract(tokenListAsset.contract);
    }

    getPairsWithContract(contractAddress) {
        const pairs = this.allPairs.filter(pair => {
            return pair.tokenA == contractAddress || pair.tokenB == contractAddress;
        });
        return pairs;
    }

    getOtherAsset(pair, contract) {
        if (pair.tokenA === contract) {
            return pair.tokenB;
        } else if (pair.tokenB === contract) {
            return pair.tokenA;
        } else {
            console.log("Contract not found in pair", contract);
            return null;
        }
    }

    async restoreFootprintToContract(contract) {
        try {
            console.log(`Processing contract: ${contract}`);
            const instance = new StellarSdk.Contract(contract).getFootprint();
            let ledgerEntries = await this.server.getLedgerEntries(instance);
            if (ledgerEntries.entries.length === 0) {
                console.log("No footprint found for contract", contract);
                return;
            }

            let currentTtl = ledgerEntries.entries[0].liveUntilLedgerSeq;

            if (this.latestLedgerSeq > currentTtl) {
                console.log("it should be bumped");
                await this.updateAccount();
                await this.sendTransaction(await this.restoreFootprintTransaction(instance));
                // timeout to avoid rate limiting
                await new Promise((resolve) => setTimeout(resolve, 10000));

            } else {
                console.log("it should not be bumped");
            }
        } catch (error) {
            console.log("Error restoring footprint", error);
        }
    }

    // Note: Apparently this transaction only restores the instance storage of a contract
    async restoreFootprintTransaction(instance) {
        let tx = new StellarSdk.TransactionBuilder(this.account, {
            fee: 100,
            networkPassphrase: StellarSdk.Networks.PUBLIC,
        })
            .setSorobanData(
                new StellarSdk.SorobanDataBuilder().setReadWrite([instance]).build()
            )
            .addOperation(StellarSdk.Operation.restoreFootprint({}))
            .setTimeout(30)
            .build();
        let preparedTx = await this.server.prepareTransaction(tx);
        preparedTx.sign(this.keypair);
        return preparedTx
    }

    async sendTransaction(preparedTx) {
        try {
            const txRes = await this.server.sendTransaction(preparedTx);
            console.log(
                "🚀 ~ FootprintRestorer ~ restoreFootprintTransaction ~ txRes:",
                txRes
            );
            if (txRes.status === "ERROR") {
                const errorResult =
                    txRes.errorResult?._attributes?.result?._switch?.name;
                if (errorResult === "txInsufficientBalance") {
                    console.log(
                        "Insufficient balance to restore footprint. Please fund the account."
                    );
                    // Perform additional actions here, such as notifying the user or attempting to fund the account
                } else {
                    console.log(
                        "Error restoring footprint transaction",
                        JSON.stringify(txRes, null, 2)
                    );
                }
            }
            return txRes;
        } catch (error) {
            console.log("Error restoring footprint transaction", error);
        }
    }

    checkRestoration(simulation) {
        const restorePreamble = simulation.restorePreamble;

        if (restorePreamble && restorePreamble.minResourceFee) {
            console.log(`Minimum resource fee needed: ${restorePreamble.minResourceFee}`);
        }

        if (restorePreamble && restorePreamble.transactionData) {
            let needRestoration = false;
            const sorobanDataBuilder = restorePreamble.transactionData;

            const readOnlyKeys = sorobanDataBuilder.getReadOnly();
            const readWriteKeys = sorobanDataBuilder.getReadWrite();

            if (readOnlyKeys.length > 0) {
                console.log('Read-only entries that may need restoration:');
                readOnlyKeys.forEach((key, index) => {
                    console.log(`Entry ${index + 1}:`, key);
                });
                needRestoration = true;
            }

            // Log read-write entries
            if (readWriteKeys.length > 0) {
                // // Note: Uncomment to explore the ledgerKeys that need to be restored
                // // console.log('Read-write entries that may need restoration:');
                // readWriteKeys.forEach((key, index) => {
                //     console.log(`Entry ${index + 1}:`, key);
                //     try {
                //         console.log('🚀 ~ FootprintRestorer ~ readWriteKeys.forEach ~ "contractData" in key:', 'contract' in key.contractData());
                //         const val = key.contractData().contract().contractId()
                //         // console.log('🚀 ~ FootprintRestorer ~ readWriteKeys.forEach ~ val:', val);
                //         // const hexString = val.toString('hex');
                //         //         console.log('🚀 ~ FootprintRestorer ~ readWriteKeys.forEach ~ hexString:', hexString);
                //         const contract = StellarSdk.StrKey.encodeContract(val);
                //         console.log('🚀 ~ FootprintRestorer ~ readWriteKeys.forEach ~ contract:', contract);
                //         //         const durability = key.contractData().durability()
                //         //         console.log('🚀 ~ FootprintRestorer ~ readWriteKeys.forEach ~ durability:', durability);
                //         const ledgerKey = key.contractData().key()
                //         console.log('🚀 ~ FootprintRestorer ~ readWriteKeys.forEach ~ ledgerKey:', ledgerKey);
                //         const nativeKey = StellarSdk.scValToNative(ledgerKey)
                //         console.log('🚀 ~ FootprintRestorer ~ readWriteKeys.forEach ~ nativeKey:', nativeKey);
                //     } catch (e) {
                //         console.log('🚀 ~ FootprintRestorer ~ readWriteKeys.forEach ~ e:', e);
                //         // const contractCode = key.contractCode()
                //         // console.log('🚀 ~ FootprintRestorer ~ readWriteKeys.forEach ~ contractCode:', contractCode);
                //     }
                // });

                needRestoration = true;
            }
            return [needRestoration, restorePreamble]
        }
        return [false, null]
    }

    async skimTransaction(pairAddress) {
        const pair = new StellarSdk.Contract(pairAddress);

        const skimTx = new StellarSdk.TransactionBuilder(this.account, {
            fee: 100,
            networkPassphrase: StellarSdk.Networks.PUBLIC,
        })
            .addOperation(pair.call("skim", new StellarSdk.Address(this.keypair.publicKey()).toScVal()))
            .setTimeout(30)
            .build();
        const simulatedTransaction = await this.server.simulateTransaction(skimTx);
        return simulatedTransaction;
    }

    async swapTransaction(fundedAddress, contract1, contract2, amount0) {
        const routerAddress = "CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH"
        const routerContract = new StellarSdk.Contract(routerAddress);

        const path = [
            contract1,
            contract2,
        ].map((address) => new StellarSdk.Address(address));
        // const amount0 = "1000";
        const amount1 = "0";

        const amount0ScVal = StellarSdk.nativeToScVal(amount0, { type: "i128" });
        const amount1ScVal = StellarSdk.nativeToScVal(amount1, { type: "i128" });
        const pathScVal = StellarSdk.nativeToScVal(path);

        const args = [
            amount0ScVal,
            amount1ScVal,
            pathScVal, // path
            new StellarSdk.Address(fundedAddress).toScVal(),
            // new StellarSdk.Address(addressWithTrustlines).toScVal(),
            StellarSdk.nativeToScVal(getCurrentTimePlusOneHour(), { type: "u64" })
        ];

        const fundedAccount = await this.server.getAccount(fundedAddress);

        const tx = new StellarSdk.TransactionBuilder(fundedAccount, {
            fee: 100,
            networkPassphrase: StellarSdk.Networks.PUBLIC,
        })
            .addOperation(routerContract.call("swap_exact_tokens_for_tokens", ...args))
            .setTimeout(30)
            .build();

        const simulatedTransaction = await this.server.simulateTransaction(tx);
        if (simulatedTransaction.error) {
            const errorMessage = simulatedTransaction.error;
            if (errorMessage.includes("trustline entry is missing for account")) {
                console.log("Trustline is missing for the account. Please create the trustline.");
                // Handle the missing trustline error here
                // For example, you can create the trustline or notify the user
            } else {
                console.log("An error occurred during the transaction simulation:", errorMessage);
            }
            // return;
        }
        return simulatedTransaction;
    }

    async handleLedgerEntriesRestoration(restorePreamble) {
        console.log("restoring ledger entries..")
        await this.updateAccount();
        const restoreTx = new StellarSdk.TransactionBuilder(this.account, {
            fee: restorePreamble.minResourceFee,
            networkPassphrase: StellarSdk.Networks.PUBLIC,
        })
            .setSorobanData(restorePreamble.transactionData.build())
            .addOperation(StellarSdk.Operation.restoreFootprint({}))
            .setTimeout(30)
            .build();
        const preparedTx = await this.server.prepareTransaction(restoreTx);
        preparedTx.sign(this.keypair);
        await this.sendTransaction(preparedTx)

        await new Promise((resolve) => setTimeout(resolve, 10000));
    }

    async restoreLedgerEntriesForTokenListAsset(tokenListAsset) {
        const pairs = this.getPairsWithContract(tokenListAsset.contract);
        if (pairs.length === 0) {
            console.log(`No pairs found for ${tokenListAsset.code}:${tokenListAsset.issuer}, contract: ${tokenListAsset.contract}`);
        } else {
            for (const pair of pairs) {
                const txSimulated = await this.skimTransaction(pair.address);
                const [needsRestoration, restorePreamble] = await this.checkRestoration(txSimulated);
                if (needsRestoration) {
                    console.log("Restoration needed for pair", pair.address);
                    await this.handleLedgerEntriesRestoration(restorePreamble);
                } else {
                    console.log("No restoration needed for pair", pair.address);
                }
            }
        }
    }

    async restoreFootprints() {
        for (const asset of tokenList.assets) {
            // for (const asset of [addedElementForTest, ...tokenList.assets]) {
            await this.restoreFootprintToContract(asset.contract);
            await this.restoreLedgerEntriesForTokenListAsset(asset);
        }
    }
    printKeypair() {
        console.log("Public Key: ", this.keypair.publicKey());
        console.log("Secret Key: ", this.keypair.secret());
    }
}

async function main() {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        console.error("Please provide a private key");
        return;
    }
    if (!rpc) {
        console.error("Please provide a RPC URL");
        return;
    }
    if (!horizonUrl) {
        console.error("Please provide a Horizon URL");
        return;
    }

    const keypair = StellarSdk.Keypair.fromSecret(privateKey);

    const footprintRestorer = new FootprintRestorer(rpc, horizonUrl, keypair);

    await footprintRestorer.setup();
    await footprintRestorer.populatePairs();

    await footprintRestorer.restoreFootprints();

}
main();


const getCurrentTimePlusOneHour = () => {
    // Get the current time in milliseconds
    const now = Date.now();

    // Add one hour (3600000 milliseconds)
    const oneHourLater = now + 3600000;

    return oneHourLater;
};

const unitToStroops = (unit) => {
    return unit.replace(".", "");
};