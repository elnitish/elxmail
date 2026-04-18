'use strict';

/**
 * Shorthand expansion.
 * Converts the simple `domains: [...]` format into the full `transports: [...]` format.
 *
 * Input:
 *   { domains: [{ domain: 'outreach1.com', smtp: { host: '1.2.3.4', port: 587, user: 'me', pass: 'secret' } }] }
 *
 * Output:
 *   { transports: [{ type: 'smtp', domain: 'outreach1.com', host: '1.2.3.4', port: 587, auth: { user: 'me', pass: 'secret' }, tls: true }] }
 */

function expand(config) {
  const expanded = { ...config };

  // If developer used the shorthand `domains` syntax, convert to full `transports`
  if (expanded.domains && !expanded.transports) {
    expanded.transports = expanded.domains.map(d => {
      const transport = {
        type: 'smtp',
        domain: d.domain
      };

      if (d.smtp) {
        transport.host = d.smtp.host;
        transport.port = d.smtp.port || 587;
        transport.auth = {
          user: d.smtp.user,
          pass: d.smtp.pass
        };
        transport.tls = d.smtp.tls !== false;
      }

      if (d.bindIP) {
        transport.bindIP = d.bindIP;
      }

      return transport;
    });

    delete expanded.domains;
  }

  return expanded;
}

module.exports = { expand };
