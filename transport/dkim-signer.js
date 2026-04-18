'use strict';

const fs = require('fs');
const path = require('path');
const { ElxTransportError } = require('../errors');

/**
 * DKIM signing module.
 * Reads private keys from disk and produces DKIM signing options
 * compatible with nodemailer's dkim configuration.
 *
 * nodemailer handles the actual DKIM-Signature header generation
 * internally — we just provide it the key material and config.
 */

// Cache of loaded private keys per domain
const _keys = new Map();

/**
 * Load and cache a DKIM private key for a domain.
 *
 * @param {string} domain - Sending domain
 * @param {string} keyPath - Path to PEM private key file
 * @returns {string} - PEM private key contents
 */
function loadKey(domain, keyPath) {
  if (_keys.has(domain)) {
    return _keys.get(domain);
  }

  const resolvedPath = path.resolve(keyPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new ElxTransportError(`DKIM private key not found for ${domain}: ${resolvedPath}`, {
      domain,
      keyPath: resolvedPath
    });
  }

  const key = fs.readFileSync(resolvedPath, 'utf8');

  if (!key.includes('PRIVATE KEY')) {
    throw new ElxTransportError(`DKIM key file for ${domain} is not a valid PEM private key`, {
      domain,
      keyPath: resolvedPath
    });
  }

  _keys.set(domain, key);
  return key;
}

/**
 * Get DKIM signing options for nodemailer.
 * Returns the config object that gets passed as message.dkim to nodemailer.
 *
 * @param {string} domain - Sending domain
 * @param {Object} dkimConfig - DKIM config from store ({ selector, keys })
 * @returns {Object|null} - nodemailer DKIM options or null if not configured
 */
function getSigningOptions(domain, dkimConfig) {
  if (!dkimConfig || !dkimConfig.keys || !dkimConfig.keys[domain]) {
    return null;
  }

  const privateKey = loadKey(domain, dkimConfig.keys[domain]);

  return {
    domainName: domain,
    keySelector: dkimConfig.selector || 'elx',
    privateKey
  };
}

/**
 * Clear the key cache. Used in shutdown/testing.
 */
function clearKeys() {
  _keys.clear();
}

module.exports = { getSigningOptions, loadKey, clearKeys };
