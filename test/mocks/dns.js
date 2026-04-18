'use strict';

/**
 * Mock DNS resolver for testing.
 * Returns predefined SPF, DKIM, DMARC, and MX records
 * without hitting the network.
 */

const _records = {
  txt: {},
  mx: {},
  reverse: {}
};

/**
 * Set up mock TXT records for a domain.
 * @param {string} domain
 * @param {string[]} records
 */
function setTXT(domain, records) {
  _records.txt[domain] = records;
}

/**
 * Set up mock MX records for a domain.
 * @param {string} domain
 * @param {Array<{exchange: string, priority: number}>} records
 */
function setMX(domain, records) {
  _records.mx[domain] = records;
}

/**
 * Set up mock reverse DNS for an IP.
 * @param {string} ip
 * @param {string[]} hostnames
 */
function setReverse(ip, hostnames) {
  _records.reverse[ip] = hostnames;
}

/**
 * Set up a complete mock DNS environment for a domain.
 * @param {string} domain
 * @param {Object} opts
 */
function setupDomain(domain, opts = {}) {
  // SPF
  if (opts.spf !== false) {
    const ips = opts.ips || ['1.2.3.4'];
    const spfMechanisms = ips.map(ip => `ip4:${ip}`).join(' ');
    setTXT(domain, [`v=spf1 ${spfMechanisms} ~all`]);
  }

  // DKIM
  if (opts.dkim !== false) {
    const selector = opts.dkimSelector || 'elx';
    setTXT(`${selector}._domainkey.${domain}`, ['v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNAD...']);
  }

  // DMARC
  if (opts.dmarc !== false) {
    setTXT(`_dmarc.${domain}`, [`v=DMARC1; p=${opts.dmarcPolicy || 'none'}; rua=mailto:dmarc@${domain}`]);
  }

  // MX
  if (opts.mx) {
    setMX(domain, opts.mx);
  }

  // rDNS
  if (opts.ips) {
    for (const ip of opts.ips) {
      setReverse(ip, [domain]);
    }
  }
}

/**
 * Clear all mock records.
 */
function reset() {
  _records.txt = {};
  _records.mx = {};
  _records.reverse = {};
}

/**
 * Get mock records (for testing assertions).
 */
function getRecords() {
  return { ..._records };
}

module.exports = { setTXT, setMX, setReverse, setupDomain, reset, getRecords };
