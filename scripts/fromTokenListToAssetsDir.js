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

function processAndSaveAssets(filePath) {
    const assetsData = readJsonFile(filePath);
    if (!assetsData || !assetsData.assets) {
        console.log("No assets found or error reading the file.");
        return;
    }

    const assetsDir = path.join(__dirname, '../assets');
    if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir);
    }

    assetsData.assets.forEach(asset => {
        const tokenFilePath = path.join(assetsDir, `${asset.contract}.json`);
        writeJsonFile(tokenFilePath, asset);
        console.log(`Asset saved to ${tokenFilePath}`);
    });
}

processAndSaveAssets('./tokenList.json');
