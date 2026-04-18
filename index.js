'use strict';

const configStore = require('./config/store');
const bus = require('./events');
const { Logger } = require('./logger/logger');
const { compose } = require('./transport/composer');
const smtp = require('./transport/smtp');
const dkimSigner = require('./transport/dkim-signer');
const { QueueManager } = require('./queue/manager');
const { ElxConfigError } = require('./errors');
const { extractDomain, isValid: isValidEmail, normalize } = require('./utils/email-parser');

// Phase 3 components
const { classify: classifyEmail, getThrottleGroup, clearCache: clearClassifierCache } = require('./classifier/classifier');
const { RateLimiter } = require('./throttle/limiter');
const { RotationEngine } = require('./rotation/engine');
const { WarmupScheduler } = require('./warmup/scheduler');
const { SuppressionStore } = require('./suppression/store');
const { checkHealth } = require('./dns/health');
const { DNSMonitor } = require('./dns/monitor');

// Phase 4 components
const { BounceHandler } = require('./bounce/handler');
const { FBLHandler } = require('./fbl/handler');
const { AnalyticsCollector } = require('./analytics/collector');

// Phase 6 components
const { scoreContent } = require('./content/scorer');
const { rewriteLinks } = require('./tracking/links');
const { injectPixel } = require('./tracking/pixel');

/**
 * elxmail — Cold email delivery protocol SDK.
 *
 * The developer experience:
 *   elxmail.init({ domains: [...] })
 *   await elxmail.send({ to, subject, body })
 *
 * Internally: suppression → classify → queue → warmup → throttle → rotation → DKIM → SMTP → bounce → analytics
 */

// Internal state
let _logger = null;
let _queueManager = null;
let _initialized = false;

// All components
let _suppression = null;
let _throttle = null;
let _rotation = null;
let _warmup = null;
let _analytics = null;
let _bounceHandler = null;
let _fblHandler = null;
let _dnsMonitor = null;

// ─── init() ────────────────────────────────────────────────────────────

function init(userConfig) {
  if (!userConfig || typeof userConfig !== 'object') {
    throw new ElxConfigError('init() requires a configuration object');
  }

  // Reset if re-initializing
  if (_initialized) shutdown();

  const config = configStore.init(userConfig);

  // 1. Logger
  _logger = new Logger(config.logger);
  const log = _logger.child('core');
  log.info(`initializing with ${config.transports.length} transports`);

  // 2. Suppression Store
  _suppression = new SuppressionStore({
    suppressionConfig: config.suppression,
    logger: _logger.child('suppression')
  });

  // 3. Throttle Controller
  _throttle = new RateLimiter(config.throttle, _logger.child('throttle'));

  // 4. Warm-up Scheduler
  _warmup = new WarmupScheduler({
    warmupConfig: config.warmup,
    transports: config.transports,
    logger: _logger.child('warmup')
  });

  // 5. Rotation Engine
  _rotation = new RotationEngine({
    transports: config.transports,
    rotationConfig: config.rotation,
    throttle: _throttle,
    warmup: _warmup,
    logger: _logger.child('rotation')
  });

  // 6. Bounce Handler
  _bounceHandler = new BounceHandler({ logger: _logger.child('bounce') });

  // 7. FBL Handler
  _fblHandler = new FBLHandler({ logger: _logger.child('fbl') });

  // 8. Analytics Collector
  _analytics = new AnalyticsCollector({
    analyticsConfig: config.analytics,
    logger: _logger.child('analytics')
  });

  // 9. DNS Monitor
  if (config.dns.autoValidate) {
    _dnsMonitor = new DNSMonitor({
      transports: config.transports,
      dkimConfig: config.dkim,
      intervalSeconds: config.dns.checkInterval,
      timeout: config.dns.timeout,
      logger: _logger.child('dns')
    });
    _dnsMonitor.start();
  }

  // 10. Queue Manager — wired with full send pipeline
  _queueManager = new QueueManager({
    config: config.queue,
    sendFn: _processSendJob,
    classifyFn: (email) => {
      const domain = extractDomain(email);
      return _classifyProviderSync(domain);
    },
    logger: _logger.child('queue')
  });
  _queueManager.start();

  _initialized = true;

  const status = {
    status: 'ready',
    transports: config.transports.length,
    domains: config.transports.map(t => t.domain),
    warmupActive: config.warmup.enabled,
    suppressionSize: _suppression.size()
  };

  log.info('initialized successfully', status);
  bus.emit('init', status);

  return status;
}

// ─── send() ────────────────────────────────────────────────────────────

function send(email) {
  _ensureInitialized();

  if (!email || !email.to || !email.subject || !email.body) {
    throw new ElxConfigError('send() requires { to, subject, body }');
  }

  if (!isValidEmail(email.to)) {
    throw new ElxConfigError(`Invalid email address: ${email.to}`);
  }

  return new Promise((resolve, reject) => {
    const job = _queueManager.add(email);
    job._resolve = resolve;
    job._reject = reject;
  });
}

async function sendBatch(emails) {
  _ensureInitialized();

  if (!Array.isArray(emails) || emails.length === 0) {
    throw new ElxConfigError('sendBatch() requires a non-empty array of emails');
  }

  const results = await Promise.allSettled(emails.map(email => send(email)));

  return {
    total: results.length,
    sent: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
    results: results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message })
  };
}

// ─── Core send pipeline ────────────────────────────────────────────────

async function _processSendJob(job) {
  const config = configStore.get();
  const log = _logger.child('pipeline');
  const email = job.email;

  try {
    // Step 1: Suppression check
    if (_suppression.check(normalize(email.to))) {
      log.debug(`suppressed: ${email.to}`);
      if (job._resolve) job._resolve({ status: 'suppressed', to: email.to });
      return;
    }

    // Step 2: Classify recipient provider
    const provider = await classifyEmail(email.to, config.dns.timeout);
    const throttleGroup = getThrottleGroup(provider);

    // Step 3: Pick transport via rotation engine
    // (rotation internally checks throttle + warmup limits)
    const { transport, retryAfterMs } = _rotation.pick(throttleGroup);

    if (!transport) {
      // No transport available — requeue with delay
      log.debug(`no transport available for ${email.to}, requeuing`, { retryAfterMs });
      _queueManager.retry(job);
      return;
    }

    // Step 4: Compose the message
    const message = compose(email, transport, {
      content: config.content,
      tracking: config.tracking
    });

    // Step 5: DKIM signing
    const dkimOpts = dkimSigner.getSigningOptions(transport.domain, config.dkim);

    // Step 6: Send via SMTP
    log.debug(`sending to ${email.to} via ${transport.domain}`);
    const result = await smtp.send(message, transport, dkimOpts);

    // Step 7: Record success in throttle + warmup
    _throttle.recordSend(transport.domain, transport.bindIP || null, throttleGroup);
    _warmup.recordSend(transport.domain);

    // Step 8: Emit success event
    log.info(`sent to ${email.to}`, { domain: transport.domain, messageId: result.messageId });
    bus.emit('sent', {
      to: email.to,
      domain: transport.domain,
      ip: transport.bindIP || null,
      provider,
      messageId: result.messageId,
      trackingId: message._trackingId,
      timestamp: Date.now()
    });

    if (job._resolve) job._resolve(result);

  } catch (err) {
    log.warn(`send failed for ${email.to}: ${err.message}`);

    // Process as bounce
    if (err.details?.responseCode || err.details?.response) {
      _bounceHandler.processError(err, {
        email: email.to,
        domain: err.details?.transport,
        messageId: err.details?.messageId
      });
    }

    // Record error for cooldown
    if (err.details?.transport) {
      _throttle.recordError(err.details.transport);
    }

    // Check if retryable
    const retryable = err.details?.retryable || false;
    if (retryable && _queueManager.retry(job)) {
      return;
    }

    bus.emit('failed', {
      to: email.to,
      error: err.message,
      code: err.details?.code,
      timestamp: Date.now()
    });

    if (job._reject) job._reject(err);
  }
}

/**
 * Synchronous provider classification for known domains.
 * Falls back to 'unknown' for MX-lookup domains (async classify happens in pipeline).
 */
function _classifyProviderSync(domain) {
  if (!domain) return 'unknown';
  const { checkKnownDomain } = require('./classifier/providers');
  return checkKnownDomain(domain) || 'unknown';
}

// ─── Public utility methods ────────────────────────────────────────────

async function validateDNS() {
  _ensureInitialized();
  const config = configStore.get();
  return checkHealth(config.transports, config.dkim, config.dns.timeout);
}

async function testConnection(domain) {
  _ensureInitialized();
  const config = configStore.get();
  const transports = domain
    ? config.transports.filter(t => t.domain === domain)
    : config.transports;
  const results = await Promise.all(transports.map(t => smtp.testConnection(t)));
  return domain ? results[0] : results;
}

function _ensureInitialized() {
  if (!_initialized) {
    throw new ElxConfigError('elxmail not initialized. Call elxmail.init() first.');
  }
}

// ─── Events ────────────────────────────────────────────────────────────

function on(event, fn) { bus.on(event, fn); return module.exports; }
function once(event, fn) { bus.once(event, fn); return module.exports; }
function off(event, fn) { bus.off(event, fn); return module.exports; }

// ─── Shutdown ──────────────────────────────────────────────────────────

function shutdown() {
  if (_queueManager) _queueManager.stop();
  if (_dnsMonitor) _dnsMonitor.stop();
  smtp.closeAll();
  dkimSigner.clearKeys();
  clearClassifierCache();
  if (_warmup) _warmup.reset();
  if (_logger) _logger.close();
  configStore.reset();
  _initialized = false;
  _logger = null;
  _queueManager = null;
  _suppression = null;
  _throttle = null;
  _rotation = null;
  _warmup = null;
  _analytics = null;
  _bounceHandler = null;
  _fblHandler = null;
  _dnsMonitor = null;
  bus.removeAllListeners();
}

// ─── Exports ───────────────────────────────────────────────────────────

module.exports = {
  init,
  send,
  sendBatch,
  validateDNS,
  testConnection,
  on,
  once,
  off,
  shutdown,

  queue: {
    get status() { return _queueManager ? _queueManager.status() : null; },
    pause() { if (_queueManager) _queueManager.pause(); },
    resume() { if (_queueManager) _queueManager.resume(); },
    drain() { return _queueManager ? _queueManager.drain() : Promise.resolve(); }
  },

  suppress: {
    add(email, reason) { if (_suppression) _suppression.add(email, reason); },
    check(email) { return _suppression ? _suppression.check(email) : false; },
    remove(email) { if (_suppression) _suppression.remove(email); },
    import(emails, reason) { if (_suppression) _suppression.import(emails, reason); },
    export() { return _suppression ? _suppression.export() : []; },
    get size() { return _suppression ? _suppression.size() : 0; }
  },

  analytics: {
    summary(opts) { return _analytics ? _analytics.summary(opts) : {}; },
    byDomain(domain, opts) { return _analytics ? _analytics.byDomain(domain, opts) : {}; },
    byProvider(provider, opts) { return _analytics ? _analytics.byProvider(provider, opts) : {}; },
    byIP(ip, opts) { return _analytics ? _analytics.byIP(ip, opts) : {}; },
    timeSeries(opts) { return _analytics ? _analytics.timeSeries(opts) : []; }
  },

  warmup: {
    status() { return _warmup ? _warmup.status() : {}; }
  },

  // Content scoring
  scoreContent,

  // Utility exports for advanced usage
  utils: {
    generateDKIMKeyPair: require('./utils/crypto').generateDKIMKeyPair,
    extractPublicKeyBase64: require('./utils/crypto').extractPublicKeyBase64
  }
};
