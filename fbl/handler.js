'use strict';

const { parse: parseARF } = require('./arf-parser');
const bus = require('../events');

/**
 * Feedback Loop Handler.
 * Processes spam complaints. When a recipient marks an email as spam,
 * captures the complaint, auto-blacklists (via event bus → suppression store),
 * and emits a complaint event.
 */
class FBLHandler {
  /**
   * @param {Object} [options]
   * @param {Object} [options.logger]
   */
  constructor(options = {}) {
    this._logger = options.logger;
    this._stats = { total: 0 };
  }

  /**
   * Process a raw ARF complaint report.
   *
   * @param {string} rawReport - Raw ARF report content
   * @param {Object} [context] - Additional context
   * @returns {Object} - Parsed complaint
   */
  processReport(rawReport, context = {}) {
    const parsed = parseARF(rawReport);
    return this._handleComplaint(parsed, context);
  }

  /**
   * Process a complaint from structured data (e.g., webhook payload).
   *
   * @param {Object} complaint - { email, provider, feedbackType, ... }
   * @returns {Object}
   */
  processComplaint(complaint) {
    return this._handleComplaint(complaint);
  }

  _handleComplaint(complaint, context = {}) {
    this._stats.total++;

    const event = {
      email: complaint.email,
      provider: complaint.reportingDomain || context.provider || 'unknown',
      feedbackType: complaint.feedbackType || 'abuse',
      sourceIP: complaint.sourceIP || null,
      timestamp: Date.now()
    };

    // Emit complaint event — suppression store listens and auto-blacklists
    bus.emit('complained', event);

    if (this._logger) {
      this._logger.warn(`spam complaint received`, {
        email: event.email,
        provider: event.provider
      });
    }

    return event;
  }

  /**
   * Get complaint statistics.
   */
  stats() {
    return { ...this._stats };
  }
}

module.exports = { FBLHandler };
