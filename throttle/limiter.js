'use strict';

const { SlidingWindow } = require('./window');
const { CooldownManager } = require('./cooldown');
const { getThrottleGroup } = require('../classifier/classifier');
const bus = require('../events');

/**
 * Composite Rate Limiter.
 * Manages sliding windows for all rate limit dimensions:
 *   - Global (total sends per hour)
 *   - Per domain (sends per domain per day)
 *   - Per IP (sends per IP per day)
 *   - Per provider (sends per Gmail/Outlook/Yahoo per hour)
 *   - Per second (max SMTP connections per second)
 *
 * Algorithm:
 *   canSend(domain, ip, provider) → check ALL applicable limits
 *   → return { allowed, waitMs, reason } based on the most restrictive limit
 *
 *   recordSend(domain, ip, provider) → add timestamp to all applicable windows
 */
class RateLimiter {
  /**
   * @param {Object} throttleConfig - Throttle config from store
   * @param {Object} [logger]
   */
  constructor(throttleConfig = {}, logger = null) {
    this._config = throttleConfig;
    this._logger = logger;

    // Global window
    this._global = throttleConfig.global
      ? new SlidingWindow(throttleConfig.global.max, throttleConfig.global.per)
      : null;

    // Per-second window
    this._perSecond = throttleConfig.perSecond
      ? new SlidingWindow(throttleConfig.perSecond, 'second')
      : null;

    // Per-domain windows: Map<domain, SlidingWindow>
    this._domainWindows = new Map();
    this._domainLimit = throttleConfig.perDomain || null;

    // Per-IP windows: Map<ip, SlidingWindow>
    this._ipWindows = new Map();
    this._ipLimit = throttleConfig.perIP || null;

    // Per-provider windows: Map<provider, SlidingWindow>
    this._providerWindows = new Map();
    this._providerLimits = throttleConfig.perProvider || {};

    // Cooldown manager
    this._cooldown = new CooldownManager(throttleConfig.cooldown || {}, logger);
  }

  /**
   * Check if a send is allowed given all applicable limits.
   *
   * @param {string} domain - Sending domain
   * @param {string} ip - Sending IP (or null)
   * @param {string} provider - Recipient provider (from classifier)
   * @returns {{ allowed: boolean, waitMs: number, reason: string|null }}
   */
  canSend(domain, ip, provider) {
    // Check cooldown first
    if (this._cooldown.isPaused(domain)) {
      return {
        allowed: false,
        waitMs: this._cooldown.remainingMs(domain),
        reason: `${domain} in cooldown`
      };
    }

    // Check all limits and find the most restrictive
    const checks = [];

    // Global limit
    if (this._global) {
      const result = this._global.check();
      if (!result.allowed) {
        checks.push({ allowed: false, waitMs: result.retryAfterMs, reason: 'global limit reached' });
      }
    }

    // Per-second limit
    if (this._perSecond) {
      const result = this._perSecond.check();
      if (!result.allowed) {
        checks.push({ allowed: false, waitMs: result.retryAfterMs, reason: 'per-second limit reached' });
      }
    }

    // Per-domain limit
    if (this._domainLimit) {
      const window = this._getDomainWindow(domain);
      const result = window.check();
      if (!result.allowed) {
        checks.push({ allowed: false, waitMs: result.retryAfterMs, reason: `domain ${domain} limit reached` });
      }
    }

    // Per-IP limit
    if (this._ipLimit && ip) {
      const window = this._getIPWindow(ip);
      const result = window.check();
      if (!result.allowed) {
        checks.push({ allowed: false, waitMs: result.retryAfterMs, reason: `IP ${ip} limit reached` });
      }
    }

    // Per-provider limit
    if (provider) {
      const throttleGroup = getThrottleGroup(provider);
      const window = this._getProviderWindow(throttleGroup);
      if (window) {
        const result = window.check();
        if (!result.allowed) {
          checks.push({ allowed: false, waitMs: result.retryAfterMs, reason: `${throttleGroup} provider limit reached` });
        }
      }
    }

    // If any check failed, return the one with longest wait
    if (checks.length > 0) {
      const mostRestrictive = checks.reduce((a, b) => a.waitMs >= b.waitMs ? a : b);

      bus.emit('throttle:limit', {
        domain,
        ip,
        provider,
        reason: mostRestrictive.reason,
        waitMs: mostRestrictive.waitMs
      });

      return mostRestrictive;
    }

    return { allowed: true, waitMs: 0, reason: null };
  }

  /**
   * Record a send in all applicable windows.
   *
   * @param {string} domain
   * @param {string} ip
   * @param {string} provider
   */
  recordSend(domain, ip, provider) {
    if (this._global) this._global.record();
    if (this._perSecond) this._perSecond.record();

    if (this._domainLimit) {
      this._getDomainWindow(domain).record();
    }

    if (this._ipLimit && ip) {
      this._getIPWindow(ip).record();
    }

    if (provider) {
      const throttleGroup = getThrottleGroup(provider);
      const window = this._getProviderWindow(throttleGroup);
      if (window) window.record();
    }
  }

  /**
   * Record an error for cooldown tracking.
   * @param {string} domain
   * @returns {boolean} - Whether cooldown was triggered
   */
  recordError(domain) {
    return this._cooldown.recordError(domain);
  }

  /**
   * Get or create a per-domain sliding window.
   */
  _getDomainWindow(domain) {
    if (!this._domainWindows.has(domain)) {
      this._domainWindows.set(domain, new SlidingWindow(
        this._domainLimit.max,
        this._domainLimit.per
      ));
    }
    return this._domainWindows.get(domain);
  }

  /**
   * Get or create a per-IP sliding window.
   */
  _getIPWindow(ip) {
    if (!this._ipWindows.has(ip)) {
      this._ipWindows.set(ip, new SlidingWindow(
        this._ipLimit.max,
        this._ipLimit.per
      ));
    }
    return this._ipWindows.get(ip);
  }

  /**
   * Get or create a per-provider sliding window.
   * Returns null if no limit configured for this provider group.
   */
  _getProviderWindow(group) {
    const limit = this._providerLimits[group] || this._providerLimits.default;
    if (!limit) return null;

    if (!this._providerWindows.has(group)) {
      this._providerWindows.set(group, new SlidingWindow(limit.max, limit.per));
    }
    return this._providerWindows.get(group);
  }

  /**
   * Get current stats for all windows.
   */
  stats() {
    const result = {};

    if (this._global) result.global = { count: this._global.count(), max: this._global.max };

    result.domains = {};
    for (const [domain, window] of this._domainWindows) {
      result.domains[domain] = { count: window.count(), max: window.max };
    }

    result.providers = {};
    for (const [provider, window] of this._providerWindows) {
      result.providers[provider] = { count: window.count(), max: window.max };
    }

    return result;
  }

  /**
   * Clear all windows and cooldowns.
   */
  clear() {
    if (this._global) this._global.reset();
    if (this._perSecond) this._perSecond.reset();
    this._domainWindows.clear();
    this._ipWindows.clear();
    this._providerWindows.clear();
    this._cooldown.clear();
  }
}

module.exports = { RateLimiter };
