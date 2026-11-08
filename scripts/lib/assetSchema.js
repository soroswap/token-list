'use strict';
const Ajv = require('ajv').default;
const addFormats = require('ajv-formats');

// Single source of truth for the asset shape. The PR gate (verifyTokens) and the
// merge step (createTokenList) must agree, so both import this instead of carrying copies.
const assetSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', maxLength: 30, minLength: 1 },
    contract: { type: 'string', pattern: '^C[A-Z0-9]{55}$' },
    code: { type: 'string', pattern: '^[A-Za-z0-9]{1,12}$' },
    issuer: { type: 'string', pattern: '^G[A-Z0-9]{55}$' },
    org: { type: 'string', maxLength: 30, minLength: 5 },
    domain: {
      type: 'string',
      pattern: '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$',
    },
    icon: {
      type: 'string',
      oneOf: [{ format: 'uri' }, { pattern: '^baf[a-zA-Z0-9]+$' }],
    },
    decimals: { type: 'integer', minimum: 0, maximum: 38 },
    comment: { type: 'string', maxLength: 150 },
  },
  required: ['name', 'org'],
  anyOf: [{ required: ['contract'] }, { required: ['code', 'issuer'] }],
  additionalProperties: false,
};

function createAssetValidator() {
  const ajv = new Ajv();
  addFormats(ajv);
  return ajv.compile(assetSchema);
}

module.exports = { assetSchema, createAssetValidator };
