'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  findNewAssets,
  findListedAssets,
  iconUrl,
  thumbnailUrl,
  explorerUrl,
  escapeMarkdown,
  buildEmbed,
  buildDiscordPayloads,
  postToDiscord,
} = require('../scripts/lib/announce');
const { asset, WASM_TOKEN, tokenList } = require('./helpers');

test('findNewAssets returns only contracts missing from the previous list', () => {
  const before = tokenList([asset()]);
  const after = tokenList([asset(), { ...WASM_TOKEN }]);
  assert.deepEqual(findNewAssets(before, after), [WASM_TOKEN]);
});

test('findNewAssets ignores edits to an already listed token', () => {
  const before = tokenList([asset()]);
  const after = tokenList([asset({ icon: 'https://example.com/new.png' })]);
  assert.deepEqual(findNewAssets(before, after), []);
});

test('findListedAssets returns the listed token with that contract', () => {
  const list = tokenList([asset(), { ...WASM_TOKEN }]);
  assert.deepEqual(findListedAssets(list, WASM_TOKEN.contract), [WASM_TOKEN]);
});

test('findListedAssets returns nothing for a contract that is not listed', () => {
  assert.deepEqual(findListedAssets(tokenList([asset()]), WASM_TOKEN.contract), []);
  assert.deepEqual(findListedAssets(null, WASM_TOKEN.contract), []);
});

test('thumbnailUrl routes an SVG icon through the PNG proxy', () => {
  assert.equal(
    thumbnailUrl('https://example.com/icons/token.svg'),
    'https://wsrv.nl/?url=https%3A%2F%2Fexample.com%2Ficons%2Ftoken.svg&output=png&w=256&h=256&bg=white&mask=circle',
  );
  assert.match(thumbnailUrl('https://example.com/TOKEN.SVG?v=2'), /^https:\/\/wsrv\.nl\/\?url=/);
});

test('thumbnailUrl leaves raster icons, CIDs and a missing icon as iconUrl gives them', () => {
  assert.equal(thumbnailUrl('https://example.com/a.png'), 'https://example.com/a.png');
  assert.equal(thumbnailUrl('https://example.com/svg/a.png'), 'https://example.com/svg/a.png');
  assert.equal(thumbnailUrl('bafkreiabc'), 'https://ipfs.io/ipfs/bafkreiabc');
  assert.equal(thumbnailUrl(undefined), undefined);
});

test('buildEmbed uses the proxied PNG as thumbnail for an SVG icon', () => {
  const embed = buildEmbed({ ...WASM_TOKEN, icon: 'https://example.com/token.svg' });
  assert.match(embed.thumbnail.url, /^https:\/\/wsrv\.nl\/\?url=.*output=png/);
});

test('findNewAssets treats a missing previous list as empty', () => {
  assert.equal(findNewAssets(null, tokenList([asset()])).length, 1);
});

test('iconUrl keeps http URLs and turns a bare CID into a gateway URL', () => {
  assert.equal(iconUrl('https://example.com/a.png'), 'https://example.com/a.png');
  assert.equal(iconUrl('bafkreiabc'), 'https://ipfs.io/ipfs/bafkreiabc');
  assert.equal(iconUrl(undefined), undefined);
});

test('explorerUrl links classic assets by code-issuer and Soroban tokens by contract', () => {
  assert.equal(
    explorerUrl(asset()),
    'https://stellar.expert/explorer/public/asset/USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  );
  assert.equal(explorerUrl(WASM_TOKEN), `https://stellar.expert/explorer/public/contract/${WASM_TOKEN.contract}`);
});

test('escapeMarkdown neutralises links and formatting from contributor metadata', () => {
  assert.equal(escapeMarkdown('[claim](https://evil)'), '\\[claim\\]\\(https\\://evil\\)');
  assert.equal(escapeMarkdown('**bold**'), '\\*\\*bold\\*\\*');
});

test('escapeMarkdown stops bare URLs auto-linking and mentions rendering', () => {
  assert.equal(escapeMarkdown('https://evil.co/claim'), 'https\\://evil.co/claim');
  assert.equal(escapeMarkdown('<@&123456>'), '\\<@&123456\\>');
});

test('buildEmbed escapes a contributor name used as the title', () => {
  const embed = buildEmbed({ ...WASM_TOKEN, name: '**x** https://evil.co' });
  assert.equal(embed.title, 'New token listed: \\*\\*x\\*\\* https\\://evil.co');
});

test('buildEmbed collapses newlines so a name cannot fake extra lines', () => {
  const embed = buildEmbed({ ...WASM_TOKEN, name: 'USDC\nVerified by Soroswap' });
  assert.ok(embed.description.startsWith('**USDC Verified by Soroswap** by '));
  assert.equal(embed.title, 'New token listed: USDC Verified by Soroswap');
});

// The gate only checks home_domain for tokens with an issuer, so anything else is a claim.
test('buildEmbed hides an unverifiable domain and flags a token with no issuer', () => {
  const embed = buildEmbed({ ...WASM_TOKEN, code: 'USDC', domain: 'circle.com' });
  assert.ok(!embed.fields.some((field) => field.name === 'Domain'));
  assert.equal(embed.fields.at(-1).value, 'Custom Soroban token');
});

test('buildEmbed omits decimals when the asset does not declare them', () => {
  const { decimals, ...withoutDecimals } = WASM_TOKEN;
  const embed = buildEmbed(withoutDecimals);
  assert.ok(!embed.fields.some((field) => field.name === 'Decimals'));
});

test('buildEmbed keeps decimals of zero', () => {
  const embed = buildEmbed({ ...WASM_TOKEN, decimals: 0 });
  assert.equal(embed.fields.find((field) => field.name === 'Decimals').value, '0');
});

test('buildEmbed carries contract, issuer, links and icon for a classic asset', () => {
  const embed = buildEmbed(asset(), { prUrl: 'https://github.com/soroswap/token-list/pull/1' });
  assert.equal(embed.title, 'New token listed: USDC');
  assert.equal(embed.thumbnail.url, 'https://example.com/usdc.png');
  assert.match(embed.description, /\[Pull request\]\(https:\/\/github.com\/soroswap\/token-list\/pull\/1\)/);
  const names = embed.fields.map((field) => field.name);
  assert.deepEqual(names, ['Contract', 'Issuer', 'Domain', 'Decimals', 'Type']);
  assert.equal(embed.fields.at(-1).value, 'Stellar classic asset');
});

test('buildEmbed falls back to the name and skips the issuer for a Soroban token', () => {
  const embed = buildEmbed({ ...WASM_TOKEN });
  assert.equal(embed.title, 'New token listed: Wasm Token');
  assert.ok(!embed.fields.some((field) => field.name === 'Issuer'));
  assert.ok(!embed.description.includes('Pull request'));
  assert.equal(embed.fields.at(-1).value, 'Custom Soroban token');
});

test('buildDiscordPayloads splits into messages of at most 10 embeds and disables mentions', () => {
  const assets = Array.from({ length: 12 }, (_, i) => ({ ...WASM_TOKEN, contract: `C${i}` }));
  const payloads = buildDiscordPayloads(assets);
  assert.deepEqual(payloads.map((p) => p.embeds.length), [10, 2]);
  payloads.forEach((p) => assert.deepEqual(p.allowed_mentions, { parse: [] }));
});

function fakeResponse(status, retryAfter) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name === 'Retry-After' ? retryAfter : null) },
  };
}

test('postToDiscord sends the payload as JSON', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return fakeResponse(204);
  };
  await postToDiscord('https://discord.test/hook', { embeds: [] }, { fetchImpl });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), { embeds: [] });
});

test('postToDiscord retries on 429 and honours Retry-After', async () => {
  const statuses = [429, 204];
  const waits = [];
  const fetchImpl = async () => fakeResponse(statuses.shift(), '2');
  await postToDiscord('https://discord.test/hook', {}, { fetchImpl, sleep: async (ms) => waits.push(ms) });
  assert.deepEqual(waits, [2000]);
});

test('postToDiscord backs off when a failure has no Retry-After', async () => {
  const statuses = [502, 502, 204];
  const waits = [];
  const fetchImpl = async () => fakeResponse(statuses.shift(), null);
  await postToDiscord('https://discord.test/hook', {}, { fetchImpl, sleep: async (ms) => waits.push(ms) });
  assert.deepEqual(waits, [1000, 2000]);
});

test('postToDiscord fails at once on a client error', async () => {
  let count = 0;
  const fetchImpl = async () => {
    count += 1;
    return fakeResponse(404);
  };
  await assert.rejects(postToDiscord('https://discord.test/hook', {}, { fetchImpl, sleep: async () => {} }), /404/);
  assert.equal(count, 1);
});
