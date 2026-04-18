'use strict';

const tls = require('tls');
const crypto = require('crypto');

/**
 * TLS negotiation manager for SMTP connections.
 *
 * Supports two modes:
 *   - Opportunistic (default): Try STARTTLS, fall back to plain if server doesn't support it
 *   - Strict: Require TLS or fail — no plaintext fallback
 *
 * Also handles:
 *   - Certificate validation options
 *   - Minimum TLS version enforcement
 *   - Cipher suite selection
 */

/**
 * Build TLS options for nodemailer based on transport config.
 *
 * @param {Object} transport - Transport config
 * @param {Object} [tlsConfig] - Additional TLS overrides
 * @returns {Object} - TLS options for nodemailer
 */
function buildTLSOptions(transport, tlsConfig = {}) {
  const mode = tlsConfig.mode || transport.tlsMode || 'opportunistic';
  const opts = {};

  if (mode === 'strict') {
    // Strict mode: require TLS, validate certs
    opts.secure = transport.port === 465;
    opts.requireTLS = true;
    opts.tls = {
      rejectUnauthorized: true,
      minVersion: tlsConfig.minVersion || 'TLSv1.2'
    };
  } else {
    // Opportunistic mode: try TLS, accept self-signed
    opts.secure = transport.port === 465;
    opts.tls = {
      rejectUnauthorized: false
    };
    // Don't set requireTLS — nodemailer will try STARTTLS if advertised
  }

  // Custom cipher suites
  if (tlsConfig.ciphers) {
    opts.tls.ciphers = tlsConfig.ciphers;
  }

  // Custom CA certificates
  if (tlsConfig.ca) {
    opts.tls.ca = tlsConfig.ca;
  }

  // Client certificate authentication (rare but some relays require it)
  if (tlsConfig.cert && tlsConfig.key) {
    opts.tls.cert = tlsConfig.cert;
    opts.tls.key = tlsConfig.key;
  }

  return opts;
}

/**
 * Check if a server supports STARTTLS.
 * Connects on port 587, sends EHLO, looks for STARTTLS in response.
 *
 * @param {string} host - SMTP server hostname
 * @param {number} [port=587]
 * @param {number} [timeout=10000]
 * @returns {Promise<{ supported: boolean, version: string|null, cipher: string|null }>}
 */
async function checkSTARTTLS(host, port = 587, timeout = 10000) {
  const net = require('net');

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let data = '';
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve({ supported: false, version: null, cipher: null, error: 'timeout' });
      }
    }, timeout);

    socket.on('data', (chunk) => {
      data += chunk.toString();

      // After receiving greeting and EHLO response, check for STARTTLS
      if (data.includes('250 ') && !resolved) {
        const supported = /STARTTLS/i.test(data);
        resolved = true;
        clearTimeout(timer);
        socket.destroy();
        resolve({ supported, version: null, cipher: null });
      }
    });

    socket.on('connect', () => {
      // Wait for greeting, then send EHLO
      setTimeout(() => {
        socket.write('EHLO elxmail.local\r\n');
      }, 500);
    });

    socket.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({ supported: false, version: null, cipher: null, error: err.message });
      }
    });
  });
}

/**
 * Get information about the TLS connection to a server.
 *
 * @param {string} host
 * @param {number} [port=465] - Use 465 for direct TLS
 * @param {number} [timeout=10000]
 * @returns {Promise<Object>}
 */
async function getTLSInfo(host, port = 465, timeout = 10000) {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host,
      port,
      rejectUnauthorized: false,
      timeout
    }, () => {
      const cipher = socket.getCipher();
      const protocol = socket.getProtocol();
      const cert = socket.getPeerCertificate();

      resolve({
        connected: true,
        protocol,
        cipher: cipher ? cipher.name : null,
        cipherVersion: cipher ? cipher.version : null,
        certSubject: cert ? cert.subject : null,
        certIssuer: cert ? cert.issuer : null,
        certValid: cert ? !cert.expired : null,
        certExpiry: cert ? cert.valid_to : null
      });

      socket.destroy();
    });

    socket.on('error', (err) => {
      resolve({
        connected: false,
        error: err.message
      });
    });

    socket.setTimeout(timeout, () => {
      resolve({ connected: false, error: 'timeout' });
      socket.destroy();
    });
  });
}

module.exports = { buildTLSOptions, checkSTARTTLS, getTLSInfo };
