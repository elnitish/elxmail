'use strict';

const { checkHealth } = require('./health');
const bus = require('../events');

/**
 * Background DNS monitor.
 * Re-runs DNS validation periodically and emits dns:warning events
 * if something changes or breaks.
 */
class DNSMonitor {
  /**
   * @param {Object} options
   * @param {Object[]} options.transports
   * @param {Object} options.dkimConfig
   * @param {number} [options.intervalSeconds=86400] - Check interval (default: 24h)
   * @param {number} [options.timeout=5000]
   * @param {Object} [options.logger]
   */
  constructor(options) {
    this._transports = options.transports;
    this._dkimConfig = options.dkimConfig || {};
    this._interval = (options.intervalSeconds || 86400) * 1000;
    this._timeout = options.timeout || 5000;
    this._logger = options.logger;
    this._timer = null;
    this._lastReport = null;
  }

  /**
   * Start periodic monitoring.
   */
  start() {
    if (this._timer) return;

    this._timer = setInterval(() => this._check(), this._interval);
    this._timer.unref(); // Don't prevent process exit
  }

  /**
   * Stop monitoring.
   */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /**
   * Run a single check and compare with previous results.
   */
  async _check() {
    try {
      const report = await checkHealth(this._transports, this._dkimConfig, this._timeout);

      // Compare with previous report
      if (this._lastReport) {
        for (const [domain, checks] of Object.entries(report.domains)) {
          const prev = this._lastReport.domains[domain];
          if (!prev) continue;

          // Check for status changes
          for (const checkType of ['spf', 'dkim', 'dmarc']) {
            if (checks[checkType].status !== prev[checkType].status) {
              const event = {
                domain,
                check: checkType,
                previousStatus: prev[checkType].status,
                currentStatus: checks[checkType].status,
                message: checks[checkType].message
              };

              if (checks[checkType].status === 'fail') {
                bus.emit('dns:warning', event);
                if (this._logger) {
                  this._logger.warn(`DNS change detected: ${domain} ${checkType} → ${checks[checkType].status}`, event);
                }
              }
            }
          }
        }
      }

      this._lastReport = report;

    } catch (err) {
      if (this._logger) {
        this._logger.error(`DNS monitor check failed: ${err.message}`);
      }
    }
  }
}

module.exports = { DNSMonitor };
