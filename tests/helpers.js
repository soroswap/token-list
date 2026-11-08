'use strict';

// Real USDC values so SAC derivation (Asset.contractId) works offline in tests.
const USDC = Object.freeze({
  name: 'USD Coin',
  code: 'USDC',
  issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  contract: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
  org: 'Centre Consortium LLC',
  domain: 'circle.com',
  icon: 'https://example.com/usdc.png',
  decimals: 7,
});

// A Soroban-only token: no classic code/issuer, so no on-chain checks apply.
const WASM_TOKEN = Object.freeze({
  name: 'Wasm Token',
  contract: 'CBI7UCH5KGSVQRO5H4SUCZUTZABCITZLRHQQZTWL2TK4RZ72TAR6IHRV',
  org: 'Some Org',
  icon: 'https://example.com/wasm.png',
  decimals: 7,
});

function asset(overrides = {}) {
  return { ...USDC, ...overrides };
}

function tokenList(assets, version = '1.5.1') {
  return {
    name: 'Assets curated by Soroswap Protocol',
    provider: 'Soroswap Protocol',
    description: 'The list of assets curated by Soroswap Protocol',
    version,
    feedback: 'https://github.com/soroswap/token-list',
    network: 'mainnet',
    assets,
  };
}

function fakeHorizon({ homeDomain = 'circle.com', records = [{}] } = {}) {
  const calls = [];
  return {
    calls,
    async getIssuerDomain(issuer) {
      calls.push(['getIssuerDomain', issuer]);
      return homeDomain;
    },
    async getAssetRecords(code, issuer) {
      calls.push(['getAssetRecords', code, issuer]);
      return records;
    },
  };
}

function fakeFetch({ ok = true, status = 200, contentType = 'image/png' } = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    return {
      ok,
      status,
      headers: { get: (name) => (name === 'Content-Type' ? contentType : null) },
    };
  };
  fn.calls = calls;
  return fn;
}

function collectLog() {
  const lines = [];
  const log = (...args) => lines.push(args.map(String).join(' '));
  return { lines, log };
}

module.exports = { USDC, WASM_TOKEN, asset, tokenList, fakeHorizon, fakeFetch, collectLog };
