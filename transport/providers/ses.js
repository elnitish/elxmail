'use strict';

const nodemailer = require('nodemailer');
const { ElxTransportError } = require('../../errors');

/**
 * Amazon SES transport adapter.
 * Uses nodemailer's SES transport with AWS SDK credentials.
 *
 * Config:
 *   { type: 'provider', name: 'ses', domain: '...', region: 'us-east-1',
 *     credentials: { accessKeyId: '...', secretAccessKey: '...' } }
 *
 * Note: SES requires the sending domain to be verified in AWS console.
 *       SES has strict sending limits and may suspend for cold email patterns.
 */

const _transporters = new Map();

/**
 * Get or create an SES transporter.
 * Uses nodemailer's SMTP interface to SES (simpler than AWS SDK dependency).
 *
 * @param {Object} transport - SES transport config
 * @returns {Object} - nodemailer transporter
 */
function getTransporter(transport) {
  const key = `ses:${transport.domain}`;

  if (_transporters.has(key)) {
    return _transporters.get(key);
  }

  const region = transport.region || 'us-east-1';

  // Use SES SMTP interface (no AWS SDK dependency needed)
  const transporter = nodemailer.createTransport({
    host: `email-smtp.${region}.amazonaws.com`,
    port: 587,
    secure: false,
    auth: {
      user: transport.credentials.accessKeyId,
      pass: transport.credentials.secretAccessKey
    },
    tls: {
      rejectUnauthorized: true
    },
    connectionTimeout: 30000,
    socketTimeout: 60000
  });

  _transporters.set(key, transporter);
  return transporter;
}

async function send(message, transport, dkimOptions = null) {
  const transporter = getTransporter(transport);

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
      via: 'ses'
    };
  } catch (err) {
    throw new ElxTransportError(
      `SES send failed for ${transport.domain}: ${err.message}`,
      {
        success: false,
        error: err.message,
        code: err.code || 'UNKNOWN',
        responseCode: err.responseCode || null,
        transport: transport.domain,
        retryable: err.responseCode >= 400 && err.responseCode < 500
      }
    );
  }
}

async function testConnection(transport) {
  const transporter = getTransporter(transport);
  const start = Date.now();
  try {
    await transporter.verify();
    return { status: 'connected', type: 'ses', domain: transport.domain, latency: `${Date.now() - start}ms` };
  } catch (err) {
    return { status: 'failed', type: 'ses', domain: transport.domain, error: err.message };
  }
}

function closeAll() {
  for (const t of _transporters.values()) t.close();
  _transporters.clear();
}

module.exports = { send, testConnection, closeAll };
