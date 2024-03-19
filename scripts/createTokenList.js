const fs = require('fs');
const path = require('path');
const StellarSdk = require('stellar-sdk');

const horizonServer = new StellarSdk.Horizon.Server('https://horizon.stellar.org');
const networkPassphrase = StellarSdk.Networks.PUBLIC

const xlmToken = [{
  "code": "XLM",
  "contract": "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
  "name": "Stellar Lumens",
  "icon": "https://assets.coingecko.com/coins/images/100/standard/Stellar_symbol_black_RGB.png",
  "decimals": 7
}]

function readJsonFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading file from disk: ${err}`);
    return null;
  }
}

function writeJsonFile(filePath, data) {
  try {
    const jsonData = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, jsonData, 'utf8');
    console.log(`Successfully written data to ${filePath}`);
  } catch (err) {
    console.error(`Error writing file: ${err}`);
  }
}

async function getIssuerDomain(issuer) {
  try {
    const accountResponse = await horizonServer.accounts().accountId(issuer).call();
    return accountResponse.home_domain;
  } catch (err) {
    console.error(`Error fetching issuer domain: ${err}`);
    return null;
  }
}

async function getAssetRecords(asset) {
  try {
    const assetsResponse = await horizonServer.assets().forCode(asset.code).forIssuer(asset.issuer).call()
    return assetsResponse.records;
  } catch (err) {
    console.error(`Error fetching asset records: ${err}`);
    return null;
  }
}

async function checkIconUrl(url) {
  try {
      const response = await fetch(url);
      if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
      }
      const contentType = response.headers.get('Content-Type');
      if (!contentType.startsWith('image/')) {
          throw new Error('URL does not point to an image');
      }
      console.log('URL points to a valid image');
  } catch (error) {
      console.error(`Error: ${error.message}`);
      throw error;
  }
}


async function verifyNewTokens(directoryPath, tokenListPath) {
  const existingTokenList = readJsonFile(tokenListPath);
  const existingTokens = existingTokenList ? existingTokenList.tokens.map(token => token.contract) : [];

  const tokensDir = path.join(__dirname, directoryPath);
  const tokenFiles = fs.readdirSync(tokensDir).filter(file => path.extname(file) === '.json');

  const newTokens = await Promise.all(tokenFiles.map(async (file) => {
    const filePath = path.join(tokensDir, file);
    const tokenData = readJsonFile(filePath);

    // Check if the token is already verified
    if (!existingTokens.includes(tokenData.contract)) {
      if (tokenData.issuer) {
        // Checking issuer domain and provided domain
        const issuerDomain = await getIssuerDomain(tokenData.issuer);
        if (issuerDomain !== tokenData.domain) {
          throw new Error(`Domain mismatch for token ${tokenData.code}: expected ${issuerDomain}, got ${tokenData.domain}`);
        }

        // Checking Asset contract address and provided contract address
        const newAsset = new StellarSdk.Asset(tokenData.code, tokenData.issuer)
        const newAssetContract = newAsset.contractId(networkPassphrase)
        if(newAssetContract !== tokenData.contract) {
          throw new Error(`Contract mismatch for token ${tokenData.code}: expected ${newAssetContract}, got ${tokenData.contract}`);
        }

        // Checking if asset exists
        const assetRecords = await getAssetRecords(newAsset)
        if(assetRecords.length <= 0) {
          throw new Error(`Asset has no records or doesnt exists`);
        }
        
      }
      
      // Check if icon exists
      await checkIconUrl(tokenData.icon).catch((error) => {
        throw new Error(`Icon URL is not valid ${tokenData.icon}`)
      })

      // TODO: should check if decimal are Correct
      // TODO: should check if contract exists on soroban

      return tokenData;
    }
  }));

  // Filter out undefined elements (tokens that were already verified)
  const verifiedNewTokens = newTokens.filter(token => token !== undefined);

  if (verifiedNewTokens.length > 0) {
    // Extract the XLM token
    const xlmTokenIndex = existingTokenList.tokens.findIndex(token => token.code === "XLM" && token.contract === "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA");
    let xlmToken = null;
    if (xlmTokenIndex !== -1) {
      xlmToken = existingTokenList.tokens.splice(xlmTokenIndex, 1)[0];
    }
  
    const combinedTokens = [...existingTokenList.tokens, ...verifiedNewTokens];
  
    const sortedTokens = combinedTokens.sort((a, b) => a.contract.localeCompare(b.contract));
  
    if (xlmToken) {
      sortedTokens.unshift(xlmToken);
    }
  
    const updatedTokenList = {
      ...existingTokenList,
      tokens: sortedTokens
    };
  
    writeJsonFile(tokenListPath, updatedTokenList);
  }
}

// Update the paths as needed
verifyNewTokens('../tokens', './tokenList.json');
