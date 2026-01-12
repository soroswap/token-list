const fs = require("fs");
const path = require("path");
const StellarSdk = require("stellar-sdk");
const Ajv = require("ajv").default;
const addFormats = require("ajv-formats");

const horizonServer = new StellarSdk.Horizon.Server(
  "https://horizon.stellar.org"
);
const networkPassphrase = StellarSdk.Networks.PUBLIC;

const assetSchema = {
  type: "object",
  properties: {
    name: { type: "string", maxLength: 30, minLength: 4 },
    contract: { type: "string", pattern: "^C[A-Z0-9]{55}$" },
    code: { type: "string", pattern: "^[A-Za-z0-9]{1,12}$" },
    issuer: { type: "string", pattern: "^G[A-Z0-9]{55}$" },
    org: { type: "string", maxLength: 30, minLength: 5 },
    domain: {
      type: "string",
      pattern:
        "^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$",
    },
    icon: {
      type: "string",
      oneOf: [{ format: "uri" }, { pattern: "^baf[a-zA-Z0-9]+$" }],
    },
    decimals: { type: "integer", minimum: 0, maximum: 38 },
    comment: { type: "string", maxLength: 150 },
  },
  required: ["name", "org"],
  anyOf: [{ required: ["contract"] }, { required: ["code", "issuer"] }],
  additionalProperties: false,
};

function readJsonFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON from file: ${err.message}. This may be due to incorrect formatting or a syntax error in the JSON data.`
    );
  }
}

async function getIssuerDomain(issuer) {
  try {
    const accountResponse = await horizonServer
      .accounts()
      .accountId(issuer)
      .call();
    return accountResponse.home_domain;
  } catch (err) {
    console.error(`Error fetching issuer domain: ${err}`);
    return null;
  }
}

async function getAssetRecords(asset) {
  try {
    const assetsResponse = await horizonServer
      .assets()
      .forCode(asset.code)
      .forIssuer(asset.issuer)
      .call();
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
    const contentType = response.headers.get("Content-Type");
    if (!contentType.startsWith("image/")) {
      throw new Error("URL does not point to an image");
    }
    console.log("URL points to a valid image");
  } catch (error) {
    console.error(`Error: ${error.message}`);
    throw error;
  }
}

async function verifyNewAssets(directoryPath, assetListPath) {
  const ajv = new Ajv();
  addFormats(ajv);
  const validate = ajv.compile(assetSchema);

  const existingAssetList = readJsonFile(assetListPath);
  // Transform the list into a map for quicker access
  const existingAssetsMap = existingAssetList
    ? existingAssetList.assets.reduce((map, asset) => {
        map[asset.contract] = asset;
        return map;
      }, {})
    : {};

  const assetsDir = path.join(__dirname, directoryPath);
  const assetFiles = fs
    .readdirSync(assetsDir)
    .filter((file) => path.extname(file) === ".json");

  let assetChanges = [];
  let verifiedNewAssets = [];
  let verificationErrors = [];

  for (const file of assetFiles) {
    const filePath = path.join(assetsDir, file);
    const assetData = readJsonFile(filePath);

    // Skip validation for files that couldn't be read properly
    if (!assetData || !validate(assetData)) {
      const errors = JSON.stringify(validate.errors, null, 2);
      verificationErrors.push(`Asset validation failed for ${file}:\n${errors}`);
      continue;
    }

    const existingAsset = existingAssetsMap[assetData.contract];
    if (existingAsset) {
      // Check for any changes if the asset already exists
      const changes = Object.keys(assetData).filter(
        (key) =>
          JSON.stringify(assetData[key]) !== JSON.stringify(existingAsset[key])
      );
      if (changes.length > 0) {
        console.log(
          `Changes detected for asset ${assetData.contract}:`,
          changes
        );
        if (assetData.issuer) {
          try {
            const newAsset = new StellarSdk.Asset(
              assetData.code,
              assetData.issuer
            );
            const newAssetContract = newAsset.contractId(networkPassphrase);
            if (newAssetContract !== assetData.contract) {
              throw new Error(
                `Contract mismatch for asset ${assetData.code}: expected ${newAssetContract}, got ${assetData.contract}`
              );
            }
            const assetRecords = await getAssetRecords(newAsset);
            if (assetRecords.length <= 0) {
              throw new Error(`Asset has no records or doesn't exist`);
            }
            // Check icon validity
            await checkIconUrl(assetData.icon);
          } catch (error) {
            verificationErrors.push(`Verification failed for asset ${file}: ${error.message}`);
          }
        }
        assetChanges.push({ ...assetData });
      }
    } else {
      // New asset, verify it
      let isValid = true;
      if (assetData.issuer) {
        try {
          const issuerDomain = await getIssuerDomain(assetData.issuer);
          if (issuerDomain !== assetData.domain) {
            throw new Error(
              `Domain mismatch for asset ${assetData.code}: expected ${issuerDomain}, got ${assetData.domain}`
            );
          }
          const newAsset = new StellarSdk.Asset(
            assetData.code,
            assetData.issuer
          );
          const newAssetContract = newAsset.contractId(networkPassphrase);
          if (newAssetContract !== assetData.contract) {
            throw new Error(
              `Contract mismatch for asset ${assetData.code}: expected ${newAssetContract}, got ${assetData.contract}`
            );
          }
          const assetRecords = await getAssetRecords(newAsset);
          if (assetRecords.length <= 0) {
            throw new Error(`Asset has no records or doesn't exist`);
          }
          // Check icon validity
          await checkIconUrl(assetData.icon);
        } catch (error) {
          verificationErrors.push(`Verification failed for asset ${file}: ${error.message}`);
          isValid = false;
        }
      }

      if (isValid) {
        verifiedNewAssets.push(assetData);
      }
    }
  }

  if (verifiedNewAssets.length > 0) {
    console.log("Verified new assets:", verifiedNewAssets);
  } else {
    console.log("No new assets were added.");
  }

  if (assetChanges.length > 0) {
    console.log("Detected changes in assets:", assetChanges);
    // Here you can handle the asset changes, e.g., update the asset list file or flag for manual review
  } else {
    console.log("No changes detected in existing assets.");
  }

  // If there are any verification errors, log them and exit with failure
  if (verificationErrors.length > 0) {
    console.error("\n❌ Verification errors found:");
    verificationErrors.forEach((error) => {
      console.error(error);
    });
    process.exit(1);
  }
}

verifyNewAssets("../assets", "./tokenList.json")
  .then(() => {
    console.log("✅ Verification completed successfully");
  })
  .catch((error) => {
    console.error("❌ Verification failed:", error.message);
    process.exit(1);
  });
