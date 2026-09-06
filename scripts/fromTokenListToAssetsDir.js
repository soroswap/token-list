'use strict';
const fs = require('fs');
const path = require('path');
const { readJsonFile, writeJsonFile } = require('./lib/jsonFiles');

// Reverse of the merge: explodes tokenList.json back into one assets/<CONTRACT>.json per token.
function processAndSaveAssets(filePath) {
  const assetsData = readJsonFile(filePath);
  if (!assetsData || !assetsData.assets) {
    console.log('No assets found or error reading the file.');
    return;
  }

  const assetsDir = path.join(__dirname, '../assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir);
  }

  assetsData.assets.forEach((asset) => {
    const tokenFilePath = path.join(assetsDir, `${asset.contract}.json`);
    writeJsonFile(tokenFilePath, asset);
    console.log(`Asset saved to ${tokenFilePath}`);
  });
}

processAndSaveAssets('./tokenList.json');
