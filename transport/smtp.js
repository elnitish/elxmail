'use strict';

const nodemailer = require('nodemailer');
const { ElxTransportError } = require('../errors');

/**
 * Direct SMTP sender.
 * Uses nodemailer for SMTP transport — the only external dependency for sending.
 *
 * Supports:
 * - IP binding (multiple IPs on same VPS)
 * - TLS (STARTTLS and direct TLS)
 * - Connection pooling (via nodemailer's pool option)
 * - Timeout handling on connection and command level
 */

// Cache of nodemailer transporter instances per transport config
const _transporters = new Map();

/**
 * Get or create a nodemailer transporter for a transport config.
 * Transporters are cached by domain to reuse connections.
 *
 * @param {Object} transport - Transport config from store
 * @returns {Object} - nodemailer transporter
 */
function getTransporter(transport) {
  const key = transport.domain;

  if (_transporters.has(key)) {
    return _transporters.get(key);
  }

  const opts = {
    host: transport.host,
    port: transport.port || 587,
    secure: transport.port === 465,  // direct TLS for port 465
    auth: {
      user: transport.auth.user,
      pass: transport.auth.pass
    },
    tls: {
      rejectUnauthorized: false  // accept self-signed certs in dev
    },
    connectionTimeout: 30000,  // 30s connection timeout
    greetingTimeout: 30000,
    socketTimeout: 60000       // 60s socket timeout
  };

  // IP binding — send from a specific local IP
  if (transport.bindIP) {
    opts.localAddress = transport.bindIP;
  }

  // Connection pooling
  if (transport.pool) {
    opts.pool = true;
    opts.maxConnections = transport.pool.maxConnections || 5;
    opts.maxMessages = transport.pool.maxMessages || 100;
  }

  const transporter = nodemailer.createTransport(opts);
  _transporters.set(key, transporter);
  return transporter;
}

/**
 * Send an email through SMTP.
 *
 * @param {Object} message - Composed message from composer.js
 * @param {Object} transport - Transport config (domain, host, auth, etc.)
 * @param {Object} [dkimOptions] - DKIM signing options (handled by nodemailer)
 * @returns {Promise<Object>} - Send result
 */
async function send(message, transport, dkimOptions = null) {
  const transporter = getTransporter(transport);

  const mailOpts = {
    from: message.from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    headers: message.headers || {}
  };

  if (message.text) {
    mailOpts.text = message.text;
  }

  if (message.replyTo) {
    mailOpts.replyTo = message.replyTo;
  }

  // DKIM signing via nodemailer
  if (dkimOptions) {
    mailOpts.dkim = dkimOptions;
  }

  try {
    const info = await transporter.sendMail(mailOpts);

    return {
      success: true,
      messageId: info.messageId,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      response: info.response,
      responseCode: parseResponseCode(info.response),
      transport: transport.domain
    };
  } catch (err) {
    // Classify the error for retry logic
    const result = {
      success: false,
      error: err.message,
      code: err.code || 'UNKNOWN',
      responseCode: err.responseCode || null,
      transport: transport.domain,
      retryable: isRetryable(err)
    };

    throw new ElxTransportError(
      `SMTP send failed via ${transport.domain}: ${err.message}`,
      result
    );
  }
}

/**
 * Test SMTP connection for a transport.
 * @param {Object} transport - Transport config
 * @returns {Promise<Object>} - Connection status
 */
async function testConnection(transport) {
  const transporter = getTransporter(transport);
  const start = Date.now();

  try {
    await transporter.verify();
    return {
      status: 'connected',
      domain: transport.domain,
      host: transport.host,
      latency: `${Date.now() - start}ms`
    };
  } catch (err) {
    return {
      status: 'failed',
      domain: transport.domain,
      host: transport.host,
      error: err.message,
      code: err.code
    };
  }
}

/**
 * Parse SMTP response code from response string.
 * "250 2.0.0 OK" → 250
 */
function parseResponseCode(response) {
  if (!response) return null;
  const match = response.match(/^(\d{3})/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Determine if an SMTP error is retryable.
 * 4xx = temporary (retryable), 5xx = permanent (not retryable)
 * Network errors (ECONNREFUSED, ETIMEDOUT) are retryable.
 */
function isRetryable(err) {
  // Network errors — always retryable
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'ESOCKET', 'ECONNECTION'].includes(err.code)) {
    return true;
  }

  // SMTP response codes: 4xx = temporary, 5xx = permanent
  if (err.responseCode) {
    return err.responseCode >= 400 && err.responseCode < 500;
  }

  return false;
}

/**
 * Close all cached transporters. Used in shutdown.
 */
function closeAll() {
  for (const transporter of _transporters.values()) {
    transporter.close();
  }
  _transporters.clear();
}

module.exports = { send, testConnection, closeAll, isRetryable };
