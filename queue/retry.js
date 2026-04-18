'use strict';

/**
 * Retry scheduling with backoff strategies.
 * Calculates when a failed job should be retried based on
 * attempt count and configured backoff strategy.
 *
 * Strategies:
 *   - fixed: Same delay every time (e.g., 300s, 300s, 300s)
 *   - exponential: Doubles each time with jitter (e.g., 300s, 600s, 1200s)
 *
 * Jitter prevents thundering herd — all retries don't fire at the exact same moment.
 */

/**
 * Calculate the delay before the next retry attempt.
 *
 * @param {number} attempt - Current attempt number (1-based)
 * @param {Object} [options]
 * @param {number} [options.baseDelay=300] - Base delay in seconds
 * @param {string} [options.backoff='exponential'] - 'fixed' | 'exponential'
 * @param {number} [options.maxDelay=3600] - Maximum delay cap in seconds
 * @param {boolean} [options.jitter=true] - Add random jitter
 * @returns {number} - Delay in milliseconds
 */
function calculateDelay(attempt, options = {}) {
  const {
    baseDelay = 300,
    backoff = 'exponential',
    maxDelay = 3600,
    jitter = true
  } = options;

  let delaySec;

  if (backoff === 'exponential') {
    // Exponential: baseDelay * 2^(attempt-1)
    // attempt 1: 300s, attempt 2: 600s, attempt 3: 1200s
    delaySec = baseDelay * Math.pow(2, attempt - 1);
  } else {
    // Fixed: same delay every time
    delaySec = baseDelay;
  }

  // Cap at maxDelay
  delaySec = Math.min(delaySec, maxDelay);

  // Add jitter (±20%) to prevent thundering herd
  if (jitter) {
    const jitterRange = delaySec * 0.2;
    delaySec += (Math.random() * jitterRange * 2) - jitterRange;
  }

  return Math.max(0, Math.round(delaySec * 1000)); // Convert to ms
}

/**
 * Determine if a job should be retried.
 *
 * @param {Object} job - Queue job
 * @param {Error} error - The error that caused the failure
 * @returns {{ shouldRetry: boolean, delayMs: number, reason: string }}
 */
function shouldRetry(job, error) {
  const attempt = (job.attempt || 0) + 1;
  const maxAttempts = job.maxAttempts || 3;

  // Exceeded max attempts
  if (attempt > maxAttempts) {
    return {
      shouldRetry: false,
      delayMs: 0,
      reason: `max attempts reached (${maxAttempts})`
    };
  }

  // Check if error is retryable
  const retryable = error.details?.retryable !== false;
  if (!retryable) {
    return {
      shouldRetry: false,
      delayMs: 0,
      reason: `permanent error: ${error.message}`
    };
  }

  // Calculate delay
  const delayMs = calculateDelay(attempt, {
    baseDelay: job.retryDelay || 300,
    backoff: job.retryBackoff || 'exponential'
  });

  return {
    shouldRetry: true,
    delayMs,
    reason: `retry ${attempt}/${maxAttempts} in ${Math.round(delayMs / 1000)}s`
  };
}

module.exports = { calculateDelay, shouldRetry };
