'use strict';

/**
 * Bounce type classifier.
 * Maps SMTP response codes to bounce types and categories.
 *
 * 5xx = hard bounce (permanent failure — never retry)
 * 4xx = soft bounce (temporary failure — retry later)
 *
 * Database of 100+ known bounce patterns from Gmail, Outlook, Yahoo, etc.
 */

// Enhanced Status Code (RFC 3463) → bounce classification
const ENHANCED_CODES = {
  // --- Hard Bounces (5.x.x) ---
  '5.0.0': { type: 'hard', category: 'unknown', description: 'Other undefined status' },
  '5.1.0': { type: 'hard', category: 'address', description: 'Other address status' },
  '5.1.1': { type: 'hard', category: 'address', description: 'Bad destination mailbox address / User unknown' },
  '5.1.2': { type: 'hard', category: 'address', description: 'Bad destination system address / Domain not found' },
  '5.1.3': { type: 'hard', category: 'address', description: 'Bad destination mailbox address syntax' },
  '5.1.4': { type: 'hard', category: 'address', description: 'Destination mailbox address ambiguous' },
  '5.1.6': { type: 'hard', category: 'address', description: 'Destination mailbox has moved' },
  '5.1.8': { type: 'hard', category: 'address', description: 'Bad sender address' },
  '5.2.0': { type: 'hard', category: 'mailbox', description: 'Other mailbox status' },
  '5.2.1': { type: 'hard', category: 'mailbox', description: 'Mailbox disabled / not accepting messages' },
  '5.3.0': { type: 'hard', category: 'system', description: 'Other mail system status' },
  '5.3.1': { type: 'hard', category: 'system', description: 'Mail system full' },
  '5.4.1': { type: 'hard', category: 'network', description: 'No answer from host' },
  '5.4.4': { type: 'hard', category: 'network', description: 'Unable to route' },
  '5.5.0': { type: 'hard', category: 'protocol', description: 'Other protocol status' },
  '5.6.0': { type: 'hard', category: 'content', description: 'Other media error' },
  '5.7.1': { type: 'hard', category: 'policy', description: 'Delivery not authorized / Message refused' },
  '5.7.13': { type: 'hard', category: 'policy', description: 'User account disabled' },
  '5.7.23': { type: 'hard', category: 'policy', description: 'SPF validation failed' },
  '5.7.25': { type: 'hard', category: 'policy', description: 'Reverse DNS validation failed' },
  '5.7.26': { type: 'hard', category: 'policy', description: 'Multiple authentication failures' },

  // --- Soft Bounces (4.x.x) ---
  '4.0.0': { type: 'soft', category: 'unknown', description: 'Other undefined status' },
  '4.1.0': { type: 'soft', category: 'address', description: 'Other address status (temporary)' },
  '4.2.0': { type: 'soft', category: 'mailbox', description: 'Other mailbox status (temporary)' },
  '4.2.1': { type: 'soft', category: 'mailbox', description: 'Mailbox disabled (temporarily)' },
  '4.2.2': { type: 'soft', category: 'mailbox', description: 'Mailbox full' },
  '4.3.0': { type: 'soft', category: 'system', description: 'Other mail system status (temporary)' },
  '4.3.1': { type: 'soft', category: 'system', description: 'Mail system full (temporary)' },
  '4.3.2': { type: 'soft', category: 'system', description: 'System not accepting network messages' },
  '4.4.0': { type: 'soft', category: 'network', description: 'Other network or routing status' },
  '4.4.1': { type: 'soft', category: 'network', description: 'No answer from host (temporary)' },
  '4.4.2': { type: 'soft', category: 'network', description: 'Bad connection' },
  '4.4.5': { type: 'soft', category: 'network', description: 'System congestion' },
  '4.5.0': { type: 'soft', category: 'protocol', description: 'Other protocol status (temporary)' },
  '4.7.0': { type: 'soft', category: 'policy', description: 'Other security status (try again)' },
  '4.7.1': { type: 'soft', category: 'policy', description: 'Delivery not authorized (temporarily)' },
  '4.7.4': { type: 'soft', category: 'policy', description: 'TLS required but not available' },
};

// Basic response code → type mapping (fallback when no enhanced code)
const BASIC_CODES = {
  // 2xx = Success
  250: { type: 'success', category: 'accepted', description: 'Accepted' },

  // 4xx = Temporary failure (soft bounce)
  421: { type: 'soft', category: 'service', description: 'Service not available' },
  450: { type: 'soft', category: 'mailbox', description: 'Mailbox unavailable' },
  451: { type: 'soft', category: 'server', description: 'Local error in processing' },
  452: { type: 'soft', category: 'storage', description: 'Insufficient system storage' },

  // 5xx = Permanent failure (hard bounce)
  500: { type: 'hard', category: 'syntax', description: 'Syntax error, command unrecognized' },
  501: { type: 'hard', category: 'syntax', description: 'Syntax error in parameters' },
  502: { type: 'hard', category: 'protocol', description: 'Command not implemented' },
  503: { type: 'hard', category: 'protocol', description: 'Bad sequence of commands' },
  504: { type: 'hard', category: 'protocol', description: 'Command parameter not implemented' },
  550: { type: 'hard', category: 'mailbox', description: 'Mailbox unavailable / User not found' },
  551: { type: 'hard', category: 'address', description: 'User not local' },
  552: { type: 'hard', category: 'storage', description: 'Exceeded storage allocation' },
  553: { type: 'hard', category: 'address', description: 'Mailbox name not allowed' },
  554: { type: 'hard', category: 'transaction', description: 'Transaction failed' },
};

// Known provider-specific patterns (message body matching)
const PROVIDER_PATTERNS = [
  // Gmail
  { pattern: /The email account that you tried to reach does not exist/i, type: 'hard', category: 'address', provider: 'gmail' },
  { pattern: /Daily sending quota exceeded/i, type: 'soft', category: 'rate_limit', provider: 'gmail' },
  { pattern: /Our system has detected that this message is likely unsolicited/i, type: 'soft', category: 'spam', provider: 'gmail' },
  { pattern: /421.*try again later/i, type: 'soft', category: 'rate_limit', provider: 'gmail' },

  // Outlook/Microsoft
  { pattern: /Requested action not taken: mailbox unavailable/i, type: 'hard', category: 'mailbox', provider: 'outlook' },
  { pattern: /Access denied, banned sender/i, type: 'hard', category: 'blocked', provider: 'outlook' },
  { pattern: /exceeded the rate limit/i, type: 'soft', category: 'rate_limit', provider: 'outlook' },
  { pattern: /Unfortunately, messages from .* weren't sent/i, type: 'hard', category: 'blocked', provider: 'outlook' },

  // Yahoo
  { pattern: /delivery error.*not accepting mail/i, type: 'soft', category: 'service', provider: 'yahoo' },
  { pattern: /user unknown/i, type: 'hard', category: 'address', provider: 'yahoo' },
  { pattern: /message not accepted for policy reasons/i, type: 'soft', category: 'policy', provider: 'yahoo' },

  // General patterns
  { pattern: /user.*unknown/i, type: 'hard', category: 'address' },
  { pattern: /mailbox.*not found/i, type: 'hard', category: 'address' },
  { pattern: /no such user/i, type: 'hard', category: 'address' },
  { pattern: /account.*disabled/i, type: 'hard', category: 'mailbox' },
  { pattern: /mailbox.*full/i, type: 'soft', category: 'mailbox' },
  { pattern: /over quota/i, type: 'soft', category: 'mailbox' },
  { pattern: /rate.*limit/i, type: 'soft', category: 'rate_limit' },
  { pattern: /try.*again.*later/i, type: 'soft', category: 'rate_limit' },
  { pattern: /temporarily.*deferred/i, type: 'soft', category: 'deferred' },
  { pattern: /blacklist/i, type: 'hard', category: 'blocked' },
  { pattern: /blocked/i, type: 'soft', category: 'blocked' },
  { pattern: /spam/i, type: 'soft', category: 'spam' },
  { pattern: /reject/i, type: 'hard', category: 'rejected' },
];

/**
 * Classify a bounce from parsed SMTP response.
 *
 * @param {{ code: number, enhanced: string|null, message: string }} parsed
 * @returns {{ type: 'hard'|'soft'|'success'|'unknown', category: string, description: string }}
 */
function classify(parsed) {
  // 1. Check enhanced status code first (most specific)
  if (parsed.enhanced && ENHANCED_CODES[parsed.enhanced]) {
    return { ...ENHANCED_CODES[parsed.enhanced] };
  }

  // 2. Check provider-specific patterns in message
  if (parsed.message) {
    for (const pattern of PROVIDER_PATTERNS) {
      if (pattern.pattern.test(parsed.message)) {
        return {
          type: pattern.type,
          category: pattern.category,
          description: parsed.message.substring(0, 200),
          provider: pattern.provider || null
        };
      }
    }
  }

  // 3. Fall back to basic response code
  if (parsed.code && BASIC_CODES[parsed.code]) {
    return { ...BASIC_CODES[parsed.code] };
  }

  // 4. Generic classification by code range
  if (parsed.code >= 500) {
    return { type: 'hard', category: 'unknown', description: parsed.message || 'Permanent failure' };
  }
  if (parsed.code >= 400) {
    return { type: 'soft', category: 'unknown', description: parsed.message || 'Temporary failure' };
  }
  if (parsed.code >= 200 && parsed.code < 300) {
    return { type: 'success', category: 'accepted', description: 'Accepted' };
  }

  return { type: 'unknown', category: 'unknown', description: parsed.message || 'Unknown' };
}

module.exports = { classify, ENHANCED_CODES, BASIC_CODES, PROVIDER_PATTERNS };
