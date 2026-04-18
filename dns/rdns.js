'use strict';

const { reverse } = require('./resolver');

/**
 * Reverse DNS (rDNS) checker.
 * Verifies that each sending IP has a reverse DNS record
 * pointing back to one of the configured domains.
 */

/**
 * Check rDNS for an IP.
 *
 * @param {string} ip
 * @param {string[]} expectedDomains - Domains that should match
 * @param {number} [timeout=5000]
 * @returns {Promise<Object>} - { status, message, hostnames, matched }
 */
async function checkRDNS(ip, expectedDomains = [], timeout = 5000) {
  try {
    const hostnames = await reverse(ip, timeout);

    if (hostnames.length === 0) {
      return {
        status: 'fail',
        message: `No rDNS record found for ${ip}`,
        hostnames: [],
        matched: null
      };
    }

    // Check if any hostname matches an expected domain
    if (expectedDomains.length > 0) {
      const matched = hostnames.find(h =>
        expectedDomains.some(d => h === d || h.endsWith('.' + d))
      );

      if (matched) {
        return {
          status: 'pass',
          message: `rDNS for ${ip} resolves to ${matched}`,
          hostnames,
          matched
        };
      }

      return {
        status: 'warn',
        message: `rDNS for ${ip} resolves to ${hostnames[0]} (not matching configured domains)`,
        hostnames,
        matched: null
      };
    }

    return {
      status: 'pass',
      message: `rDNS for ${ip} resolves to ${hostnames[0]}`,
      hostnames,
      matched: hostnames[0]
    };

  } catch (err) {
    return {
      status: 'error',
      message: `rDNS check failed for ${ip}: ${err.message}`,
      hostnames: [],
      matched: null
    };
  }
}

module.exports = { checkRDNS };
