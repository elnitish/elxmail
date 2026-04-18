'use strict';

const { checkKnownDomain, matchMXPattern } = require('./providers');
const { resolveMX } = require('./mx-resolver');
const { LRUCache } = require('./cache');
const { extractDomain } = require('../utils/email-parser');

/**
 * Provider Classifier.
 * Classifies recipient email provider using a two-tier approach:
 *
 * 1. Fast path: Check hardcoded known domains (gmail.com, outlook.com, etc.)
 * 2. Slow path: MX lookup → pattern match → cache result
 *
 * Algorithm:
 *   extractDomain(email) → check KNOWN_DOMAINS → check LRU cache
 *   → MX lookup → match MX patterns → cache result → return provider
 */

const _cache = new LRUCache(10000);

/**
 * Classify an email address's provider.
 *
 * @param {string} email - Recipient email address
 * @param {number} [timeout=5000] - DNS timeout in ms
 * @returns {Promise<string>} - Provider name ('gmail', 'outlook', 'google_workspace', 'unknown', etc.)
 */
async function classify(email, timeout = 5000) {
  const domain = extractDomain(email);
  if (!domain) return 'unknown';

  return classifyDomain(domain, timeout);
}

/**
 * Classify a domain's email provider.
 *
 * @param {string} domain
 * @param {number} [timeout=5000]
 * @returns {Promise<string>}
 */
async function classifyDomain(domain, timeout = 5000) {
  // Fast path: known freemail domains
  const known = checkKnownDomain(domain);
  if (known) return known;

  // Check cache
  const cached = _cache.get(domain);
  if (cached) return cached;

  // Slow path: MX lookup
  try {
    const mxRecords = await resolveMX(domain, timeout);

    if (mxRecords.length === 0) {
      _cache.set(domain, 'unknown');
      return 'unknown';
    }

    // Check each MX record against known patterns
    for (const mx of mxRecords) {
      const provider = matchMXPattern(mx.exchange);
      if (provider) {
        _cache.set(domain, provider);
        return provider;
      }
    }

    // No pattern match — self-hosted or unknown provider
    _cache.set(domain, 'self_hosted');
    return 'self_hosted';

  } catch (err) {
    // DNS failure — don't cache errors, return unknown
    return 'unknown';
  }
}

/**
 * Get the provider group for throttling purposes.
 * Maps specific providers to their parent group.
 * e.g., google_workspace → gmail (same rate limits)
 *
 * @param {string} provider
 * @returns {string} - Throttle group name
 */
function getThrottleGroup(provider) {
  switch (provider) {
    case 'gmail':
    case 'google_workspace':
      return 'gmail';
    case 'outlook':
    case 'microsoft365':
      return 'outlook';
    case 'yahoo':
      return 'yahoo';
    default:
      return 'default';
  }
}

/**
 * Clear the provider cache.
 */
function clearCache() {
  _cache.clear();
}

/**
 * Get cache stats.
 */
function cacheStats() {
  return { size: _cache.size };
}

module.exports = { classify, classifyDomain, getThrottleGroup, clearCache, cacheStats };
