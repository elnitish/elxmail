'use strict';

const { PLANS, getLimit, getDuration } = require('./curves');
const { WarmupTracker } = require('./tracker');
const bus = require('../events');

/**
 * Warm-up Scheduler.
 * Manages gradual ramp-up for new domains.
 * Prevents developers from blasting volume on day 1.
 *
 * Algorithm:
 *   canSend(domain) → get current day in curve → look up day limit
 *   → compare sentToday vs dayLimit → return { allowed, remaining }
 */
class WarmupScheduler {
  /**
   * @param {Object} options
   * @param {Object} options.warmupConfig - Warmup config from store
   * @param {Object[]} options.transports - All transports (to auto-init tracking)
   * @param {Object} [options.logger]
   */
  constructor(options) {
    const { warmupConfig = {}, transports = [], logger } = options;

    this._enabled = warmupConfig.enabled !== false;
    this._logger = logger;

    // Get the curve
    if (warmupConfig.curve && Array.isArray(warmupConfig.curve)) {
      this._curve = warmupConfig.curve;
    } else {
      const planName = warmupConfig.plan || 'default';
      this._curve = PLANS[planName] || PLANS.default;
    }

    this._duration = getDuration(this._curve);

    // Initialize tracker
    this._tracker = new WarmupTracker(warmupConfig.statePath);

    // Auto-initialize tracking for all transports
    const startDates = warmupConfig.startDate || {};
    for (const t of transports) {
      this._tracker.init(t.domain, startDates[t.domain]);
    }
  }

  /**
   * Check if a domain is allowed to send more emails today.
   *
   * @param {string} domain
   * @returns {{ allowed: boolean, remaining: number, dayLimit: number, currentDay: number, warmupComplete: boolean }}
   */
  canSend(domain) {
    if (!this._enabled) {
      return { allowed: true, remaining: Infinity, dayLimit: Infinity, currentDay: 0, warmupComplete: true };
    }

    const currentDay = this._tracker.getCurrentDay(domain);
    const dayLimit = getLimit(this._curve, currentDay);
    const sentToday = this._tracker.getSentToday(domain);
    const remaining = Math.max(0, dayLimit - sentToday);
    const warmupComplete = currentDay >= this._duration;
    const allowed = sentToday < dayLimit;

    if (!allowed) {
      bus.emit('warmup:limit', {
        domain,
        currentDay,
        dayLimit,
        sentToday
      });
    }

    return { allowed, remaining, dayLimit, currentDay, warmupComplete };
  }

  /**
   * Record a send for warm-up tracking.
   * @param {string} domain
   */
  recordSend(domain) {
    if (this._enabled) {
      this._tracker.recordSend(domain);
    }
  }

  /**
   * Get warm-up status for all domains.
   * This is what the developer sees via elxmail.warmup.status()
   */
  status() {
    const states = this._tracker.getAllStates();
    const result = {};

    for (const [domain, state] of Object.entries(states)) {
      const dayLimit = getLimit(this._curve, state.currentDay);
      const warmupComplete = state.currentDay >= this._duration;

      result[domain] = {
        day: state.currentDay,
        currentLimit: dayLimit,
        sent: state.sentToday,
        remaining: Math.max(0, dayLimit - state.sentToday),
        startDate: state.startDate,
        warmupComplete,
        health: state.sentToday <= dayLimit ? 'good' : 'over_limit'
      };
    }

    return result;
  }

  /**
   * Reset all warm-up state.
   */
  reset() {
    this._tracker.reset();
  }
}

module.exports = { WarmupScheduler };
