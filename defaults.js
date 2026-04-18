'use strict';

/**
 * Default configuration values for every elxmail option.
 * When the developer doesn't specify something in init(),
 * the SDK pulls from here. Smart defaults that work for 90% of use cases.
 */
module.exports = {
  // Rotation — how emails are distributed across transports
  rotation: {
    strategy: 'round-robin', // 'round-robin' | 'weighted' | 'random'
    weights: {},             // only used when strategy is 'weighted'
    stickyProvider: false    // same provider always gets same sending domain
  },

  // Throttle — rate limits per resource
  throttle: {
    global: { max: 5000, per: 'hour' },
    perDomain: { max: 120, per: 'day' },
    perIP: { max: 500, per: 'day' },
    perProvider: {
      gmail: { max: 30, per: 'hour' },
      outlook: { max: 40, per: 'hour' },
      yahoo: { max: 25, per: 'hour' },
      default: { max: 50, per: 'hour' }
    },
    perSecond: 10,
    cooldown: {
      errorThreshold: 5,   // errors within window to trigger pause
      windowSeconds: 60,
      pauseMinutes: 10
    }
  },

  // Warm-up — gradual ramp-up for new domains
  warmup: {
    enabled: true,
    plan: 'default',
    curve: [
      { day: 1, maxPerDomain: 20 },
      { day: 3, maxPerDomain: 50 },
      { day: 7, maxPerDomain: 100 },
      { day: 14, maxPerDomain: 200 },
      { day: 21, maxPerDomain: 350 },
      { day: 28, maxPerDomain: 500 }
    ],
    startDate: {},           // per-domain overrides: { 'domain.com': '2026-03-01' }
    autoSlowdown: true,      // reduce volume if bounces spike
    statePath: './data/warmup-state.json'
  },

  // Suppression — blacklist storage
  suppression: {
    adapter: 'memory',       // 'memory' | 'sqlite' | 'redis' | 'postgres' | 'mysql'
    path: './data/suppression.db',
    autoSuppress: {
      hardBounce: true,
      complaint: true,
      softBounceAfter: 3     // suppress after N soft bounces to same email
    }
  },

  // DKIM — signing configuration
  dkim: {
    selector: 'elx',
    keys: {}                 // { 'domain.com': './keys/domain.pem' }
  },

  // Queue — email queue processing
  queue: {
    adapter: 'memory',       // 'memory' | 'redis' | 'bull'
    concurrency: 10,
    retryAttempts: 3,
    retryDelay: 300,         // seconds between retries
    retryBackoff: 'exponential', // 'fixed' | 'exponential'
    priority: {
      gmail: 1,
      outlook: 2,
      yahoo: 3,
      default: 5
    }
  },

  // Tracking — open and click tracking
  tracking: {
    enabled: false,
    opens: true,
    clicks: true,
    domain: null,            // tracking domain (needs HTTPS)
    unsubscribe: {
      enabled: false,
      url: null
    }
  },

  // Analytics — metrics storage
  analytics: {
    adapter: 'memory',       // 'memory' | 'sqlite' | 'redis' | 'postgres'
    path: './data/analytics.db',
    retention: 90            // days to keep records
  },

  // Logger — structured logging
  logger: {
    level: 'info',           // 'debug' | 'info' | 'warn' | 'error'
    output: 'console',       // 'console' | 'file' | 'both'
    filePath: './logs/elxmail.log',
    rotation: {
      maxSize: '50mb',
      maxFiles: 10,
      compress: true
    },
    format: 'text'           // 'json' | 'text'
  },

  // DNS — validation settings
  dns: {
    autoValidate: true,
    failOnError: false,      // true = throw if DNS fails, false = warn
    checkInterval: 86400,    // re-check every 24 hours (seconds)
    timeout: 5000            // DNS query timeout ms
  },

  // Content — email content rules
  content: {
    autoPlainText: true,
    spamCheck: false,
    spamThreshold: 70,
    maxLinksPerEmail: 3,
    requiredHeaders: ['List-Unsubscribe']
  }
};
