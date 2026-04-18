'use strict';

/**
 * SMTP response code parser.
 * Extracts status code, enhanced status code, and human-readable message
 * from SMTP response strings.
 *
 * Examples:
 *   "550 5.1.1 The email account does not exist" → { code: 550, enhanced: '5.1.1', message: '...' }
 *   "421 4.7.0 Try again later" → { code: 421, enhanced: '4.7.0', message: '...' }
 */

/**
 * Parse an SMTP response string.
 *
 * @param {string} response - Raw SMTP response
 * @returns {{ code: number, enhanced: string|null, message: string }}
 */
function parse(response) {
  if (!response || typeof response !== 'string') {
    return { code: 0, enhanced: null, message: '' };
  }

  const trimmed = response.trim();

  // Match: 3-digit code, optional enhanced status code (X.X.X), rest is message
  const match = trimmed.match(/^(\d{3})[\s-]+(?:(\d\.\d{1,3}\.\d{1,3})\s+)?(.*)$/s);

  if (match) {
    return {
      code: parseInt(match[1], 10),
      enhanced: match[2] || null,
      message: match[3].trim()
    };
  }

  // Fallback: just try to extract a 3-digit code
  const codeMatch = trimmed.match(/(\d{3})/);
  return {
    code: codeMatch ? parseInt(codeMatch[1], 10) : 0,
    enhanced: null,
    message: trimmed
  };
}

module.exports = { parse };
