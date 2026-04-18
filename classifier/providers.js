'use strict';

/**
 * Known email provider MX patterns.
 * Maps MX record hostnames to provider names.
 *
 * Fast path: hardcoded domain → provider for common freemail domains.
 * Slow path: MX hostname patterns for corporate/hosted domains.
 */

// Direct domain → provider mapping (fast path, no DNS lookup needed)
const KNOWN_DOMAINS = {
  // Gmail / Google
  'gmail.com': 'gmail',
  'googlemail.com': 'gmail',

  // Outlook / Microsoft
  'outlook.com': 'outlook',
  'hotmail.com': 'outlook',
  'live.com': 'outlook',
  'msn.com': 'outlook',
  'hotmail.co.uk': 'outlook',
  'hotmail.fr': 'outlook',
  'hotmail.de': 'outlook',
  'outlook.co.uk': 'outlook',

  // Yahoo
  'yahoo.com': 'yahoo',
  'yahoo.co.uk': 'yahoo',
  'yahoo.co.in': 'yahoo',
  'yahoo.ca': 'yahoo',
  'yahoo.com.au': 'yahoo',
  'ymail.com': 'yahoo',
  'rocketmail.com': 'yahoo',

  // Apple
  'icloud.com': 'apple',
  'me.com': 'apple',
  'mac.com': 'apple',

  // AOL / Verizon
  'aol.com': 'aol',
  'aim.com': 'aol',

  // ProtonMail
  'protonmail.com': 'protonmail',
  'proton.me': 'protonmail',
  'pm.me': 'protonmail',

  // Zoho
  'zoho.com': 'zoho',
  'zohomail.com': 'zoho',

  // Fastmail
  'fastmail.com': 'fastmail',

  // Yandex
  'yandex.com': 'yandex',
  'yandex.ru': 'yandex',

  // GMX
  'gmx.com': 'gmx',
  'gmx.de': 'gmx',
  'gmx.net': 'gmx',

  // Mail.com
  'mail.com': 'mailcom',

  // Comcast
  'comcast.net': 'comcast',
  'xfinity.com': 'comcast'
};

// MX hostname patterns → provider (slow path, used after MX lookup)
// Order matters — first match wins
const MX_PATTERNS = [
  // Google Workspace (corporate Gmail)
  { pattern: /aspmx\.l\.google\.com$/i, provider: 'google_workspace' },
  { pattern: /google\.com$/i, provider: 'google_workspace' },
  { pattern: /googlemail\.com$/i, provider: 'google_workspace' },

  // Microsoft 365 (corporate Outlook)
  { pattern: /\.protection\.outlook\.com$/i, provider: 'microsoft365' },
  { pattern: /\.mail\.protection\.outlook\.com$/i, provider: 'microsoft365' },
  { pattern: /outlook\.com$/i, provider: 'microsoft365' },

  // Yahoo (including business)
  { pattern: /\.yahoodns\.net$/i, provider: 'yahoo' },
  { pattern: /yahoo\.com$/i, provider: 'yahoo' },

  // Apple
  { pattern: /\.icloud\.com$/i, provider: 'apple' },
  { pattern: /\.apple\.com$/i, provider: 'apple' },

  // Zoho
  { pattern: /\.zoho\.com$/i, provider: 'zoho' },

  // ProtonMail
  { pattern: /\.protonmail\.ch$/i, provider: 'protonmail' },

  // Fastmail
  { pattern: /\.fastmail\.com$/i, provider: 'fastmail' },
  { pattern: /\.messagingengine\.com$/i, provider: 'fastmail' },

  // Mimecast (enterprise filtering)
  { pattern: /\.mimecast\.com$/i, provider: 'mimecast' },

  // Barracuda (enterprise filtering)
  { pattern: /\.barracudanetworks\.com$/i, provider: 'barracuda' },

  // Proofpoint (enterprise filtering)
  { pattern: /\.pphosted\.com$/i, provider: 'proofpoint' },

  // Amazon WorkMail
  { pattern: /\.awsapps\.com$/i, provider: 'amazon_workmail' },

  // GoDaddy
  { pattern: /\.secureserver\.net$/i, provider: 'godaddy' },

  // OVH
  { pattern: /\.ovh\.net$/i, provider: 'ovh' },

  // Rackspace
  { pattern: /\.emailsrvr\.com$/i, provider: 'rackspace' },

  // Yandex
  { pattern: /\.yandex\.(net|ru)$/i, provider: 'yandex' }
];

/**
 * Check if a domain is a known freemail provider.
 * @param {string} domain - Email domain
 * @returns {string|null} - Provider name or null
 */
function checkKnownDomain(domain) {
  return KNOWN_DOMAINS[domain.toLowerCase()] || null;
}

/**
 * Match an MX hostname against known patterns.
 * @param {string} mxHost - MX record hostname
 * @returns {string|null} - Provider name or null
 */
function matchMXPattern(mxHost) {
  for (const { pattern, provider } of MX_PATTERNS) {
    if (pattern.test(mxHost)) {
      return provider;
    }
  }
  return null;
}

module.exports = { KNOWN_DOMAINS, MX_PATTERNS, checkKnownDomain, matchMXPattern };
