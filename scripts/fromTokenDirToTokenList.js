const fs = require('fs');
const path = require('path');

// Function to write a JSON object to a file
function writeJsonFile(filePath, data) {
    try {
        const jsonData = JSON.stringify(data, null, 2); // Beautify the JSON output
        fs.writeFileSync(filePath, jsonData, 'utf8');
        console.log(`Successfully written data to ${filePath}`);
    } catch (err) {
        console.error(`Error writing file: ${err}`);
    }
}

const xlmToken = [{
  "code": "XLM",
  "contract": "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
  "name": "Stellar Lumens",
  "icon": "https://assets.coingecko.com/coins/images/100/standard/Stellar_symbol_black_RGB.png",
  "decimals": 7
}]

// Function to read all token files and generate the tokenList.json
function generateTokenList(directoryPath) {
    const tokensDir = path.join(__dirname, directoryPath);
    const tokenFiles = fs.readdirSync(tokensDir).filter(file => path.extname(file) === '.json');

    const tokens = tokenFiles.map(file => {
        const filePath = path.join(tokensDir, file);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(fileContent);
    });
  
    const currentTimestamp = new Date().toISOString();
  
    const tokenList = {
        name: "Soroswap",
        logoURI: "",
        keywords: ["soroswap", "defi"],
        timestamp: currentTimestamp,
        network: "mainnet",
        tokens: [...xlmToken, ...tokens]
    };

    // Write the combined token list to tokenList.json
    writeJsonFile('./tokenList.json', tokenList);
}

// Example usage:
generateTokenList('../tokens');
