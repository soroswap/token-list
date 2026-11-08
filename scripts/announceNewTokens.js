'use strict';
const { readJsonFile } = require('./lib/jsonFiles');
const { findNewAssets, buildDiscordPayloads, postToDiscord } = require('./lib/announce');

// Usage: node scripts/announceNewTokens.js <tokenList before merge> <tokenList after merge>
// Env: DISCORD_WEBHOOK_URL (skips when unset), PR_URL (optional link in the message).
async function main() {
  const [beforePath, afterPath = './tokenList.json'] = process.argv.slice(2);
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('DISCORD_WEBHOOK_URL is not set, skipping the announcement.');
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

  const prUrl = process.env.PR_URL || undefined;
  for (const payload of buildDiscordPayloads(newAssets, { prUrl })) {
    await postToDiscord(webhookUrl, payload);
  }
  console.log(`Announced ${newAssets.length} new token(s): ${newAssets.map((a) => a.code || a.contract).join(', ')}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
