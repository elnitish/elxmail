'use strict';

const { checkSPF } = require('./spf');
const { checkDKIM } = require('./dkim');
const { checkDMARC } = require('./dmarc');
const { checkRDNS } = require('./rdns');

/**
 * Unified DNS health report.
 * Runs all 4 checks (SPF, DKIM, DMARC, rDNS) across all domains
 * and returns a comprehensive per-domain report.
 *
 * This is what elxmail.validateDNS() calls.
 */

/**
 * Run full DNS health check on all configured transports.
 *
 * @param {Object[]} transports - Transport configs from store
 * @param {Object} [dkimConfig] - DKIM config (selector)
 * @param {number} [timeout=5000]
 * @returns {Promise<Object>} - Per-domain health report
 */
async function checkHealth(transports, dkimConfig = {}, timeout = 5000) {
  const selector = dkimConfig.selector || 'elx';
  const domains = [...new Set(transports.map(t => t.domain))];
  const allDomains = domains;

  // Collect all IPs
  const ipToDomains = new Map();
  for (const t of transports) {
    if (t.bindIP) {
      if (!ipToDomains.has(t.bindIP)) ipToDomains.set(t.bindIP, []);
      ipToDomains.get(t.bindIP).push(t.domain);
    }
  }

  const report = {};
  let passCount = 0;
  let failCount = 0;
  let warnCount = 0;

  // Run checks for each domain (in parallel)
  const checks = domains.map(async (domain) => {
    const ips = transports.filter(t => t.domain === domain && t.bindIP).map(t => t.bindIP);

    const [spf, dkim, dmarc] = await Promise.all([
      checkSPF(domain, ips, timeout),
      checkDKIM(domain, selector, timeout),
      checkDMARC(domain, timeout)
    ]);

    // rDNS for associated IPs
    const rdnsResults = {};
    for (const ip of ips) {
      rdnsResults[ip] = await checkRDNS(ip, allDomains, timeout);
    }

    report[domain] = { spf, dkim, dmarc, rdns: rdnsResults };

    // Count statuses
    for (const check of [spf, dkim, dmarc]) {
      if (check.status === 'pass') passCount++;
      else if (check.status === 'fail') failCount++;
      else warnCount++;
    }
  });

  await Promise.all(checks);

  return {
    domains: report,
    summary: {
      totalDomains: domains.length,
      checks: { pass: passCount, fail: failCount, warn: warnCount },
      healthy: failCount === 0
    }
  };
}

module.exports = { checkHealth };
