'use strict';

/**
 * LRU (Least Recently Used) cache for provider lookups.
 * Once acmecorp.com is resolved to google_workspace, it's cached
 * so subsequent emails to that domain don't trigger DNS lookups.
 */
class LRUCache {
  /**
   * @param {number} [maxSize=10000] - Maximum entries before eviction
   */
  constructor(maxSize = 10000) {
    this._maxSize = maxSize;
    this._map = new Map(); // Map preserves insertion order
  }

  /**
   * Get a value and mark it as recently used.
   * @param {string} key
   * @returns {*|undefined}
   */
  get(key) {
    if (!this._map.has(key)) return undefined;
    // Move to end (most recently used)
    const value = this._map.get(key);
    this._map.delete(key);
    this._map.set(key, value);
    return value;
  }

  /**
   * Set a value. Evicts oldest if at capacity.
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    if (this._map.has(key)) {
      this._map.delete(key);
    } else if (this._map.size >= this._maxSize) {
      // Evict oldest (first item in Map)
      const oldest = this._map.keys().next().value;
      this._map.delete(oldest);
    }
    this._map.set(key, value);
  }

  /**
   * Check if key exists.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this._map.has(key);
  }

  /**
   * @returns {number}
   */
  get size() {
    return this._map.size;
  }

  /**
   * Clear all entries.
   */
  clear() {
    this._map.clear();
  }
}

module.exports = { LRUCache };
