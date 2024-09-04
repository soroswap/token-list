const StellarSdk = require("stellar-sdk");
const tokenList = require("../tokenList.json"); // Adjust the path as needed
const rpc = process.env.RPC_URL;
const horizonUrl = process.env.HORIZON_URL;
const addressWithTrustlines = "GBHYCV7DRS3GTFZYTW4MTHMBKRJJSZKV7LSCAERQQKUHZRYBW34FGUE4"

class FootprintRestorer {

    constructor(rpc, horizonUrl, keypair) {
        this.keypair = keypair;
        this.server = new StellarSdk.SorobanRpc.Server(rpc, { allowHttp: true });
        this.horizonServer = new StellarSdk.Horizon.Server(rpc);
    }

    async setup() {
        this.account = await this.server.getAccount(this.keypair.publicKey());
        this.latestLedgerSeq = (await this.server.getLatestLedger()).sequence;
    }

    async updateAccount() {
        this.account = await this.server.getAccount(this.keypair.publicKey());
    }

    getAllPairsEndpoint() {
        const endpoint = "https://info.soroswap.finance/api/pairs/plain?network=MAINNET";
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
        const pairs = this.allPairs.filter(pair => {
            return pair.tokenA == tokenListAsset.contract || pair.tokenB == tokenListAsset.contract;
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

    async checkRestoration(simulation) {
        // console.log('🚀 ~ FootprintRestorer ~ checkRestoration ~ simulation:', simulation);
        const restorePreamble = simulation.restorePreamble;
        // console.log('🚀 ~ FootprintRestorer ~ checkRestoration ~ restorePreamble:', restorePreamble);
        // Checking and logging the minimum resource fee required for restoration
        if (restorePreamble && restorePreamble.minResourceFee) {
            console.log(`Minimum resource fee needed: ${restorePreamble.minResourceFee}`);
        }
        // Processing the transaction data needed for restoration
        if (restorePreamble && restorePreamble.transactionData) {
            const sorobanDataBuilder = restorePreamble.transactionData;

            // Get the read-only and read-write keys using methods from SorobanDataBuilder
            const readOnlyKeys = sorobanDataBuilder.getReadOnly();
            const readWriteKeys = sorobanDataBuilder.getReadWrite();

            // Log read-only entries
            if (readOnlyKeys.length > 0) {
                console.log('Read-only entries that may need restoration:');
                readOnlyKeys.forEach((key, index) => {
                    console.log(`Entry ${index + 1}:`, key);
                });
                return true;
            }

            // Log read-write entries
            if (readWriteKeys.length > 0) {
                console.log('Read-write entries that may need restoration:');
                readWriteKeys.forEach((key, index) => {
                    console.log(`Entry ${index + 1}:`, key);
                    console.log('🚀 ~ FootprintRestorer ~ readWriteKeys.forEach ~ "contractData" in key:', 'contract' in key.contractData());
                    try {
                        const val = key.contractData().contract().contractId()
                        console.log('🚀 ~ FootprintRestorer ~ readWriteKeys.forEach ~ val:', val);
                        const hexString = val.toString('hex');
                        console.log('🚀 ~ FootprintRestorer ~ readWriteKeys.forEach ~ hexString:', hexString);
                        const contract = StellarSdk.StrKey.encodeContract(val);
                        console.log('🚀 ~ FootprintRestorer ~ readWriteKeys.forEach ~ contract:', contract);
                        const durability = key.contractData().durability()
                        console.log('🚀 ~ FootprintRestorer ~ readWriteKeys.forEach ~ durability:', durability);
                        const ledgerKey = key.contractData().key()
                        console.log('🚀 ~ FootprintRestorer ~ readWriteKeys.forEach ~ ledgerKey:', ledgerKey);
                        const nativeKey = StellarSdk.scValToNative(ledgerKey)
                        console.log('🚀 ~ FootprintRestorer ~ readWriteKeys.forEach ~ nativeKey:', nativeKey);
                    } catch (e) {
                        const contractCode = key.contractCode()
                        console.log('🚀 ~ FootprintRestorer ~ readWriteKeys.forEach ~ contractCode:', contractCode);
                    }
                });
                return [true, restorePreamble]
            }
            // const sorobanDataBuilt = sorobanDataBuilder.build();
            // console.log('🚀 ~ FootprintRestorer ~ checkRestoration ~ sorobanDataBuilt:', sorobanDataBuilt);

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

    async handleLedgerEntriesRestoration(transaction) {
        const simulatedTransaction = await this.server.simulateTransaction(transaction);
        const restorePreamble = simulatedTransaction.restorePreamble;

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
        const txRes = await this.server.sendTransaction(preparedTx);
        console.log(
            "🚀 ~ FootprintRestorer ~ restoreFootprintTransaction ~ txRes:",
            txRes
        );
    }


    async restoreFootprints() {
        for (const asset of tokenList.assets) {
            await this.restoreFootprintToContract(asset.contract);
            await this.updateAccount();
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

    // for (const tokenListAsset of [tokenList.assets[0]]) {
    for (const tokenListAsset of tokenList.assets) {
        const asset = new StellarSdk.Asset(tokenListAsset.code, tokenListAsset.issuer);
        // console.log('🚀 ~ main ~ asset:', asset);
        const pairs = footprintRestorer.getPairsWithAsset(tokenListAsset);
        if (pairs.length === 0) {
            console.log(`No pairs found for ${tokenListAsset.code}:${tokenListAsset.issuer}, contract: ${tokenListAsset.contract}`);
        } else {
            const { accountId: fundedAddress, balance } = await footprintRestorer.getFundedAddress(asset);
            // console.log('🚀 ~ balance:', balance);
            // console.log(`Pairs found for ${tokenListAsset.code}:${tokenListAsset.issuer}, contract: ${tokenListAsset.contract}`);
            for (const pair of pairs) {
                // console.log('🚀 ~ pair:', pair);
                const otherAsset = footprintRestorer.getOtherAsset(pair, tokenListAsset.contract);
                // console.log(`Pair: ${pair.tokenA}:${pair.tokenB}, Other asset: ${otherAsset}, tokenListAsset: ${tokenListAsset.contract}`);
                // const txSimulated = await footprintRestorer.swapTransaction(fundedAddress, tokenListAsset.contract, otherAsset, unitToStroops(balance))
                const txSimulated = await footprintRestorer.skimTransaction(pair.address);
                const [needsRestoration, restorePreamble] = await footprintRestorer.checkRestoration(txSimulated);
                if (needsRestoration) {
                    console.log("Restoration needed for pair", pair);
                    // await footprintRestorer.handleLedgerEntriesRestoration(swapTx);
                } else {
                    // console.log("No restoration needed for pair", pair);
                }
            }
        }
    }

    // await footprintRestorer.restoreFootprints();
    // const contract = "CDHBIACXSM5K2NFCCHQIJQNDJPHGPW4OHIYVXGCFMVT7PNLWXY4NGRNH"; // AMM
    // const contract = "CAZQYRFG7A2CZTZ2NEODHZGIOORFFKOEFV7WWZOBJEYXER56ASCUBD7P"; // GQX
    // const contract = "CDCKFBZYF2AQCSM3JOF2ZM27O3Y6AJAI4OTCQKAFNZ3FHBYUTFOKICIY"; // XTAR
    // const aquaContractAddress = "CAUIKL3IYGMERDRUN6YSCLWVAKIFG5Q4YJHUKM4S4NJZQIA3BAS6OJPK" // aqua

    // const instance = new StellarSdk.Contract(contract).getFootprint();
    // const tx = await footprintRestorer.restoreFootprintTransaction(instance);
    // const fundedAddress = "GCWGZHN3ZVH5BSW6246DOIKPDQL6RXKKENB6ZJ2MIVPISGKRBIOHM2GO" // This address has funds and trustlines
    // const contract1 = "CAUIKL3IYGMERDRUN6YSCLWVAKIFG5Q4YJHUKM4S4NJZQIA3BAS6OJPK" // aqua
    // const contract2 = "CDCKFBZYF2AQCSM3JOF2ZM27O3Y6AJAI4OTCQKAFNZ3FHBYUTFOKICIY" // XTAR

    // const fundedAddress = "GCPJFNZAARY3Z2AM7RVXDZDLPOEBT4QHTQXFOFKMZHLV7PPDKE2M67Q6"
    // const contract1 = "CBCU5VMZ3GNHHKJUWZ2GI7K36MEAXOJW2RJCIJHFPVFGBME3WADLXA6W" // BlabberCoin
    // const contract2 = "CDME3GWAU7YSHVB6GWKDOQORR6TYKKQG6G7FDMMO7OPMQALBCNI5A2JR" // HahaToken

    // const swapTx = await footprintRestorer.swapTransaction(fundedAddress, contract1, contract2)
    // await footprintRestorer.checkRestoration(swapTx);

    // const txXDR = "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"
    // const tx = StellarSdk.TransactionBuilder.fromXDR(txXDR, StellarSdk.Networks.PUBLIC);
    // await footprintRestorer.checkRestoration(tx);
    // await footprintRestorer.handleLedgerEntriesRestoration(swapTx);
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