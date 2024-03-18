const fs = require('fs');
const path = require('path');

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
    } catch (err) {
        console.error(`Error writing file: ${err}`);
    }
}

function processAndSaveTokens(filePath) {
    const tokensData = readJsonFile(filePath);
    if (!tokensData || !tokensData.tokens) {
        console.log("No tokens found or error reading the file.");
        return;
    }

    const tokensDir = path.join(__dirname, '../tokens');
    if (!fs.existsSync(tokensDir)) {
        fs.mkdirSync(tokensDir);
    }

    tokensData.tokens.forEach(token => {
        const tokenFilePath = path.join(tokensDir, `${token.contract}.json`);
        writeJsonFile(tokenFilePath, token);
        console.log(`Token saved to ${tokenFilePath}`);
    });
}

processAndSaveTokens('./tokenList.json');
