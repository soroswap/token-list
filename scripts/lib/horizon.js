'use strict';
const { Horizon } = require('@stellar/stellar-sdk');
const { TransientError, withRetry } = require('./retry');

// No HTTP status at all means the request never completed (DNS, reset, timeout).
function isTransientHorizonError(error) {
  const status = error && error.response ? error.response.status : undefined;
  if (status === undefined) return true;
  return status === 429 || status >= 500;
}

function callWithRetry(fn, sleep) {
  return withRetry(
    async () => {
      try {
        return await fn();
      } catch (error) {
        if (isTransientHorizonError(error)) {
          throw new TransientError(error.message, { cause: error });
        }
        throw error;
      }
    },
    { sleep },
  );
}

// Thin adapter over Horizon so verification logic can be tested with a fake client.
// Both lookups retry transient failures, then swallow the error and return null;
// callers treat null as "not found". `server` is injectable for tests.
function createHorizonClient(
  horizonUrl,
  { server = new Horizon.Server(horizonUrl), sleep, logError = console.error } = {},
) {
  return {
    server,

    async getIssuerDomain(issuer) {
      try {
        const account = await callWithRetry(() => server.accounts().accountId(issuer).call(), sleep);
        return account.home_domain;
      } catch (err) {
        logError(`Error fetching issuer domain: ${err}`);
        return null;
      }
    },

    async getAssetRecords(code, issuer) {
      try {
        const response = await callWithRetry(
          () => server.assets().forCode(code).forIssuer(issuer).call(),
          sleep,
        );
        return response.records;
      } catch (err) {
        logError(`Error fetching asset records: ${err}`);
        return null;
      }
    },
  };
}

module.exports = { createHorizonClient };
