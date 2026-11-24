'use strict';
const { readJsonFile } = require('./lib/jsonFiles');
const { findNewAssets, findListedAssets, buildDiscordPayloads, postToDiscord } = require('./lib/announce');

// Usage: node scripts/announceNewTokens.js <tokenList before merge> <tokenList after merge>
// Env: DISCORD_WEBHOOK_URL (skips when unset), PR_URL (optional link in the message).
//
// Announcing a listed token again: ANNOUNCE_CONTRACT=<contract> node scripts/announceNewTokens.js
// It posts that one token from ./tokenList.json and ignores the before/after diff.
async function announce(webhookUrl, assets) {
  const prUrl = process.env.PR_URL || undefined;
  for (const payload of buildDiscordPayloads(assets, { prUrl })) {
    await postToDiscord(webhookUrl, payload);
  }
}

async function main() {
  const [beforePath, afterPath = './tokenList.json'] = process.argv.slice(2);
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('DISCORD_WEBHOOK_URL is not set, skipping the announcement.');
    return;
  }
  const contract = process.env.ANNOUNCE_CONTRACT;
  if (contract) {
    const listed = findListedAssets(readJsonFile('./tokenList.json'), contract);
    if (listed.length === 0) {
      console.error(`Contract ${contract} is not in ./tokenList.json`);
      process.exitCode = 1;
      return;
    }
    await announce(webhookUrl, listed);
    console.log(`Announced again: ${listed.map((a) => a.code || a.contract).join(', ')}`);
    return;
  }
  if (!beforePath) {
    console.error('Missing path to the token list before the merge.');
    process.exitCode = 1;
    return;
  }

  const before = readJsonFile(beforePath);
  const after = readJsonFile(afterPath);
  if (!after || !Array.isArray(after.assets)) {
    console.error(`Token list is invalid or not found at ${afterPath}`);
    process.exitCode = 1;
    return;
  }

  const newAssets = findNewAssets(before, after);
  if (newAssets.length === 0) {
    console.log('No new tokens to announce.');
    return;
  }

  await announce(webhookUrl, newAssets);
  console.log(`Announced ${newAssets.length} new token(s): ${newAssets.map((a) => a.code || a.contract).join(', ')}`);
}

// The workflow step is continue-on-error, so the job stays green; the annotation is what
// makes a lost announcement visible.
main().catch((error) => {
  console.log(`::warning title=Discord announcement failed::${error.message}`);
  process.exitCode = 1;
});
