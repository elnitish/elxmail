'use strict';

const nodemailer = require('nodemailer');
const { ElxTransportError } = require('../../errors');

/**
 * Mailgun transport adapter.
 * Uses Mailgun's SMTP relay interface via nodemailer.
 *
 * Config:
 *   { type: 'provider', name: 'mailgun', domain: '...',
 *     credentials: { user: 'postmaster@mg.domain.com', pass: 'key-xxxxx' } }
 *
 * OR with API key style:
 *   { type: 'provider', name: 'mailgun', domain: '...',
 *     apiKey: 'key-xxxxx', mailgunDomain: 'mg.domain.com' }
 */

const _transporters = new Map();

function getTransporter(transport) {
  const key = `mailgun:${transport.domain}`;

  if (_transporters.has(key)) {
    return _transporters.get(key);
  }

  // Determine auth credentials
  let user, pass;
  if (transport.credentials) {
    user = transport.credentials.user;
    pass = transport.credentials.pass;
  } else if (transport.apiKey) {
    user = `postmaster@${transport.mailgunDomain || transport.domain}`;
    pass = transport.apiKey;
  }

  const region = transport.region || 'us';
  const host = region === 'eu' ? 'smtp.eu.mailgun.org' : 'smtp.mailgun.org';

  const transporter = nodemailer.createTransport({
    host,
    port: 587,
    secure: false,
    auth: { user, pass },
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
      via: 'mailgun'
    };
  } catch (err) {
    throw new ElxTransportError(
      `Mailgun send failed for ${transport.domain}: ${err.message}`,
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
    return { status: 'connected', type: 'mailgun', domain: transport.domain, latency: `${Date.now() - start}ms` };
  } catch (err) {
    return { status: 'failed', type: 'mailgun', domain: transport.domain, error: err.message };
  }
}

function closeAll() {
  for (const t of _transporters.values()) t.close();
  _transporters.clear();
}

module.exports = { send, testConnection, closeAll };
