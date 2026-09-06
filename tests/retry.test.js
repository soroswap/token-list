'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { withRetry, TransientError } = require('../scripts/lib/retry');

function sleeper() {
  const delays = [];
  return { delays, sleep: async (ms) => { delays.push(ms); } };
}

test('returns the result when the first attempt succeeds without sleeping', async () => {
  const { delays, sleep } = sleeper();
  const result = await withRetry(async () => 'ok', { attempts: 3, sleep });

  assert.equal(result, 'ok');
  assert.deepEqual(delays, []);
});

test('retries a transient error and returns the eventual success', async () => {
  const { delays, sleep } = sleeper();
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw new TransientError('busy');
      return 'ok';
    },
    { attempts: 3, sleep, baseDelayMs: 100 },
  );

  assert.equal(result, 'ok');
  assert.equal(calls, 3);
  assert.deepEqual(delays, [100, 200]);
});

test('gives up after the configured attempts and rethrows the last error', async () => {
  const { sleep } = sleeper();
  let calls = 0;
  await assert.rejects(
    () => withRetry(async () => { calls += 1; throw new TransientError('still busy'); }, { attempts: 3, sleep }),
    /still busy/,
  );
  assert.equal(calls, 3);
});

test('does not retry a non-transient error', async () => {
  const { delays, sleep } = sleeper();
  let calls = 0;
  await assert.rejects(
    () => withRetry(async () => { calls += 1; throw new Error('broken'); }, { attempts: 3, sleep }),
    /broken/,
  );
  assert.equal(calls, 1);
  assert.deepEqual(delays, []);
});

test('honors a short Retry-After hint instead of the backoff delay', async () => {
  const { delays, sleep } = sleeper();
  let calls = 0;
  await withRetry(
    async () => {
      calls += 1;
      if (calls === 1) throw new TransientError('slow down', { retryAfterMs: 2500 });
      return 'ok';
    },
    { attempts: 3, sleep, baseDelayMs: 100 },
  );

  assert.deepEqual(delays, [2500]);
});

test('stops early when Retry-After is longer than the wait cap', async () => {
  const { delays, sleep } = sleeper();
  let calls = 0;
  await assert.rejects(
    () => withRetry(
      async () => { calls += 1; throw new TransientError('rate limited', { retryAfterMs: 900000 }); },
      { attempts: 3, sleep, maxDelayMs: 10000 },
    ),
    /rate limited/,
  );
  assert.equal(calls, 1);
  assert.deepEqual(delays, []);
});
