'use strict';

const nodemailer = require('nodemailer');
const { ElxTransportError } = require('../../errors');

/**
 * SendGrid transport adapter.
 * Uses SendGrid's SMTP relay interface via nodemailer.
 *
 * Config:
 *   { type: 'provider', name: 'sendgrid', domain: '...', apiKey: 'SG.xxxxx' }
 *
 * SendGrid SMTP credentials:
 *   Username: 'apikey' (literal string)
 *   Password: your API key
 */

const _transporters = new Map();

function getTransporter(transport) {
  const key = `sendgrid:${transport.domain}`;

  if (_transporters.has(key)) {
    return _transporters.get(key);
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    auth: {
      user: 'apikey',
      pass: transport.apiKey || transport.credentials?.apiKey
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
  // SendGrid handles DKIM themselves, but allow override
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
      via: 'sendgrid'
    };
  } catch (err) {
    throw new ElxTransportError(
      `SendGrid send failed for ${transport.domain}: ${err.message}`,
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
    return { status: 'connected', type: 'sendgrid', domain: transport.domain, latency: `${Date.now() - start}ms` };
  } catch (err) {
    return { status: 'failed', type: 'sendgrid', domain: transport.domain, error: err.message };
  }
}

function closeAll() {
  for (const t of _transporters.values()) t.close();
  _transporters.clear();
}

module.exports = { send, testConnection, closeAll };
