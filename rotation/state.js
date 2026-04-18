'use strict';

/**
 * Rotation state tracker.
 * Tracks send counts per transport per time window.
 * Used by the rotation engine to check utilization before picking.
 */
class RotationState {
  constructor() {
    // Map<domain, { count: number, lastReset: number }>
    this._daily = new Map();
  }

  /**
   * Record a send for a transport domain.
   * @param {string} domain
   */
  record(domain) {
    this._ensureEntry(domain);
    this._daily.get(domain).count++;
  }

  /**
   * Get send count for today.
   * @param {string} domain
   * @returns {number}
   */
  getCount(domain) {
    this._ensureEntry(domain);
    return this._daily.get(domain).count;
  }

  /**
   * Ensure a domain entry exists and is for today.
   */
  _ensureEntry(domain) {
    const today = new Date().toDateString();
    const entry = this._daily.get(domain);

    if (!entry || entry.day !== today) {
      this._daily.set(domain, { count: 0, day: today });
    }
  }

  /**
   * Reset all counts.
   */
  reset() {
    this._daily.clear();
  }
}

module.exports = { RotationState };
