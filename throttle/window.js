'use strict';

const { unitToMs } = require('../utils/timer');

/**
 * Sliding Window Counter.
 * Tracks send timestamps in an array and counts events within a time window.
 *
 * Algorithm:
 *   - Store timestamps of each event
 *   - On check: filter out timestamps older than window, count remainder
 *   - Allow if count < max
 *   - Periodically prune old timestamps to prevent memory growth
 */
class SlidingWindow {
  /**
   * @param {number} max - Maximum events allowed in the window
   * @param {string} per - Time unit: 'second' | 'minute' | 'hour' | 'day'
   */
  constructor(max, per) {
    this.max = max;
    this.windowMs = unitToMs(per);
    this._timestamps = [];
  }

  /**
   * Check if another event is allowed within the window.
   * @returns {{ allowed: boolean, count: number, remaining: number, retryAfterMs: number }}
   */
  check() {
    this._prune();
    const count = this._timestamps.length;
    const allowed = count < this.max;

    let retryAfterMs = 0;
    if (!allowed && this._timestamps.length > 0) {
      // Time until oldest timestamp exits the window
      retryAfterMs = (this._timestamps[0] + this.windowMs) - Date.now();
      if (retryAfterMs < 0) retryAfterMs = 0;
    }

    return {
      allowed,
      count,
      remaining: Math.max(0, this.max - count),
      retryAfterMs
    };
  }

  /**
   * Record an event (add timestamp).
   */
  record() {
    this._timestamps.push(Date.now());
  }

  /**
   * Remove timestamps outside the window.
   */
  _prune() {
    const cutoff = Date.now() - this.windowMs;
    // Since timestamps are sorted (appended in order), we can binary search
    let lo = 0;
    while (lo < this._timestamps.length && this._timestamps[lo] < cutoff) {
      lo++;
    }
    if (lo > 0) {
      this._timestamps = this._timestamps.slice(lo);
    }
  }

  /**
   * Reset the window.
   */
  reset() {
    this._timestamps = [];
  }

  /**
   * Current event count in window.
   */
  count() {
    this._prune();
    return this._timestamps.length;
  }
}

module.exports = { SlidingWindow };
