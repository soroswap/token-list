'use strict';

// Marks a failure worth retrying: rate limiting, a gateway timeout, a dropped connection.
// `retryAfterMs` carries the server's own hint when it gave one.
class TransientError extends Error {
  constructor(message, { retryAfterMs, cause } = {}) {
    super(message);
    this.name = 'TransientError';
    this.transient = true;
    this.retryAfterMs = retryAfterMs;
    if (cause) this.cause = cause;
  }
}

function isTransient(error) {
  return Boolean(error && error.transient);
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Exponential backoff, capped. A Retry-After longer than `maxDelayMs` is treated as a
// definitive failure rather than a wait: ipfs.io answers 429 with Retry-After 900s, and a
// CI job cannot sit on that.
async function withRetry(
  fn,
  { attempts = 3, baseDelayMs = 1000, maxDelayMs = 10000, sleep = defaultSleep } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === attempts) throw error;
      const delay = error.retryAfterMs != null ? error.retryAfterMs : baseDelayMs * 2 ** (attempt - 1);
      if (delay > maxDelayMs) throw error;
      await sleep(delay);
    }
  }
  throw lastError;
}

module.exports = { TransientError, isTransient, withRetry };
