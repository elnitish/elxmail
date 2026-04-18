'use strict';

const { MemorySuppressionAdapter } = require('./adapters/memory');
const { normalize } = require('../utils/email-parser');
const bus = require('../events');

/**
 * Suppression Store — main interface.
 * Persistent blacklist of emails that should never be contacted.
 * Every email passes through check() before entering the queue.
 *
 * Auto-subscribes to bounce and complaint events to self-populate:
 *   - Hard bounces → immediately suppressed
 *   - Complaints → immediately suppressed
 *   - Soft bounces → suppressed after N occurrences (configurable)
 */
class SuppressionStore {
  /**
   * @param {Object} options
   * @param {Object} options.suppressionConfig - Suppression config from store
   * @param {Object} [options.logger]
   */
  constructor(options = {}) {
    const { suppressionConfig = {}, logger } = options;

    this._logger = logger;
    this._autoSuppress = suppressionConfig.autoSuppress || {};

    // Initialize adapter
    const adapterType = suppressionConfig.adapter || 'memory';
    switch (adapterType) {
      case 'sqlite': {
        const { SQLiteSuppressionAdapter } = require('./adapters/sqlite');
        this._adapter = new SQLiteSuppressionAdapter(suppressionConfig.path);
        break;
      }
      case 'memory':
      default:
        this._adapter = new MemorySuppressionAdapter();
        break;
    }

    // Soft bounce counter: Map<email, count>
    this._softBounceCount = new Map();
    this._softBounceLimit = this._autoSuppress.softBounceAfter || 3;

    // Subscribe to events for auto-suppression
    this._setupAutoSuppression();
  }

  /**
   * Check if an email is suppressed. Must be sub-millisecond.
   * @param {string} email
   * @returns {boolean}
   */
  check(email) {
    return this._adapter.check(normalize(email));
  }

  /**
   * Add an email to the suppression list.
   * @param {string} email
   * @param {string} [reason='manual']
   */
  add(email, reason = 'manual') {
    const normalized = normalize(email);
    if (this._adapter.check(normalized)) return; // Already suppressed

    this._adapter.add(normalized, reason);

    if (this._logger) {
      this._logger.debug(`suppressed: ${normalized}`, { reason });
    }
  }

  /**
   * Remove an email from suppression.
   * @param {string} email
   */
  remove(email) {
    this._adapter.remove(normalize(email));
  }

  /**
   * Import a list of emails.
   * @param {string[]} emails
   * @param {string} [reason='import']
   */
  import(emails, reason = 'import') {
    const normalized = emails.map(e => normalize(e));
    this._adapter.import(normalized, reason);

    if (this._logger) {
      this._logger.info(`imported ${normalized.length} suppressions`, { reason });
    }
  }

  /**
   * Export all suppressed emails.
   * @returns {Array}
   */
  export() {
    return this._adapter.export();
  }

  /**
   * Get the count of suppressed emails.
   * @returns {number}
   */
  size() {
    return this._adapter.size();
  }

  /**
   * Set up auto-suppression from event bus.
   */
  _setupAutoSuppression() {
    // Hard bounces → suppress immediately
    if (this._autoSuppress.hardBounce !== false) {
      bus.on('bounce:hard', (event) => {
        if (event.email) {
          this.add(event.email, 'hard_bounce');
        }
      });
    }

    // Complaints → suppress immediately
    if (this._autoSuppress.complaint !== false) {
      bus.on('complained', (event) => {
        if (event.email) {
          this.add(event.email, 'complaint');
        }
      });
    }

    // Soft bounces → suppress after N occurrences
    if (this._softBounceLimit > 0) {
      bus.on('bounce:soft', (event) => {
        if (!event.email) return;
        const email = normalize(event.email);
        const count = (this._softBounceCount.get(email) || 0) + 1;
        this._softBounceCount.set(email, count);

        if (count >= this._softBounceLimit) {
          this.add(email, `soft_bounce_x${count}`);
          this._softBounceCount.delete(email);
        }
      });
    }
  }

  /**
   * Clear all data.
   */
  clear() {
    this._adapter.clear();
    this._softBounceCount.clear();
  }
}

module.exports = { SuppressionStore };
