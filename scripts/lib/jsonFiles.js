'use strict';
const fs = require('fs');
const path = require('path');

function readJsonFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON from file: ${err.message}. This may be due to incorrect formatting or a syntax error in the JSON data.`,
    );
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Every *.json in a directory as { file, data }. Throws on the first unparsable file so a
// broken submission fails loudly instead of being silently skipped.
function readAssetEntries(assetsDir) {
  return fs
    .readdirSync(assetsDir)
    .filter((file) => path.extname(file) === '.json')
    .map((file) => ({ file, data: readJsonFile(path.join(assetsDir, file)) }));
}

module.exports = { readJsonFile, writeJsonFile, readAssetEntries };
