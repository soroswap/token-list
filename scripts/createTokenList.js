const fs = require('fs');
const path = require('path');
const Ajv = require('ajv').default;
const addFormats = require('ajv-formats');

const assetSchema = {
  "type": "object",
  "properties": {
    "name": { "type": "string", "maxLength": 30, "minLength": 5 },
    "contract": { "type": "string", "pattern": "^C[A-Z0-9]{55}$" },
    "code": { "type": "string", "pattern": "^[A-Za-z0-9]{1,12}$" },
    "issuer": { "type": "string", "pattern": "^G[A-Z0-9]{55}$" },
    "org": { "type": "string", "maxLength": 30, "minLength": 5 },
    "domain": { "type": "string", "pattern": "^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$" },
    "icon": { 
      "type": "string",
      "oneOf": [
        { "format": "uri" },
        { "pattern": "^baf[a-zA-Z0-9]+$" }
      ]
    },
    "decimals": { "type": "integer", "minimum": 0, "maximum": 38 },
    "comment": { "type": "string", "maxLength": 150 }
  },
  "required": ["name", "org"],
  "anyOf": [
    { "required": ["contract"] },
    { "required": ["code", "issuer"] }
  ],
  "additionalProperties": false
};

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

function incrementVersion(version) {
  let [major, minor, patch] = version.split('.').map(num => parseInt(num, 10));

  // Increment version logic
  patch += 1;
  if (patch > 9) {
    patch = 0;
    minor += 1;
    if (minor > 9) {
      minor = 0;
      major += 1;
    }
  }

  major = Math.min(major, 999);

  return `${major}.${minor}.${patch}`;
}


async function mergeAndVerifyAssets(directoryPath, assetListPath) {
  const ajv = new Ajv();
  addFormats(ajv);
  const validate = ajv.compile(assetSchema);

  const existingAssetsList = readJsonFile(assetListPath);
  if (!existingAssetsList || !Array.isArray(existingAssetsList.assets)) {
    console.error(`Existing asset list is invalid or not found at ${assetListPath}`);
    return;
  }

  const existingAssetsMap = existingAssetsList.assets.reduce((map, asset) => {
    map[asset.contract] = asset;
    return map;
  }, {});

  const assetsDir = path.join(__dirname, directoryPath);
  const assetFiles = fs.readdirSync(assetsDir).filter(file => path.extname(file) === '.json');

  let changesDetected = false;

  for (const file of assetFiles) {
    const filePath = path.join(assetsDir, file);
    const assetData = readJsonFile(filePath);
    if (!assetData) continue; // Skip files that couldn't be parsed

    if (!validate(assetData)) {
      console.error(`Asset validation failed for ${file}:`, validate.errors);
      continue; // Skip invalid assets
    }

    const existingAsset = existingAssetsMap[assetData.contract];
    if (existingAsset) {
      // Check for changes if asset already exists
      const hasChanged = Object.keys(assetData).some(key => JSON.stringify(assetData[key]) !== JSON.stringify(existingAsset[key]));
      if (hasChanged) {
        console.log(`Changes detected for asset ${assetData.contract} in file ${file}`);
        changesDetected = true;
        // Update the existing asset with new data
        existingAssetsMap[assetData.contract] = assetData;
      }
    } else {
      // New asset, add to the map
      console.log(`Adding new asset from file ${file}`);
      existingAssetsMap[assetData.contract] = assetData;
      changesDetected = true;
    }
  }

  if (changesDetected) {
    const newVersion = incrementVersion(existingAssetsList.version);

    const updatedAssetsList = {
      ...existingAssetsList,
      version: newVersion,
      assets: Object.values(existingAssetsMap).sort((a, b) => a.contract.localeCompare(b.contract))
    };

    writeJsonFile(assetListPath, updatedAssetsList);
  } else {
    console.log("------------------------------------");
    console.log("No new assets were added or changes detected.");
    console.log("------------------------------------");
  }
}

// Update the paths as needed
mergeAndVerifyAssets('../assets', './tokenList.json');
