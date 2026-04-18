'use strict';

const { resolveTxt } = require('./resolver');

/**
 * SPF record validator.
 * Queries TXT records, finds v=spf1 record, parses mechanisms,
 * and checks if the configured IPs are authorized.
 */

/**
 * Check SPF record for a domain.
 *
 * @param {string} domain
 * @param {string[]} [authorizedIPs] - IPs to verify against SPF
 * @param {number} [timeout=5000]
 * @returns {Promise<Object>} - { status, record, mechanisms, ipAuthorized }
 */
async function checkSPF(domain, authorizedIPs = [], timeout = 5000) {
  try {
    const records = await resolveTxt(domain, timeout);
    const spfRecord = records.find(r => r.startsWith('v=spf1'));

    if (!spfRecord) {
      return {
        status: 'fail',
        message: 'No SPF record found',
        record: null,
        mechanisms: [],
        ipAuthorized: {}
      };
    }

    const mechanisms = parseSPF(spfRecord);

    // Check if configured IPs are authorized
    const ipAuthorized = {};
    for (const ip of authorizedIPs) {
      ipAuthorized[ip] = isIPAuthorized(ip, mechanisms);
    }

    const allAuthorized = authorizedIPs.length === 0 ||
      Object.values(ipAuthorized).every(v => v);

    return {
      status: allAuthorized ? 'pass' : 'warn',
      message: allAuthorized ? 'SPF record valid' : 'Some IPs not in SPF record',
      record: spfRecord,
      mechanisms,
      ipAuthorized
    };

  } catch (err) {
    return {
      status: 'error',
      message: `SPF check failed: ${err.message}`,
      record: null,
      mechanisms: [],
      ipAuthorized: {}
    };
  }
}

/**
 * Parse SPF record into mechanisms.
 * e.g., "v=spf1 ip4:1.2.3.4 include:_spf.google.com ~all"
 */
function parseSPF(record) {
  const parts = record.split(/\s+/).slice(1); // skip "v=spf1"
  return parts.map(part => {
    const qualifier = ['+', '-', '~', '?'].includes(part[0]) ? part[0] : '+';
    const mechanism = part.replace(/^[+\-~?]/, '');
    const [type, ...valueParts] = mechanism.split(':');
    return {
      qualifier,
      type: type.toLowerCase(),
      value: valueParts.join(':') || null
    };
  });
}

/**
 * Check if an IP is authorized by SPF mechanisms (basic check).
 */
function isIPAuthorized(ip, mechanisms) {
  for (const m of mechanisms) {
    if (m.type === 'ip4' && m.value) {
      if (m.value.includes('/')) {
        // CIDR notation — basic check
        if (ip.startsWith(m.value.split('/')[0].split('.').slice(0, 3).join('.'))) {
          return m.qualifier === '+';
        }
      } else if (m.value === ip) {
        return m.qualifier === '+';
      }
    }
    if (m.type === 'ip6' && m.value && m.value === ip) {
      return m.qualifier === '+';
    }
    if (m.type === 'all') {
      return m.qualifier === '+';
    }
  }
  return false; // Not found in any mechanism
}

module.exports = { checkSPF, parseSPF };
