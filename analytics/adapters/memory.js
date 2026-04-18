'use strict';

/**
 * In-memory analytics storage.
 * Stores events in arrays indexed by type.
 * For development and small volumes.
 */
class MemoryAnalyticsAdapter {
  constructor() {
    this._events = []; // All events in chronological order
  }

  /**
   * Store an analytics event.
   * @param {Object} event - { type, email, domain, ip, provider, messageId, timestamp, ... }
   */
  store(event) {
    this._events.push({
      ...event,
      timestamp: event.timestamp || Date.now()
    });
  }

  /**
   * Query events by type and time range.
   * @param {Object} [opts]
   * @param {string} [opts.type] - Event type filter
   * @param {string} [opts.domain] - Domain filter
   * @param {string} [opts.provider] - Provider filter
   * @param {string} [opts.ip] - IP filter
   * @param {number} [opts.from] - Start timestamp
   * @param {number} [opts.to] - End timestamp
   * @returns {Object[]}
   */
  query(opts = {}) {
    let results = this._events;

    if (opts.type) results = results.filter(e => e.type === opts.type);
    if (opts.domain) results = results.filter(e => e.domain === opts.domain);
    if (opts.provider) results = results.filter(e => e.provider === opts.provider);
    if (opts.ip) results = results.filter(e => e.ip === opts.ip);
    if (opts.from) results = results.filter(e => e.timestamp >= opts.from);
    if (opts.to) results = results.filter(e => e.timestamp <= opts.to);

    return results;
  }

  /**
   * Count events by type.
   * @param {Object} [opts] - Same filters as query
   * @returns {Object} - { sent: N, bounced: N, ... }
   */
  countByType(opts = {}) {
    const events = this.query(opts);
    const counts = {};
    for (const e of events) {
      counts[e.type] = (counts[e.type] || 0) + 1;
    }
    return counts;
  }

  /**
   * Prune events older than a timestamp.
   * @param {number} before - Remove events older than this timestamp
   * @returns {number} - Count of removed events
   */
  prune(before) {
    const initialCount = this._events.length;
    this._events = this._events.filter(e => e.timestamp >= before);
    return initialCount - this._events.length;
  }

  /**
   * Total event count.
   */
  size() {
    return this._events.length;
  }

  /**
   * Clear all events.
   */
  clear() {
    this._events = [];
  }
}

module.exports = { MemoryAnalyticsAdapter };
