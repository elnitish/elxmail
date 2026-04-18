'use strict';

const dns = require('dns').promises;
const { LRUCache } = require('../classifier/cache');

/**
 * DNS resolver with timeout, retry, and caching.
 * Wraps Node's dns.promises for all DNS queries in elxmail.
 */

const _cache = new LRUCache(5000);

/**
 * Resolve TXT records for a domain.
 * @param {string} domain
 * @param {number} [timeout=5000]
 * @returns {Promise<string[]>} - Flattened TXT record strings
 */
async function resolveTxt(domain, timeout = 5000) {
  const cacheKey = `txt:${domain}`;
  const cached = _cache.get(cacheKey);
  if (cached) return cached;

  try {
    const records = await withTimeout(dns.resolveTxt(domain), timeout);
    // TXT records come as arrays of strings — join each record
    const flat = records.map(r => r.join(''));
    _cache.set(cacheKey, flat);
    return flat;
  } catch (err) {
    if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') return [];
    throw err;
  }
}

/**
 * Resolve MX records for a domain.
 * @param {string} domain
 * @param {number} [timeout=5000]
 * @returns {Promise<Array<{exchange: string, priority: number}>>}
 */
async function resolveMx(domain, timeout = 5000) {
  const cacheKey = `mx:${domain}`;
  const cached = _cache.get(cacheKey);
  if (cached) return cached;

  try {
    const records = await withTimeout(dns.resolveMx(domain), timeout);
    const sorted = records.sort((a, b) => a.priority - b.priority);
    _cache.set(cacheKey, sorted);
    return sorted;
  } catch (err) {
    if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') return [];
    throw err;
  }
}

/**
 * Reverse DNS lookup for an IP.
 * @param {string} ip
 * @param {number} [timeout=5000]
 * @returns {Promise<string[]>} - Hostnames
 */
async function reverse(ip, timeout = 5000) {
  const cacheKey = `rdns:${ip}`;
  const cached = _cache.get(cacheKey);
  if (cached) return cached;

  try {
    const hostnames = await withTimeout(dns.reverse(ip), timeout);
    _cache.set(cacheKey, hostnames);
    return hostnames;
  } catch (err) {
    if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') return [];
    throw err;
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('DNS timeout')), ms);
    promise
      .then(val => { clearTimeout(timer); resolve(val); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

function clearCache() {
  _cache.clear();
}

module.exports = { resolveTxt, resolveMx, reverse, clearCache };
