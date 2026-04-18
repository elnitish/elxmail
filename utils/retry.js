'use strict';

/**
 * Generic retry wrapper with fixed or exponential backoff.
 * Used by DNS resolver, SMTP connections, and queue retries.
 */

/**
 * Retry an async function with backoff.
 *
 * @param {Function} fn - Async function to retry
 * @param {Object} options
 * @param {number} options.attempts - Max attempts (default: 3)
 * @param {number} options.delay - Base delay in ms (default: 1000)
 * @param {string} options.backoff - 'fixed' | 'exponential' (default: 'exponential')
 * @param {Function} [options.shouldRetry] - Predicate to decide if error is retryable
 * @returns {Promise<*>} - Result of fn
 */
async function retry(fn, options = {}) {
  const {
    attempts = 3,
    delay = 1000,
    backoff = 'exponential',
    shouldRetry = () => true
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;

      if (attempt >= attempts || !shouldRetry(err)) {
        throw err;
      }

      // Calculate wait time
      const waitMs = backoff === 'exponential'
        ? delay * Math.pow(2, attempt - 1) + Math.random() * 100  // jitter
        : delay;

      await sleep(waitMs);
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { retry, sleep };
