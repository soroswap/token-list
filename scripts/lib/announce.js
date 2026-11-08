'use strict';
const { TransientError, withRetry } = require('./retry');

const EXPLORER = 'https://stellar.expert/explorer/public';
const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';
// Discord accepts at most 10 embeds per message.
const MAX_EMBEDS_PER_MESSAGE = 10;
const EMBED_COLOR = 0x8866dd;

// Assets present in `after` whose contract was not in `before`. Edits to an already listed
// token are not announcements, so only membership is compared.
function findNewAssets(before, after) {
  const known = new Set((before && before.assets ? before.assets : []).map((asset) => asset.contract));
  return (after && after.assets ? after.assets : []).filter((asset) => !known.has(asset.contract));
}

// The schema allows a bare IPFS CID as `icon`; Discord needs a URL.
function iconUrl(icon) {
  if (!icon) return undefined;
  return /^https?:\/\//.test(icon) ? icon : `${IPFS_GATEWAY}${icon}`;
}

function explorerUrl(asset) {
  if (asset.code && asset.issuer) return `${EXPLORER}/asset/${asset.code}-${asset.issuer}`;
  return `${EXPLORER}/contract/${asset.contract}`;
}

// Every text field comes from a contributor's PR. Escaping markdown keeps a name like
// "[claim](https://evil)" from rendering as a link in the announcement.
function escapeMarkdown(text) {
  return String(text).replace(/([\\`*_~|>\[\]()#-])/g, '\\$1');
}

function buildEmbed(asset, { prUrl } = {}) {
  const symbol = asset.code || asset.name;
  const links = [`[Stellar Expert](${explorerUrl(asset)})`];
  if (prUrl) links.push(`[Pull request](${prUrl})`);

  const fields = [{ name: 'Contract', value: `\`${asset.contract}\`` }];
  if (asset.issuer) fields.push({ name: 'Issuer', value: `\`${asset.issuer}\`` });
  if (asset.domain) fields.push({ name: 'Domain', value: escapeMarkdown(asset.domain), inline: true });
  fields.push({ name: 'Decimals', value: String(asset.decimals), inline: true });
  fields.push({ name: 'Type', value: asset.issuer ? 'Stellar classic asset' : 'Soroban token', inline: true });

  const embed = {
    title: `New token listed: ${symbol}`,
    url: explorerUrl(asset),
    description: `**${escapeMarkdown(asset.name)}** by ${escapeMarkdown(asset.org)}\n${links.join(' · ')}`,
    color: EMBED_COLOR,
    fields,
    footer: { text: 'Soroswap Token List' },
  };
  const thumbnail = iconUrl(asset.icon);
  if (thumbnail) embed.thumbnail = { url: thumbnail };
  return embed;
}

// One webhook payload per 10 assets. `allowed_mentions` is empty so nothing in a token's
// metadata can ping @everyone or a role.
function buildDiscordPayloads(assets, { prUrl } = {}) {
  const payloads = [];
  for (let i = 0; i < assets.length; i += MAX_EMBEDS_PER_MESSAGE) {
    payloads.push({
      username: 'Soroswap Token List',
      allowed_mentions: { parse: [] },
      embeds: assets.slice(i, i + MAX_EMBEDS_PER_MESSAGE).map((asset) => buildEmbed(asset, { prUrl })),
    });
  }
  return payloads;
}

async function postOnce(webhookUrl, payload, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new TransientError(`Discord webhook request failed: ${error.message}`, { cause: error });
  }
  if (response.ok) return;
  if (response.status === 429 || response.status >= 500) {
    const retryAfter = Number(response.headers && response.headers.get ? response.headers.get('Retry-After') : NaN);
    throw new TransientError(`Discord webhook answered ${response.status}`, {
      retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined,
    });
  }
  throw new Error(`Discord webhook answered ${response.status}`);
}

async function postToDiscord(webhookUrl, payload, { fetchImpl = fetch, sleep } = {}) {
  await withRetry(() => postOnce(webhookUrl, payload, fetchImpl), { attempts: 3, sleep });
}

module.exports = {
  findNewAssets,
  iconUrl,
  explorerUrl,
  escapeMarkdown,
  buildEmbed,
  buildDiscordPayloads,
  postToDiscord,
};
