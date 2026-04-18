'use strict';

const bus = require('../events');

/**
 * Error spike detector + auto-pause.
 * Monitors error rates per transport. If errors exceed threshold
 * within the window, pauses that transport for the configured cooldown period.
 *
 * Algorithm:
 *   - Track error timestamps per transport key
 *   - On each error: prune old timestamps, check if count > threshold
 *   - If threshold exceeded: pause transport, set resume timer
 */
class CooldownManager {
  /**
   * @param {Object} config - Cooldown config from store
   * @param {number} config.errorThreshold - Errors within window to trigger (default: 5)
   * @param {number} config.windowSeconds - Window size in seconds (default: 60)
   * @param {number} config.pauseMinutes - Pause duration in minutes (default: 10)
   * @param {Object} [logger]
   */
  constructor(config = {}, logger = null) {
    this._threshold = config.errorThreshold || 5;
    this._windowMs = (config.windowSeconds || 60) * 1000;
    this._pauseMs = (config.pauseMinutes || 10) * 60 * 1000;
    this._logger = logger;

    // Map<transportKey, number[]> — error timestamps
    this._errors = new Map();
    // Map<transportKey, number> — paused until timestamp
    this._paused = new Map();
    // Timers for auto-resume
    this._timers = new Map();
  }

  /**
   * Record an error for a transport.
   * Returns true if the transport is now in cooldown.
   *
   * @param {string} transportKey - Domain or transport identifier
   * @returns {boolean} - Whether cooldown was triggered
   */
  recordError(transportKey) {
    // If already in cooldown, don't accumulate more
    if (this.isPaused(transportKey)) return true;

    if (!this._errors.has(transportKey)) {
      this._errors.set(transportKey, []);
    }

    const errors = this._errors.get(transportKey);
    errors.push(Date.now());

    // Prune old errors
    const cutoff = Date.now() - this._windowMs;
    const pruned = errors.filter(ts => ts >= cutoff);
    this._errors.set(transportKey, pruned);

    // Check threshold
    if (pruned.length >= this._threshold) {
      this._pauseTransport(transportKey);
      return true;
    }

    return false;
  }

  /**
   * Pause a transport for the configured duration.
   */
  _pauseTransport(transportKey) {
    const resumeAt = Date.now() + this._pauseMs;
    this._paused.set(transportKey, resumeAt);
    this._errors.delete(transportKey);

    if (this._logger) {
      this._logger.warn(`cooldown triggered for ${transportKey}`, {
        pauseMinutes: this._pauseMs / 60000,
        resumeAt: new Date(resumeAt).toISOString()
      });
    }

    bus.emit('throttle:cooldown', {
      transport: transportKey,
      pauseMinutes: this._pauseMs / 60000,
      resumeAt
    });

    // Auto-resume timer
    const timer = setTimeout(() => {
      this._paused.delete(transportKey);
      this._timers.delete(transportKey);
      if (this._logger) {
        this._logger.info(`cooldown ended for ${transportKey}`);
      }
    }, this._pauseMs);

    // Don't prevent process exit
    timer.unref();

    if (this._timers.has(transportKey)) {
      clearTimeout(this._timers.get(transportKey));
    }
    this._timers.set(transportKey, timer);
  }

  /**
   * Check if a transport is currently in cooldown.
   * @param {string} transportKey
   * @returns {boolean}
   */
  isPaused(transportKey) {
    if (!this._paused.has(transportKey)) return false;
    const resumeAt = this._paused.get(transportKey);
    if (Date.now() >= resumeAt) {
      this._paused.delete(transportKey);
      return false;
    }
    return true;
  }

  /**
   * Get remaining cooldown time for a transport.
   * @returns {number} - Ms until resume, or 0 if not paused
   */
  remainingMs(transportKey) {
    if (!this.isPaused(transportKey)) return 0;
    return Math.max(0, this._paused.get(transportKey) - Date.now());
  }

  /**
   * Clear all state and timers.
   */
  clear() {
    for (const timer of this._timers.values()) {
      clearTimeout(timer);
    }
    this._errors.clear();
    this._paused.clear();
    this._timers.clear();
  }
}

module.exports = { CooldownManager };
