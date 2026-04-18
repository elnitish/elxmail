'use strict';

const crypto = require('crypto');

/**
 * Cryptographic utilities for DKIM key generation, hashing, and ID generation.
 */

/**
 * Generate an RSA 2048-bit key pair for DKIM signing.
 * @returns {{ publicKey: string, privateKey: string }}
 */
function generateDKIMKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  return { publicKey, privateKey };
}

/**
 * Extract the base64 public key from a PEM formatted key.
 * Used to generate the DNS TXT record value for DKIM.
 * @param {string} pem - PEM formatted public key
 * @returns {string} - base64 encoded key without headers
 */
function extractPublicKeyBase64(pem) {
  return pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
}

/**
 * Generate a unique message ID for email tracking.
 * Format: <timestamp.random@domain>
 * @param {string} domain
 * @returns {string}
 */
function generateMessageId(domain) {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(8).toString('hex');
  return `<${timestamp}.${random}@${domain}>`;
}

/**
 * Generate a unique email tracking ID.
 * @returns {string}
 */
function generateTrackingId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * SHA-256 hash a string.
 * @param {string} input
 * @returns {string}
 */
function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * MurmurHash3-like hash for bloom filter.
 * Returns two hash values for double-hashing.
 * @param {string} key
 * @param {number} seed
 * @returns {number}
 */
function hashForBloom(key, seed = 0) {
  const hash = crypto.createHash('md5').update(key + seed).digest();
  return hash.readUInt32LE(0);
}

module.exports = {
  generateDKIMKeyPair,
  extractPublicKeyBase64,
  generateMessageId,
  generateTrackingId,
  sha256,
  hashForBloom
};
