'use strict';

const { MemoryAnalyticsAdapter } = require('./adapters/memory');
const bus = require('../events');

/**
 * Analytics Collector.
 * Listens to the event bus and records every email lifecycle event.
 * Provides the data layer for all analytics queries.
 */
class AnalyticsCollector {
  /**
   * @param {Object} [options]
   * @param {Object} [options.analyticsConfig] - Analytics config from store
   * @param {Object} [options.logger]
   */
  constructor(options = {}) {
    const { analyticsConfig = {}, logger } = options;

    this._logger = logger;

    // Initialize adapter
    const adapterType = analyticsConfig.adapter || 'memory';
    switch (adapterType) {
      case 'sqlite': {
        const { SQLiteAnalyticsAdapter } = require('./adapters/sqlite');
        this._adapter = new SQLiteAnalyticsAdapter(analyticsConfig.path);
        break;
      }
      case 'memory':
      default:
        this._adapter = new MemoryAnalyticsAdapter();
        break;
    }

    // Subscribe to all lifecycle events
    this._subscribe();
  }

  /**
   * Subscribe to event bus.
   */
  _subscribe() {
    const events = ['sent', 'delivered', 'bounced', 'opened', 'clicked', 'complained', 'failed'];

    for (const eventType of events) {
      bus.on(eventType, (data) => {
        this._adapter.store({
          type: eventType,
          email: data.to || data.email,
          domain: data.domain,
          ip: data.ip,
          provider: data.provider,
          messageId: data.messageId,
          trackingId: data.trackingId,
          meta: data,
          timestamp: data.timestamp || Date.now()
        });
      });
    }
  }

  /**
   * Get a summary of all analytics.
   *
   * @param {Object} [opts]
   * @param {number} [opts.from] - Start timestamp
   * @param {number} [opts.to] - End timestamp
   * @param {string} [opts.period] - 'today' | 'week' | 'month'
   * @returns {Object}
   */
  summary(opts = {}) {
    const filters = this._resolveTimeRange(opts);
    const counts = this._adapter.countByType(filters);

    const sent = counts.sent || 0;
    const delivered = counts.delivered || 0;
    const bounced = counts.bounced || 0;
    const opened = counts.opened || 0;
    const clicked = counts.clicked || 0;
    const complained = counts.complained || 0;
    const failed = counts.failed || 0;

    return {
      sent,
      delivered,
      bounced,
      opened,
      clicked,
      complained,
      failed,
      deliveryRate: sent > 0 ? `${((delivered / sent) * 100).toFixed(1)}%` : '0%',
      bounceRate: sent > 0 ? `${((bounced / sent) * 100).toFixed(1)}%` : '0%',
      openRate: delivered > 0 ? `${((opened / delivered) * 100).toFixed(1)}%` : '0%',
      clickRate: opened > 0 ? `${((clicked / opened) * 100).toFixed(1)}%` : '0%',
      complaintRate: sent > 0 ? `${((complained / sent) * 100).toFixed(4)}%` : '0%'
    };
  }

  /**
   * Get analytics by sending domain.
   * @param {string} domain
   * @param {Object} [opts]
   */
  byDomain(domain, opts = {}) {
    const filters = { ...this._resolveTimeRange(opts), domain };
    return this._adapter.countByType(filters);
  }

  /**
   * Get analytics by recipient provider.
   * @param {string} provider
   * @param {Object} [opts]
   */
  byProvider(provider, opts = {}) {
    const filters = { ...this._resolveTimeRange(opts), provider };
    return this._adapter.countByType(filters);
  }

  /**
   * Get analytics by sending IP.
   * @param {string} ip
   * @param {Object} [opts]
   */
  byIP(ip, opts = {}) {
    const filters = { ...this._resolveTimeRange(opts), ip };
    return this._adapter.countByType(filters);
  }

  /**
   * Get time series data.
   * @param {Object} [opts]
   * @param {string} [opts.interval='hourly'] - 'hourly' | 'daily'
   */
  timeSeries(opts = {}) {
    const filters = this._resolveTimeRange(opts);
    const events = this._adapter.query(filters);
    const interval = opts.interval || 'hourly';
    const bucketMs = interval === 'daily' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;

    const buckets = {};
    for (const e of events) {
      const bucketKey = Math.floor(e.timestamp / bucketMs) * bucketMs;
      if (!buckets[bucketKey]) {
        buckets[bucketKey] = { timestamp: bucketKey, sent: 0, bounced: 0, opened: 0, clicked: 0, complained: 0 };
      }
      if (buckets[bucketKey][e.type] != null) {
        buckets[bucketKey][e.type]++;
      }
    }

    return Object.values(buckets).sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Resolve time range shortcuts.
   */
  _resolveTimeRange(opts) {
    const result = {};
    if (opts.from) result.from = opts.from;
    if (opts.to) result.to = opts.to;

    if (opts.period === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      result.from = start.getTime();
    } else if (opts.period === 'week') {
      result.from = Date.now() - 7 * 24 * 60 * 60 * 1000;
    } else if (opts.period === 'month') {
      result.from = Date.now() - 30 * 24 * 60 * 60 * 1000;
    }

    return result;
  }

  /**
   * Get raw event count.
   */
  size() {
    return this._adapter.size();
  }

  /**
   * Clear all analytics.
   */
  clear() {
    this._adapter.clear();
  }
}

module.exports = { AnalyticsCollector };
