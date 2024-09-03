const StellarSdk = require("stellar-sdk");
const tokenList = require("../tokenList.json"); // Adjust the path as needed
const rpc = process.env.RPC_URL;

class FootprintRestorer {

    constructor(rpc, keypair) {
        this.keypair = keypair;
        this.server = new StellarSdk.SorobanRpc.Server(rpc, { allowHttp: true });
    }

    async setup() {
        this.account = await this.server.getAccount(this.keypair.publicKey());
        this.latestLedgerSeq = (await this.server.getLatestLedger()).sequence;
    }

    async updateAccount() {
        this.account = await this.server.getAccount(this.keypair.publicKey());
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

    async checkRestoration(tx) {
        const simulation = await this.server.simulateTransaction(tx);
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
                    // const res = StellarSdk.scValToNative(val)
                    // console.log('🚀 ~ FootprintRestorer ~ readWriteKeys.forEach ~ res:', res);
                    // console.log(`Entry ${index + 1}:`, JSON.stringify(key, null, 2));
                    // const vec = key.contractData().key().vec()
                    // console.log('🚀 ~ FootprintRestorer ~ readWriteKeys.forEach ~ vec:', vec);
                    // vec.forEach((entry, index) => {
                    //     try {
                    //         console.log('🚀 ~ FootprintRestorer ~ readWriteKeys.forEach ~ entry:', entry);
                    //         const entryContract = entry.address().contractId()
                    //         console.log('🚀 ~ FootprintRestorer ~ vec.forEach ~ entryContract:', entryContract);
                    //     } catch (e) {
                    //         console.log('🚀 ~ FootprintRestorer ~ vec.forEach ~ e:', e);
                    //     }
                    // })
                });
                return true
            }

            const sorobanDataBuilt = sorobanDataBuilder.build();
            // console.log('🚀 ~ FootprintRestorer ~ checkRestoration ~ sorobanDataBuilt:', sorobanDataBuilt);

        }
    }

    async swapTransaction(fundedAddress, contract1, contract2) {
        const routerAddress = "CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH"
        const routerContract = new StellarSdk.Contract(routerAddress);

        const path = [
            contract1,
            contract2,
        ].map((address) => new StellarSdk.Address(address));
        const amount0 = "1000";
        const amount1 = "1";

        const amount0ScVal = StellarSdk.nativeToScVal(amount0, { type: "i128" });
        const amount1ScVal = StellarSdk.nativeToScVal(amount1, { type: "i128" });
        const pathScVal = StellarSdk.nativeToScVal(path);

        const args = [
            amount0ScVal,
            amount1ScVal,
            pathScVal, // path
            new StellarSdk.Address(fundedAddress).toScVal(),
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
        }
        return tx;
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
    const keypair = StellarSdk.Keypair.fromSecret(privateKey);
    console.log('🚀 ~ main ~ keypair:', keypair.publicKey());

    const footprintRestorer = new FootprintRestorer(rpc, keypair);

    await footprintRestorer.setup();
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

    const fundedAddress = "GCPJFNZAARY3Z2AM7RVXDZDLPOEBT4QHTQXFOFKMZHLV7PPDKE2M67Q6"
    const contract1 = "CBCU5VMZ3GNHHKJUWZ2GI7K36MEAXOJW2RJCIJHFPVFGBME3WADLXA6W" // BlabberCoin
    const contract2 = "CDME3GWAU7YSHVB6GWKDOQORR6TYKKQG6G7FDMMO7OPMQALBCNI5A2JR" // HahaToken

    const swapTx = await footprintRestorer.swapTransaction(fundedAddress, contract1, contract2)
    await footprintRestorer.checkRestoration(swapTx);

    // const txXDR = "AAAAAgAAAACsbJ27zU/Qyt7XPDchTxwX6N1KI0Psp0xFXokZUQocdgArzgIDLGFTAAAAFQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAGAAAAAAAAAABDdXHEOpqSiOzIgf9Ew6t+cnOiZ9DCOk+T/5T+68QigQAAAANYWRkX2xpcXVpZGl0eQAAAAAAAAgAAAASAAAAASW0/NhZrsL6Y0hDjEibPDwQyYttIb5P08swy2iVPvl3AAAAEgAAAAHOFABXkzqtNKIR4ITBo0vOZ9uOOjFbmEVlZ/e1dr440wAAAAoAAAAAAAAAAAAAAAAAEaAOAAAACgAAAAAAAAAAAAAAAAExLQAAAAAKAAAAAAAAAAAAAAAAABGJfwAAAAoAAAAAAAAAAAAAAAABL6ZgAAAAEgAAAAAAAAAArGydu81P0Mre1zw3IU8cF+jdSiND7KdMRV6JGVEKHHYAAAAFtINJ9wAAAZEAAAABAAAAAAAAAAAAAAABDdXHEOpqSiOzIgf9Ew6t+cnOiZ9DCOk+T/5T+68QigQAAAANYWRkX2xpcXVpZGl0eQAAAAAAAAgAAAASAAAAASW0/NhZrsL6Y0hDjEibPDwQyYttIb5P08swy2iVPvl3AAAAEgAAAAHOFABXkzqtNKIR4ITBo0vOZ9uOOjFbmEVlZ/e1dr440wAAAAoAAAAAAAAAAAAAAAAAEaAOAAAACgAAAAAAAAAAAAAAAAExLQAAAAAKAAAAAAAAAAAAAAAAABGJfwAAAAoAAAAAAAAAAAAAAAABL6ZgAAAAEgAAAAAAAAAArGydu81P0Mre1zw3IU8cF+jdSiND7KdMRV6JGVEKHHYAAAAFtINJ9wAAAZEAAAACAAAAAAAAAAEltPzYWa7C+mNIQ4xImzw8EMmLbSG+T9PLMMtolT75dwAAAAh0cmFuc2ZlcgAAAAMAAAASAAAAAAAAAACsbJ27zU/Qyt7XPDchTxwX6N1KI0Psp0xFXokZUQocdgAAABIAAAABEfDtmiPMMGjMOI9B9TL7CJ+cH6fM/q9Icm1gE/WM2TQAAAAKAAAAAAAAAAAAAAAAABGgDgAAAAAAAAAAAAAAAc4UAFeTOq00ohHghMGjS85n2446MVuYRWVn97V2vjjTAAAACHRyYW5zZmVyAAAAAwAAABIAAAAAAAAAAKxsnbvNT9DK3tc8NyFPHBfo3UojQ+ynTEVeiRlRChx2AAAAEgAAAAER8O2aI8wwaMw4j0H1MvsIn5wfp8z+r0hybWAT9YzZNAAAAAoAAAAAAAAAAAAAAAABMSz+AAAAAAAAAAEAAAAAAAAACAAAAAYAAAABDdXHEOpqSiOzIgf9Ew6t+cnOiZ9DCOk+T/5T+68QigQAAAAUAAAAAQAAAAYAAAABJbT82FmuwvpjSEOMSJs8PBDJi20hvk/TyzDLaJU++XcAAAAUAAAAAQAAAAYAAAABOHJCa9WeSmFYUIbjiG1FeQO1PyL4njYeqAb/ywescZ8AAAAQAAAAAQAAAAIAAAAPAAAAFVBhaXJBZGRyZXNzZXNCeVRva2VucwAAAAAAABAAAAABAAAAAgAAABIAAAABJbT82FmuwvpjSEOMSJs8PBDJi20hvk/TyzDLaJU++XcAAAASAAAAAc4UAFeTOq00ohHghMGjS85n2446MVuYRWVn97V2vjjTAAAAAQAAAAYAAAABOHJCa9WeSmFYUIbjiG1FeQO1PyL4njYeqAb/ywescZ8AAAAUAAAAAQAAAAYAAAABzhQAV5M6rTSiEeCEwaNLzmfbjjoxW5hFZWf3tXa+ONMAAAAUAAAAAQAAAAcYBRRWgWtm8S53Olb3fFeU+sGx+3q24i1PrVpBJ3D3PgAAAAdMPbPr0taiqyPeH2Iuqrs5UBU5tGEbaGIuxOR/dsS6BwAAAAddtziwXZFIEookCw4sHLk1woBRkr+YpXlCGqzaNkyNrgAAAAYAAAAAAAAAAKxsnbvNT9DK3tc8NyFPHBfo3UojQ+ynTEVeiRlRChx2AAAAAQAAAACsbJ27zU/Qyt7XPDchTxwX6N1KI0Psp0xFXokZUQocdgAAAAFBTU0AAAAAACMPu6l4R6GOpClzpdbH/8OJC+r8WGR+3TLjWVnnyFpgAAAABgAAAAER8O2aI8wwaMw4j0H1MvsIn5wfp8z+r0hybWAT9YzZNAAAABAAAAABAAAAAgAAAA8AAAAHQmFsYW5jZQAAAAASAAAAAAAAAACsbJ27zU/Qyt7XPDchTxwX6N1KI0Psp0xFXokZUQocdgAAAAEAAAAGAAAAARHw7ZojzDBozDiPQfUy+wifnB+nzP6vSHJtYBP1jNk0AAAAFAAAAAEAAAAGAAAAASW0/NhZrsL6Y0hDjEibPDwQyYttIb5P08swy2iVPvl3AAAAEAAAAAEAAAACAAAADwAAAAdCYWxhbmNlAAAAABIAAAABEfDtmiPMMGjMOI9B9TL7CJ+cH6fM/q9Icm1gE/WM2TQAAAABAAAABgAAAAHOFABXkzqtNKIR4ITBo0vOZ9uOOjFbmEVlZ/e1dr440wAAABAAAAABAAAAAgAAAA8AAAAHQmFsYW5jZQAAAAASAAAAARHw7ZojzDBozDiPQfUy+wifnB+nzP6vSHJtYBP1jNk0AAAAAQIAK8YAASJ4AAAFVAAAAAAAK82eAAAAAVEKHHYAAABAn7qfg+pXK+IUc4lmhTMWOGHLYlw1PyINUncIrLNIs6p+CCBhoieqj71Ib65SYLXDASZl0ymnLwJ/FFfiLOb5Aw=="
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
