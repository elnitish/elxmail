'use strict';

const { resolveTxt } = require('./resolver');

/**
 * DKIM record checker.
 * Queries selector._domainkey.domain TXT record and validates
 * that the public key exists.
 */

/**
 * Check DKIM record for a domain.
 *
 * @param {string} domain
 * @param {string} [selector='elx'] - DKIM selector
 * @param {number} [timeout=5000]
 * @returns {Promise<Object>} - { status, message, record, publicKey }
 */
async function checkDKIM(domain, selector = 'elx', timeout = 5000) {
  const dkimDomain = `${selector}._domainkey.${domain}`;

  try {
    const records = await resolveTxt(dkimDomain, timeout);
    const dkimRecord = records.find(r => r.includes('v=DKIM1') || r.includes('k=rsa') || r.includes('p='));

    if (!dkimRecord) {
      return {
        status: 'fail',
        message: `No DKIM record found at ${dkimDomain}`,
        record: null,
        publicKey: null
      };
    }

    // Extract public key
    const keyMatch = dkimRecord.match(/p=([A-Za-z0-9+/=]*)/);
    const publicKey = keyMatch ? keyMatch[1] : null;

    if (!publicKey || publicKey.length < 10) {
      return {
        status: 'fail',
        message: 'DKIM record found but public key is empty or invalid',
        record: dkimRecord,
        publicKey: null
      };
    }

    return {
      status: 'pass',
      message: 'DKIM record valid',
      record: dkimRecord,
      publicKey
    };

  } catch (err) {
    return {
      status: 'error',
      message: `DKIM check failed: ${err.message}`,
      record: null,
      publicKey: null
    };
  }
}

module.exports = { checkDKIM };
