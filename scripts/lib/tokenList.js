'use strict';
const { incrementVersion } = require('./version');

// Keys present in `incoming` whose value differs from `existing`. Keys that exist only in
// `existing` are not reported, so dropping a field from an asset file is not a change.
function detectChangedKeys(incoming, existing) {
  return Object.keys(incoming).filter(
    (key) => JSON.stringify(incoming[key]) !== JSON.stringify(existing[key]),
  );
}

// Pure merge of assets/ entries into the aggregate list. Returns a new list object and
// never mutates its inputs. `assetEntries` is [{ file, data }], `validate` a compiled
// AJV validator. Invalid entries are skipped, not fatal, so the caller must log them.
function mergeAssets(existingList, assetEntries, validate) {
  const list = structuredClone(existingList);
  const existingContracts = new Set(list.assets.map((asset) => asset.contract));
  const contractsInDirectory = new Set();
  const result = { list, added: [], updated: [], removed: [], invalid: [], changesDetected: false };

  for (const { file, data } of assetEntries) {
    if (!data) continue;

    // Registered before validation on purpose: a malformed file must not read as a deletion.
    contractsInDirectory.add(data.contract);

    if (!validate(data)) {
      result.invalid.push({ file, errors: [...(validate.errors || [])] });
      continue;
    }

    const existing = list.assets.find((asset) => asset.contract === data.contract);
    if (existing) {
      if (detectChangedKeys(data, existing).length > 0) {
        // Merge, not replace: fields removed from the file survive in the list.
        Object.assign(existing, data);
        result.updated.push(file);
      }
    } else {
      list.assets.push(data);
      result.added.push(file);
    }
  }

  result.removed = [...existingContracts].filter((contract) => !contractsInDirectory.has(contract));
  if (result.removed.length > 0) {
    list.assets = list.assets.filter((asset) => !result.removed.includes(asset.contract));
  }

  result.changesDetected =
    result.added.length + result.updated.length + result.removed.length > 0;

  if (result.changesDetected) {
    list.version = incrementVersion(list.version);
    list.assets.sort((a, b) => a.contract.localeCompare(b.contract));
  }

  return result;
}

module.exports = { detectChangedKeys, mergeAssets };
