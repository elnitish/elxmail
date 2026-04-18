'use strict';

/**
 * Email validation and domain extraction.
 * Uses a practical RFC 5322 subset — not pedantic, but catches real issues.
 */

// Practical email regex — covers 99.9% of real-world emails
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Validate an email address.
 * @param {string} email
 * @returns {boolean}
 */
function isValid(email) {
  if (!email || typeof email !== 'string') return false;
  if (email.length > 254) return false;   // RFC 5321 max length
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  if (parts[0].length > 64) return false; // local part max length
  return EMAIL_REGEX.test(email);
}

/**
 * Extract the domain from an email address.
 * @param {string} email
 * @returns {string|null}
 */
function extractDomain(email) {
  if (!email || typeof email !== 'string') return null;
  const idx = email.lastIndexOf('@');
  if (idx === -1) return null;
  return email.slice(idx + 1).toLowerCase();
}

/**
 * Normalize an email address — lowercase and trim.
 * @param {string} email
 * @returns {string}
 */
function normalize(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

module.exports = { isValid, extractDomain, normalize };
