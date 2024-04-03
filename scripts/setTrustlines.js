const fs = require('fs');
const StellarSdk = require('stellar-sdk');
const trustlinesWalletSecretKey = process.argv[2];

const assetsList = readJsonFile('./tokenList.json');

const horizonServer = new StellarSdk.Horizon.Server('https://horizon.stellar.org');
const networkPassphrase = StellarSdk.Networks.PUBLIC;

const publicKey = StellarSdk.Keypair.fromSecret(trustlinesWalletSecretKey).publicKey();

const MAX_TRIES = 3;
const INITIAL_FEE = 100;

function readJsonFile(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error(`Error reading file from disk: ${err}`);
        return null;
    }
}

async function seeTrustlines() {
    const source = await horizonServer.loadAccount(publicKey);
    const trustedAssets = [];
    const untrustedAssets = [];
    for (const asset of assetsList.assets) {
        const trustlineExists = source.balances.some((balance) => {
            return (
                (balance.asset_type === 'credit_alphanum4' || 
                balance.asset_type === 'credit_alphanum12')
                &&
                balance.asset_code === asset.code &&
                balance.asset_issuer === asset.issuer
            );
        });
        if (!trustlineExists) {
            untrustedAssets.push(asset);
        } else {
            trustedAssets.push(asset);
        }
    }
    return {trustedAssets, untrustedAssets};
}

async function setTrustline(tokenSymbol, tokenIssuer, tries = 1) {
    const source = await horizonServer.loadAccount(publicKey);
    const operation = StellarSdk.Operation.changeTrust({
        source: source.accountId(),
        asset: new StellarSdk.Asset(tokenSymbol, tokenIssuer),
    });
    const txn = new StellarSdk.TransactionBuilder(source, {
        fee: Number(INITIAL_FEE * tries).toString(),
        timebounds: { minTime: 0, maxTime: 0 },
        networkPassphrase: networkPassphrase,
    })
        .addOperation(operation)
        .setTimeout(StellarSdk.TimeoutInfinite)
        .build();

    const keyPair = StellarSdk.Keypair.fromSecret(trustlinesWalletSecretKey);
    txn.sign(keyPair);

    try {
        let response = await horizonServer.submitTransaction(txn);
        console.log('Trustline set for ', tokenSymbol);
        return response;
    } catch (error) {
        if (tries < MAX_TRIES) {
        console.log('Error trying to set trustline for ', tokenSymbol);
        console.log(error);
        console.log('Retrying...');
        await setTrustline(tokenSymbol, tokenIssuer, tries + 1);
        } else {
        console.log('Max tries reached for ', tokenSymbol), '. Unable to set trustline.';
        console.log(error);
        }
    }
}
  
async function main() {
    const {trustedAssets, untrustedAssets} = await seeTrustlines();
    console.log('Trusted Assets: ', trustedAssets.length);
    console.log('Untrusted Assets: ', untrustedAssets.length);
    if (untrustedAssets.length == 0){
        console.log('No new trustlines needed');
        process.exit(0);
    } else {
        for (const asset of untrustedAssets) {
            await setTrustline(asset.code, asset.issuer);
        }
    }
}

if(assetsList.assets.length == 0){
    console.error('No assets found in tokenList.json');
    process.exit(1);
}

main()
    .then(() => {
        console.log('Trustlines set successfully');
    })
    .catch((error) => {
        console.error('Error setting trustlines: ', error);
    });