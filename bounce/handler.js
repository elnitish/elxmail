'use strict';

const { parse } = require('./parser');
const { classify } = require('./classifier');
const bus = require('../events');

/**
 * Main bounce processor.
 * When a bounce is detected:
 *   1. Parse the SMTP response
 *   2. Classify as hard or soft
 *   3. Emit appropriate event
 *   4. Hard bounces auto-feed suppression (via event bus)
 *   5. Soft bounces trigger retry (via queue manager)
 */
class BounceHandler {
  /**
   * @param {Object} [options]
   * @param {Object} [options.logger]
   */
  constructor(options = {}) {
    this._logger = options.logger;
    this._stats = { hard: 0, soft: 0, total: 0 };
  }

  /**
   * Process an SMTP bounce response.
   *
   * @param {string} response - Raw SMTP response string
   * @param {Object} context - { email, domain, ip, messageId }
   * @returns {Object} - Classification result
   */
  process(response, context = {}) {
    const parsed = parse(response);
    const classification = classify(parsed);

    this._stats.total++;

    const event = {
      type: classification.type,
      category: classification.category,
      description: classification.description,
      email: context.email || null,
      domain: context.domain || null,
      ip: context.ip || null,
      messageId: context.messageId || null,
      code: parsed.code,
      enhanced: parsed.enhanced,
      rawResponse: response,
      timestamp: Date.now()
    };

    if (classification.type === 'hard') {
      this._stats.hard++;
      bus.emit('bounce:hard', event);
      bus.emit('bounced', event);

      if (this._logger) {
        this._logger.warn(`hard bounce: ${context.email}`, {
          code: parsed.code,
          category: classification.category,
          domain: context.domain
        });
      }

    } else if (classification.type === 'soft') {
      this._stats.soft++;
      bus.emit('bounce:soft', event);
      bus.emit('bounced', event);

      if (this._logger) {
        this._logger.debug(`soft bounce: ${context.email}`, {
          code: parsed.code,
          category: classification.category,
          domain: context.domain
        });
      }
    }

    return { parsed, classification, event };
  }

  /**
   * Process a transport error as a bounce.
   * Used when SMTP send fails with an error object.
   *
   * @param {Error} err - Transport error
   * @param {Object} context
   */
  processError(err, context = {}) {
    const response = err.details?.response || err.message || '';
    const code = err.details?.responseCode || err.responseCode || 0;

    // Build a synthetic response string
    const syntheticResponse = code ? `${code} ${response}` : response;
    return this.process(syntheticResponse, context);
  }

  /**
   * Get bounce statistics.
   */
  stats() {
    return { ...this._stats };
  }

  /**
   * Reset stats.
   */
  reset() {
    this._stats = { hard: 0, soft: 0, total: 0 };
  }
}

module.exports = { BounceHandler };
