'use strict';

/**
 * Precision timer for rate limiting windows.
 * Uses process.hrtime.bigint() for sub-millisecond accuracy.
 */

/**
 * Get current time in milliseconds with high precision.
 * @returns {number}
 */
function now() {
  return Number(process.hrtime.bigint() / 1000000n);
}

/**
 * Get current timestamp in milliseconds (wall clock).
 * @returns {number}
 */
function timestamp() {
  return Date.now();
}

/**
 * Convert time unit to milliseconds.
 * @param {string} unit - 'second' | 'minute' | 'hour' | 'day'
 * @returns {number}
 */
function unitToMs(unit) {
  switch (unit) {
    case 'second': return 1000;
    case 'minute': return 60 * 1000;
    case 'hour':   return 60 * 60 * 1000;
    case 'day':    return 24 * 60 * 60 * 1000;
    default:       return 60 * 60 * 1000; // default to hour
  }
}

/**
 * Create a simple stopwatch.
 * @returns {{ elapsed: () => number }}
 */
function stopwatch() {
  const start = process.hrtime.bigint();
  return {
    elapsed() {
      return Number((process.hrtime.bigint() - start) / 1000000n);
    }
  };
}

module.exports = { now, timestamp, unitToMs, stopwatch };
