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
// "[claim](https://evil)" from rendering as a link. `:` stops a bare URL auto-linking and
// `<` stops a mention like <@&id> rendering.
function escapeMarkdown(text) {
  return String(text).replace(/([\\`*_~|<>\[\]()#:-])/g, '\\$1');
}

// The schema allows newlines in names, which would let a token fake extra embed lines.
function inlineText(text) {
  return escapeMarkdown(String(text).replace(/\s+/g, ' ').trim());
}

function buildEmbed(asset, { prUrl } = {}) {
  const symbol = inlineText(asset.code || asset.name);
  const links = [`[Stellar Expert](${explorerUrl(asset)})`];
  if (prUrl) links.push(`[Pull request](${prUrl})`);

  const fields = [{ name: 'Contract', value: `\`${asset.contract}\`` }];
  if (asset.issuer) fields.push({ name: 'Issuer', value: `\`${asset.issuer}\`` });
  // The gate checks `domain` against home_domain only when there is an issuer. Without one
  // it is an unchecked claim, and an official post must not present it as fact.
  if (asset.issuer && asset.domain) {
    fields.push({ name: 'Domain', value: inlineText(asset.domain), inline: true });
  }
  if (asset.decimals != null) fields.push({ name: 'Decimals', value: String(asset.decimals), inline: true });
  fields.push({
    name: 'Type',
    value: asset.issuer ? 'Stellar classic asset' : 'Custom Soroban token',
    inline: true,
  });

  const embed = {
    title: `New token listed: ${symbol}`,
    url: explorerUrl(asset),
    description: `**${inlineText(asset.name)}** by ${inlineText(asset.org)}\n${links.join(' · ')}`,
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

// A missing header must stay undefined: Number(null) is 0, which withRetry would take as
// "retry now" and skip its backoff.
function parseRetryAfterMs(headers) {
  const value = headers && headers.get ? headers.get('Retry-After') : null;
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
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
    throw new TransientError(`Discord webhook answered ${response.status}`, {
      retryAfterMs: parseRetryAfterMs(response.headers),
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
