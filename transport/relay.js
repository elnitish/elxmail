'use strict';

const nodemailer = require('nodemailer');
const { ElxTransportError } = require('../errors');

/**
 * Relay server transport.
 * Sends emails to an intermediate relay server that forwards them to recipients.
 * The relay handles final delivery — this transport just hands off.
 *
 * Architecture:
 *   Your Server (elxmail) → SMTP Relay (Postfix/Haraka) → Recipient Mail Server
 *
 * The relay can be a separate VPS running a lightweight MTA.
 * This separates the "brain" (queue, throttle, rotation) from the "delivery" (SMTP).
 */

const _relayTransporters = new Map();

/**
 * Get or create a relay transporter.
 * @param {Object} transport - Relay transport config
 * @returns {Object} - nodemailer transporter
 */
function getRelayTransporter(transport) {
  const key = `relay:${transport.host}:${transport.port || 587}`;

  if (_relayTransporters.has(key)) {
    return _relayTransporters.get(key);
  }

  const opts = {
    host: transport.host,
    port: transport.port || 587,
    secure: transport.port === 465,
    auth: transport.auth ? {
      user: transport.auth.user,
      pass: transport.auth.pass
    } : undefined,
    tls: {
      rejectUnauthorized: false
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 60000
  };

  // Relay can use connection pooling
  if (transport.pool) {
    opts.pool = true;
    opts.maxConnections = transport.pool.maxConnections || 5;
    opts.maxMessages = transport.pool.maxMessages || 100;
  }

  const transporter = nodemailer.createTransport(opts);
  _relayTransporters.set(key, transporter);
  return transporter;
}

/**
 * Send an email through a relay server.
 *
 * @param {Object} message - Composed message from composer.js
 * @param {Object} transport - Relay transport config
 * @param {Object} [dkimOptions] - DKIM options (signing happens on our end, not relay)
 * @returns {Promise<Object>}
 */
async function send(message, transport, dkimOptions = null) {
  const transporter = getRelayTransporter(transport);

  const mailOpts = {
    from: message.from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    headers: message.headers || {}
  };

  if (message.text) mailOpts.text = message.text;
  if (message.replyTo) mailOpts.replyTo = message.replyTo;
  if (dkimOptions) mailOpts.dkim = dkimOptions;

  try {
    const info = await transporter.sendMail(mailOpts);

    return {
      success: true,
      messageId: info.messageId,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      response: info.response,
      transport: transport.domain,
      via: `relay:${transport.host}`
    };
  } catch (err) {
    throw new ElxTransportError(
      `Relay send failed via ${transport.host}: ${err.message}`,
      {
        success: false,
        error: err.message,
        code: err.code || 'UNKNOWN',
        responseCode: err.responseCode || null,
        transport: transport.domain,
        retryable: isRetryable(err)
      }
    );
  }
}

/**
 * Test relay connection.
 * @param {Object} transport
 * @returns {Promise<Object>}
 */
async function testConnection(transport) {
  const transporter = getRelayTransporter(transport);
  const start = Date.now();

  try {
    await transporter.verify();
    return {
      status: 'connected',
      type: 'relay',
      host: transport.host,
      domain: transport.domain,
      latency: `${Date.now() - start}ms`
    };
  } catch (err) {
    return {
      status: 'failed',
      type: 'relay',
      host: transport.host,
      domain: transport.domain,
      error: err.message
    };
  }
}

function isRetryable(err) {
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'ESOCKET'].includes(err.code)) return true;
  if (err.responseCode && err.responseCode >= 400 && err.responseCode < 500) return true;
  return false;
}

function closeAll() {
  for (const transporter of _relayTransporters.values()) {
    transporter.close();
  }
  _relayTransporters.clear();
}

module.exports = { send, testConnection, closeAll };
