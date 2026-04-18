'use strict';

const bus = require('../events');

/**
 * Auto-slowdown during warm-up.
 * Monitors bounce rate per domain. If bounce rate exceeds threshold
 * in any hour during warm-up, reduces daily limit by 50%.
 *
 * Algorithm:
 *   - Track bounces per domain per hour
 *   - Track total sends per domain per hour
 *   - If bounceRate > 5% in any hour → reduce warmup limit by 50%
 */
class AutoSlowdown {
  /**
   * @param {Object} [options]
   * @param {number} [options.bounceThreshold=0.05] - Bounce rate threshold (5%)
   * @param {Object} [options.logger]
   */
  constructor(options = {}) {
    this._threshold = options.bounceThreshold || 0.05;
    this._logger = options.logger;

    // Map<domain, { sends: number[], bounces: number[], lastReset: number }>
    this._hourlyStats = new Map();

    // Map<domain, number> — reduction factor (0.5 = 50% of original limit)
    this._reductions = new Map();

    // Listen to bounce events
    bus.on('bounce:hard', (event) => this._onBounce(event));
    bus.on('bounce:soft', (event) => this._onBounce(event));
  }

  /**
   * Record a send for tracking.
   * @param {string} domain
   */
  recordSend(domain) {
    this._ensureEntry(domain);
    const stats = this._hourlyStats.get(domain);
    stats.sends++;
  }

  /**
   * Handle a bounce event.
   */
  _onBounce(event) {
    const domain = event.domain;
    if (!domain) return;

    this._ensureEntry(domain);
    const stats = this._hourlyStats.get(domain);
    stats.bounces++;

    // Check rate
    if (stats.sends >= 10) { // Only check after minimum sample size
      const rate = stats.bounces / stats.sends;
      if (rate > this._threshold) {
        this._triggerSlowdown(domain, rate);
      }
    }
  }

  /**
   * Trigger a slowdown for a domain.
   */
  _triggerSlowdown(domain, bounceRate) {
    if (this._reductions.has(domain)) return; // Already slowed down

    this._reductions.set(domain, 0.5); // 50% reduction

    if (this._logger) {
      this._logger.warn(`auto-slowdown triggered for ${domain}`, {
        bounceRate: `${(bounceRate * 100).toFixed(1)}%`,
        reduction: '50%'
      });
    }

    bus.emit('warmup:slowdown', {
      domain,
      bounceRate,
      reductionFactor: 0.5
    });
  }

  /**
   * Get the reduction factor for a domain.
   * Returns 1.0 if no reduction, 0.5 if slowed down.
   * @param {string} domain
   * @returns {number}
   */
  getReduction(domain) {
    return this._reductions.get(domain) || 1.0;
  }

  /**
   * Ensure hourly stats entry exists and is current.
   */
  _ensureEntry(domain) {
    const currentHour = Math.floor(Date.now() / 3600000);
    const entry = this._hourlyStats.get(domain);

    if (!entry || entry.hour !== currentHour) {
      this._hourlyStats.set(domain, { sends: 0, bounces: 0, hour: currentHour });
    }
  }

  /**
   * Clear all state.
   */
  clear() {
    this._hourlyStats.clear();
    this._reductions.clear();
  }
}

module.exports = { AutoSlowdown };
