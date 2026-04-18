'use strict';

const { ElxConfigError } = require('../errors');
const ipUtils = require('../utils/ip');
const fs = require('fs');

/**
 * Config validator. Validates every field in the config object.
 * No third-party schema library — validates manually for minimal dependencies.
 *
 * Validation order: transports → rotation → throttle → warmup → dkim →
 *                   suppression → queue → analytics → logger → dns → content
 */

const VALID_TRANSPORT_TYPES = ['smtp', 'relay', 'provider'];
const VALID_PROVIDER_NAMES = ['ses', 'sendgrid', 'mailgun'];
const VALID_PORTS = [25, 465, 587, 2525];
const VALID_ROTATION_STRATEGIES = ['round-robin', 'weighted', 'random'];
const VALID_TIME_UNITS = ['second', 'minute', 'hour', 'day'];
const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const VALID_LOG_OUTPUTS = ['console', 'file', 'both'];
const VALID_LOG_FORMATS = ['json', 'text'];
const VALID_ADAPTERS = ['memory', 'sqlite', 'redis', 'postgres', 'mysql'];
const VALID_BACKOFF = ['fixed', 'exponential'];

function validate(config) {
  const errors = [];

  // — TRANSPORTS (required) —
  if (!config.transports || !Array.isArray(config.transports) || config.transports.length === 0) {
    throw new ElxConfigError('At least one transport is required. Use `domains: [...]` shorthand or `transports: [...]` full syntax.', {
      field: 'transports'
    });
  }

  const domains = new Set();

  config.transports.forEach((t, i) => {
    const prefix = `transports[${i}]`;

    if (!t.type || !VALID_TRANSPORT_TYPES.includes(t.type)) {
      errors.push(`${prefix}.type must be one of: ${VALID_TRANSPORT_TYPES.join(', ')}`);
    }

    if (!t.domain || typeof t.domain !== 'string') {
      errors.push(`${prefix}.domain is required and must be a string`);
    } else {
      if (domains.has(t.domain)) {
        errors.push(`${prefix}.domain "${t.domain}" is duplicate — each domain must appear once`);
      }
      domains.add(t.domain);
    }

    if (t.type === 'smtp' || t.type === 'relay') {
      if (!t.host || typeof t.host !== 'string') {
        errors.push(`${prefix}.host is required for ${t.type} transport`);
      }
      if (t.port != null && (typeof t.port !== 'number' || t.port < 1 || t.port > 65535)) {
        errors.push(`${prefix}.port must be a valid port number (1-65535). Common ports: ${VALID_PORTS.join(', ')}`);
      }
      if (!t.auth || !t.auth.user || !t.auth.pass) {
        errors.push(`${prefix}.auth requires user and pass`);
      }
      if (t.bindIP && !ipUtils.isValid(t.bindIP)) {
        errors.push(`${prefix}.bindIP "${t.bindIP}" is not a valid IP address`);
      }
    }

    if (t.type === 'provider') {
      if (!t.name || !VALID_PROVIDER_NAMES.includes(t.name)) {
        errors.push(`${prefix}.name must be one of: ${VALID_PROVIDER_NAMES.join(', ')}`);
      }
      if (!t.credentials && !t.apiKey) {
        errors.push(`${prefix} requires credentials or apiKey`);
      }
    }

    if (t.pool) {
      if (t.pool.maxConnections && (typeof t.pool.maxConnections !== 'number' || t.pool.maxConnections < 1)) {
        errors.push(`${prefix}.pool.maxConnections must be a positive number`);
      }
      if (t.pool.maxMessages && (typeof t.pool.maxMessages !== 'number' || t.pool.maxMessages < 1)) {
        errors.push(`${prefix}.pool.maxMessages must be a positive number`);
      }
    }
  });

  // — ROTATION —
  if (config.rotation) {
    const r = config.rotation;
    if (r.strategy && !VALID_ROTATION_STRATEGIES.includes(r.strategy)) {
      errors.push(`rotation.strategy must be one of: ${VALID_ROTATION_STRATEGIES.join(', ')}`);
    }
    if (r.strategy === 'weighted') {
      if (!r.weights || typeof r.weights !== 'object') {
        errors.push('rotation.weights is required when strategy is "weighted"');
      } else {
        const total = Object.values(r.weights).reduce((sum, w) => sum + w, 0);
        if (total !== 100) {
          errors.push(`rotation.weights must sum to 100, got ${total}`);
        }
        for (const domain of Object.keys(r.weights)) {
          if (!domains.has(domain)) {
            errors.push(`rotation.weights references unknown domain "${domain}"`);
          }
        }
      }
    }
  }

  // — THROTTLE —
  if (config.throttle) {
    const t = config.throttle;
    validateRateLimit(t.global, 'throttle.global', errors);
    validateRateLimit(t.perDomain, 'throttle.perDomain', errors);
    validateRateLimit(t.perIP, 'throttle.perIP', errors);

    if (t.perProvider && typeof t.perProvider === 'object') {
      for (const [provider, limit] of Object.entries(t.perProvider)) {
        validateRateLimit(limit, `throttle.perProvider.${provider}`, errors);
      }
    }

    if (t.perSecond != null && (typeof t.perSecond !== 'number' || t.perSecond < 1)) {
      errors.push('throttle.perSecond must be a positive number');
    }

    if (t.cooldown) {
      if (t.cooldown.errorThreshold != null && (typeof t.cooldown.errorThreshold !== 'number' || t.cooldown.errorThreshold < 1)) {
        errors.push('throttle.cooldown.errorThreshold must be a positive number');
      }
      if (t.cooldown.windowSeconds != null && (typeof t.cooldown.windowSeconds !== 'number' || t.cooldown.windowSeconds < 1)) {
        errors.push('throttle.cooldown.windowSeconds must be a positive number');
      }
      if (t.cooldown.pauseMinutes != null && (typeof t.cooldown.pauseMinutes !== 'number' || t.cooldown.pauseMinutes < 1)) {
        errors.push('throttle.cooldown.pauseMinutes must be a positive number');
      }
    }
  }

  // — WARMUP —
  if (config.warmup) {
    const w = config.warmup;
    if (w.curve && Array.isArray(w.curve)) {
      for (let i = 1; i < w.curve.length; i++) {
        if (w.curve[i].day <= w.curve[i - 1].day) {
          errors.push(`warmup.curve days must be ascending at index ${i}`);
        }
        if (w.curve[i].maxPerDomain <= w.curve[i - 1].maxPerDomain) {
          errors.push(`warmup.curve maxPerDomain must be ascending at index ${i}`);
        }
      }
    }
    if (w.startDate && typeof w.startDate === 'object') {
      for (const domain of Object.keys(w.startDate)) {
        if (!domains.has(domain)) {
          errors.push(`warmup.startDate references unknown domain "${domain}"`);
        }
      }
    }
  }

  // — DKIM —
  if (config.dkim && config.dkim.keys) {
    for (const [domain, keyPath] of Object.entries(config.dkim.keys)) {
      if (!domains.has(domain)) {
        errors.push(`dkim.keys references unknown domain "${domain}"`);
      }
      if (typeof keyPath === 'string' && !fs.existsSync(keyPath)) {
        errors.push(`dkim.keys["${domain}"] file not found: ${keyPath}`);
      }
    }
  }

  // — SUPPRESSION —
  if (config.suppression) {
    if (config.suppression.adapter && !VALID_ADAPTERS.includes(config.suppression.adapter)) {
      errors.push(`suppression.adapter must be one of: ${VALID_ADAPTERS.join(', ')}`);
    }
  }

  // — QUEUE —
  if (config.queue) {
    const q = config.queue;
    if (q.adapter && !['memory', 'redis', 'bull'].includes(q.adapter)) {
      errors.push('queue.adapter must be one of: memory, redis, bull');
    }
    if (q.concurrency != null && (typeof q.concurrency !== 'number' || q.concurrency < 1)) {
      errors.push('queue.concurrency must be a positive number');
    }
    if (q.retryAttempts != null && (typeof q.retryAttempts !== 'number' || q.retryAttempts < 0)) {
      errors.push('queue.retryAttempts must be a non-negative number');
    }
    if (q.retryBackoff && !VALID_BACKOFF.includes(q.retryBackoff)) {
      errors.push(`queue.retryBackoff must be one of: ${VALID_BACKOFF.join(', ')}`);
    }
  }

  // — ANALYTICS —
  if (config.analytics) {
    if (config.analytics.adapter && !VALID_ADAPTERS.includes(config.analytics.adapter)) {
      errors.push(`analytics.adapter must be one of: ${VALID_ADAPTERS.join(', ')}`);
    }
    if (config.analytics.retention != null && (typeof config.analytics.retention !== 'number' || config.analytics.retention < 1)) {
      errors.push('analytics.retention must be a positive number (days)');
    }
  }

  // — LOGGER —
  if (config.logger) {
    if (config.logger.level && !VALID_LOG_LEVELS.includes(config.logger.level)) {
      errors.push(`logger.level must be one of: ${VALID_LOG_LEVELS.join(', ')}`);
    }
    if (config.logger.output && !VALID_LOG_OUTPUTS.includes(config.logger.output)) {
      errors.push(`logger.output must be one of: ${VALID_LOG_OUTPUTS.join(', ')}`);
    }
    if (config.logger.format && !VALID_LOG_FORMATS.includes(config.logger.format)) {
      errors.push(`logger.format must be one of: ${VALID_LOG_FORMATS.join(', ')}`);
    }
  }

  // — DNS —
  if (config.dns) {
    if (config.dns.timeout != null && (typeof config.dns.timeout !== 'number' || config.dns.timeout < 100)) {
      errors.push('dns.timeout must be at least 100ms');
    }
    if (config.dns.checkInterval != null && (typeof config.dns.checkInterval !== 'number' || config.dns.checkInterval < 60)) {
      errors.push('dns.checkInterval must be at least 60 seconds');
    }
  }

  // — CONTENT —
  if (config.content) {
    if (config.content.spamThreshold != null && (typeof config.content.spamThreshold !== 'number' || config.content.spamThreshold < 0 || config.content.spamThreshold > 100)) {
      errors.push('content.spamThreshold must be between 0 and 100');
    }
    if (config.content.maxLinksPerEmail != null && (typeof config.content.maxLinksPerEmail !== 'number' || config.content.maxLinksPerEmail < 0)) {
      errors.push('content.maxLinksPerEmail must be a non-negative number');
    }
  }

  // Throw all errors at once
  if (errors.length > 0) {
    throw new ElxConfigError(
      `Configuration validation failed:\n  → ${errors.join('\n  → ')}`,
      { errors }
    );
  }

  return true;
}

function validateRateLimit(limit, path, errors) {
  if (!limit) return;
  if (typeof limit !== 'object') {
    errors.push(`${path} must be an object with { max, per }`);
    return;
  }
  if (limit.max != null && (typeof limit.max !== 'number' || limit.max < 1)) {
    errors.push(`${path}.max must be a positive number`);
  }
  if (limit.per && !VALID_TIME_UNITS.includes(limit.per)) {
    errors.push(`${path}.per must be one of: ${VALID_TIME_UNITS.join(', ')}`);
  }
}

module.exports = { validate };
