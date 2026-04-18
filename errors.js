'use strict';

/**
 * Base error class for all elxmail errors.
 * Every error carries a code, component name, and optional details
 * so the developer can debug without reading SDK source.
 */
class ElxError extends Error {
  constructor(message, { code = 'ELX_ERROR', component = 'core', details = null } = {}) {
    super(message);
    this.name = 'ElxError';
    this.code = code;
    this.component = component;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ElxConfigError extends ElxError {
  constructor(message, details = null) {
    super(message, { code: 'ELX_CONFIG_ERROR', component: 'config', details });
    this.name = 'ElxConfigError';
  }
}

class ElxTransportError extends ElxError {
  constructor(message, details = null) {
    super(message, { code: 'ELX_TRANSPORT_ERROR', component: 'transport', details });
    this.name = 'ElxTransportError';
  }
}

class ElxDNSError extends ElxError {
  constructor(message, details = null) {
    super(message, { code: 'ELX_DNS_ERROR', component: 'dns', details });
    this.name = 'ElxDNSError';
  }
}

class ElxThrottleError extends ElxError {
  constructor(message, details = null) {
    super(message, { code: 'ELX_THROTTLE_ERROR', component: 'throttle', details });
    this.name = 'ElxThrottleError';
  }
}

class ElxSuppressionError extends ElxError {
  constructor(message, details = null) {
    super(message, { code: 'ELX_SUPPRESSION_ERROR', component: 'suppression', details });
    this.name = 'ElxSuppressionError';
  }
}

class ElxQueueError extends ElxError {
  constructor(message, details = null) {
    super(message, { code: 'ELX_QUEUE_ERROR', component: 'queue', details });
    this.name = 'ElxQueueError';
  }
}

class ElxRotationError extends ElxError {
  constructor(message, details = null) {
    super(message, { code: 'ELX_ROTATION_ERROR', component: 'rotation', details });
    this.name = 'ElxRotationError';
  }
}

class ElxBounceError extends ElxError {
  constructor(message, details = null) {
    super(message, { code: 'ELX_BOUNCE_ERROR', component: 'bounce', details });
    this.name = 'ElxBounceError';
  }
}

class ElxWarmupError extends ElxError {
  constructor(message, details = null) {
    super(message, { code: 'ELX_WARMUP_ERROR', component: 'warmup', details });
    this.name = 'ElxWarmupError';
  }
}

module.exports = {
  ElxError,
  ElxConfigError,
  ElxTransportError,
  ElxDNSError,
  ElxThrottleError,
  ElxSuppressionError,
  ElxQueueError,
  ElxRotationError,
  ElxBounceError,
  ElxWarmupError
};
