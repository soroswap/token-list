const StellarSdk = require('stellar-sdk');
const tokenList = require('../tokenList.json'); // Adjust the path as needed
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
    async restoreFootprintToContract(contract) {
        try {
            console.log(`Processing contract: ${contract}`);
            const instance = new StellarSdk.Contract(contract).getFootprint();
            let ledgerEntries = await this.server.getLedgerEntries(instance);
            if (ledgerEntries.entries.length === 0) {
                console.log('No footprint found for contract', contract);
                return;
            }

            let currentTtl = ledgerEntries.entries[0].liveUntilLedgerSeq
    
            if (this.latestLedgerSeq > currentTtl) {
                console.log("it should be bumped")
                this.restoreFootprintTransaction(instance);
                // timeout to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 8000));
            }
            else {
                console.log("it should not be bumped")
            }

        } catch (error) {
            console.log('Error restoring footprint', error);
        }

    }

    async restoreFootprintTransaction(instance) {
        try {

            let tx = new StellarSdk.TransactionBuilder(this.account, { fee: 100, networkPassphrase: StellarSdk.Networks.PUBLIC })
            .setSorobanData(
                new StellarSdk.SorobanDataBuilder()
                .setReadWrite([instance])
                .build()
            )
            .addOperation(
                    StellarSdk.Operation.restoreFootprint({})
                ).setTimeout(30).build();
                let preparedTx = await this.server.prepareTransaction(tx);
                preparedTx.sign(this.keypair);
                const txRes = await this.server.sendTransaction(preparedTx);
                console.log('🚀 ~ FootprintRestorer ~ restoreFootprintTransaction ~ txRes:', txRes);
                if (txRes.status === 'ERROR'){
                    const errorResult = txRes.errorResult?._attributes?.result?._switch?.name;
                    if (errorResult === 'txInsufficientBalance') {
                        console.log('Insufficient balance to restore footprint. Please fund the account.');
                        // Perform additional actions here, such as notifying the user or attempting to fund the account
                    } else {
                        console.log('Error restoring footprint transaction', JSON.stringify(txRes,null, 2) );
                    }
                }
                return txRes;
            } catch (error){
                console.log('Error restoring footprint transaction', error);
            }
    }

    async restoreFootprints() {
        for (const asset of tokenList.assets) {
            await this.restoreFootprintToContract(asset.contract);
        }
    }
    printKeypair() {
        console.log('Public Key: ', this.keypair.publicKey());
        console.log('Secret Key: ', this.keypair.secret());
    }
}

async function main()  {

    const privateKey = process.env.PRIVATE_KEY;

    if(!privateKey) {
        console.error('Please provide a private key');
        return;
    }
    if(!rpc) {
        console.error('Please provide a RPC URL');
        return;
    }
    const keypair = StellarSdk.Keypair.fromSecret(privateKey);

    const footprintRestorer = new FootprintRestorer(rpc, keypair);

    await footprintRestorer.setup();

    await footprintRestorer.restoreFootprints();
}
main()