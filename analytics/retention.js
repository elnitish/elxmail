'use strict';

/**
 * Analytics retention cleanup.
 * Periodically prunes events older than the configured retention period.
 */
class RetentionManager {
  /**
   * @param {Object} options
   * @param {Object} options.adapter - Analytics adapter instance
   * @param {number} [options.retentionDays=90]
   * @param {Object} [options.logger]
   */
  constructor(options) {
    this._adapter = options.adapter;
    this._retentionDays = options.retentionDays || 90;
    this._logger = options.logger;
    this._timer = null;
  }

  /**
   * Start periodic cleanup (runs daily).
   */
  start() {
    // Run once immediately
    this.cleanup();

    // Then every 24 hours
    this._timer = setInterval(() => this.cleanup(), 24 * 60 * 60 * 1000);
    this._timer.unref();
  }

  /**
   * Stop periodic cleanup.
   */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /**
   * Run cleanup now.
   * @returns {number} - Count of pruned events
   */
  cleanup() {
    const cutoff = Date.now() - (this._retentionDays * 24 * 60 * 60 * 1000);
    const pruned = this._adapter.prune(cutoff);

    if (pruned > 0 && this._logger) {
      this._logger.info(`pruned ${pruned} analytics events older than ${this._retentionDays} days`);
    }

    return pruned;
  }
}

module.exports = { RetentionManager };
