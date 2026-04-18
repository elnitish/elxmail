'use strict';

const dns = require('dns').promises;

/**
 * MX record resolver with timeout.
 * Queries MX records for a domain and returns them sorted by priority.
 */

/**
 * Resolve MX records for a domain.
 * @param {string} domain
 * @param {number} [timeout=5000] - Timeout in ms
 * @returns {Promise<Array<{exchange: string, priority: number}>>}
 */
async function resolveMX(domain, timeout = 5000) {
  try {
    const records = await withTimeout(dns.resolveMx(domain), timeout);
    // Sort by priority (lower = preferred)
    return records.sort((a, b) => a.priority - b.priority);
  } catch (err) {
    if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') {
      return [];
    }
    throw err;
  }
}

/**
 * Wrap a promise with a timeout.
 */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('DNS timeout')), ms);
    promise
      .then(val => { clearTimeout(timer); resolve(val); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

module.exports = { resolveMX };
