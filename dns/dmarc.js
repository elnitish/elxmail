'use strict';

const { resolveTxt } = require('./resolver');

/**
 * DMARC record checker.
 * Queries _dmarc.domain TXT record and parses the policy.
 */

/**
 * Check DMARC record for a domain.
 *
 * @param {string} domain
 * @param {number} [timeout=5000]
 * @returns {Promise<Object>} - { status, message, record, policy }
 */
async function checkDMARC(domain, timeout = 5000) {
  const dmarcDomain = `_dmarc.${domain}`;

  try {
    const records = await resolveTxt(dmarcDomain, timeout);
    const dmarcRecord = records.find(r => r.startsWith('v=DMARC1'));

    if (!dmarcRecord) {
      return {
        status: 'fail',
        message: 'No DMARC record found',
        record: null,
        policy: null
      };
    }

    // Parse policy
    const policy = parseDMARC(dmarcRecord);

    return {
      status: 'pass',
      message: `DMARC record found with policy: ${policy.p}`,
      record: dmarcRecord,
      policy
    };

  } catch (err) {
    return {
      status: 'error',
      message: `DMARC check failed: ${err.message}`,
      record: null,
      policy: null
    };
  }
}

/**
 * Parse DMARC record into policy object.
 * e.g., "v=DMARC1; p=quarantine; rua=mailto:dmarc@domain.com"
 */
function parseDMARC(record) {
  const parts = record.split(';').map(s => s.trim());
  const policy = {};

  for (const part of parts) {
    const [key, ...valParts] = part.split('=');
    if (key && valParts.length > 0) {
      policy[key.trim()] = valParts.join('=').trim();
    }
  }

  return {
    version: policy.v || 'DMARC1',
    p: policy.p || 'none',           // policy: none, quarantine, reject
    sp: policy.sp || policy.p || 'none', // subdomain policy
    pct: parseInt(policy.pct || '100', 10), // percentage of messages to filter
    rua: policy.rua || null,         // aggregate report URI
    ruf: policy.ruf || null,         // forensic report URI
    adkim: policy.adkim || 'r',      // DKIM alignment: r(elaxed) or s(trict)
    aspf: policy.aspf || 'r'         // SPF alignment: r(elaxed) or s(trict)
  };
}

module.exports = { checkDMARC, parseDMARC };
