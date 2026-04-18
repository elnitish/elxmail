'use strict';

const { RoundRobin } = require('./strategies/round-robin');
const { Weighted } = require('./strategies/weighted');
const { Random } = require('./strategies/random');
const { RotationState } = require('./state');
const { ElxRotationError } = require('../errors');

/**
 * Rotation Engine.
 * Picks which domain and IP to use for each email.
 *
 * Algorithm:
 *   1. Get all transports
 *   2. Filter out paused (cooldown) transports
 *   3. Filter out transports that hit throttle limits
 *   4. Filter out transports that hit warmup limits
 *   5. Apply rotation strategy to remaining pool
 *   6. Return selected transport
 *
 * If no transports available, returns null with retry-after time.
 *
 * Supports sticky provider mapping: same recipient provider always
 * gets the same sending domain for consistency.
 */
class RotationEngine {
  /**
   * @param {Object} options
   * @param {Object[]} options.transports - All configured transports
   * @param {Object} options.rotationConfig - Rotation config from store
   * @param {Object} [options.throttle] - RateLimiter instance (for checking limits)
   * @param {Object} [options.warmup] - WarmupScheduler instance (for checking limits)
   * @param {Object} [options.logger]
   */
  constructor(options) {
    const { transports, rotationConfig = {}, throttle, warmup, logger } = options;

    this._transports = transports;
    this._throttle = throttle;
    this._warmup = warmup;
    this._logger = logger;
    this._stickyProvider = rotationConfig.stickyProvider || false;
    this._state = new RotationState();

    // Initialize strategy
    const strategyName = rotationConfig.strategy || 'round-robin';
    switch (strategyName) {
      case 'weighted':
        this._strategy = new Weighted(rotationConfig.weights || {});
        break;
      case 'random':
        this._strategy = new Random();
        break;
      case 'round-robin':
      default:
        this._strategy = new RoundRobin();
        break;
    }

    // Sticky mapping cache: Map<providerGroup, domain>
    this._stickyMap = new Map();
  }

  /**
   * Pick the best transport for sending an email.
   *
   * @param {string} provider - Recipient provider (from classifier)
   * @returns {{ transport: Object|null, retryAfterMs: number }}
   */
  pick(provider) {
    // Sticky provider mapping
    if (this._stickyProvider && provider) {
      const stickyDomain = this._stickyMap.get(provider);
      if (stickyDomain) {
        const transport = this._transports.find(t => t.domain === stickyDomain);
        if (transport && this._isAvailable(transport, provider)) {
          return { transport, retryAfterMs: 0 };
        }
        // Sticky transport not available — fall through to normal selection
      }
    }

    // Filter to available transports
    const available = this._transports.filter(t => this._isAvailable(t, provider));

    if (available.length === 0) {
      // Find the shortest wait time across all transports
      let minWait = Infinity;
      for (const t of this._transports) {
        const waitMs = this._getWaitMs(t, provider);
        if (waitMs < minWait) minWait = waitMs;
      }

      if (this._logger) {
        this._logger.debug('no transports available', { retryAfterMs: minWait });
      }

      return { transport: null, retryAfterMs: minWait === Infinity ? 60000 : minWait };
    }

    // Apply strategy
    const transport = this._strategy.pick(available);

    // Update sticky mapping
    if (this._stickyProvider && provider && transport) {
      this._stickyMap.set(provider, transport.domain);
    }

    // Record in state
    if (transport) {
      this._state.record(transport.domain);
    }

    return { transport, retryAfterMs: 0 };
  }

  /**
   * Check if a transport is available (not paused, not maxed).
   */
  _isAvailable(transport, provider) {
    // Check throttle (if available)
    if (this._throttle) {
      const ip = transport.bindIP || null;
      const result = this._throttle.canSend(transport.domain, ip, provider);
      if (!result.allowed) return false;
    }

    // Check warmup (if available)
    if (this._warmup) {
      const result = this._warmup.canSend(transport.domain);
      if (!result.allowed) return false;
    }

    return true;
  }

  /**
   * Get wait time for a transport to become available.
   */
  _getWaitMs(transport, provider) {
    if (this._throttle) {
      const ip = transport.bindIP || null;
      const result = this._throttle.canSend(transport.domain, ip, provider);
      if (!result.allowed) return result.waitMs;
    }
    return 0;
  }

  /**
   * Record a successful send (for state tracking).
   */
  recordSend(domain) {
    this._state.record(domain);
  }

  /**
   * Get rotation stats.
   */
  stats() {
    const stats = {};
    for (const t of this._transports) {
      stats[t.domain] = {
        sendCount: this._state.getCount(t.domain)
      };
    }
    return stats;
  }

  /**
   * Reset rotation state.
   */
  reset() {
    this._state.reset();
    this._stickyMap.clear();
    if (this._strategy.reset) this._strategy.reset();
  }
}

module.exports = { RotationEngine };
