'use strict';

const crypto = require('crypto');

/**
 * Bloom Filter for large suppression lists.
 * Probabilistic data structure — can tell you "definitely not in set"
 * or "probably in set" with a configurable false positive rate.
 *
 * For lists > 100k entries, this sits in front of the actual store.
 * Negative results (not in bloom filter) skip the DB lookup entirely.
 * Only positive results (might be in bloom filter) hit the actual store.
 *
 * Algorithm:
 *   - Uses a bit array of size m
 *   - k hash functions (simulated via double hashing)
 *   - add(item): compute k hashes, set those bits to 1
 *   - check(item): compute k hashes, if ALL bits are 1 → "maybe", else → "definitely not"
 *
 * Optimal parameters for ~1% false positive rate:
 *   m = -n * ln(p) / (ln(2))^2    (bits needed)
 *   k = (m/n) * ln(2)              (hash functions needed)
 *   where n = expected items, p = false positive rate
 */
class BloomFilter {
  /**
   * @param {number} [expectedItems=100000] - Expected number of items
   * @param {number} [falsePositiveRate=0.01] - Target false positive rate (1%)
   */
  constructor(expectedItems = 100000, falsePositiveRate = 0.01) {
    this._n = expectedItems;
    this._p = falsePositiveRate;

    // Calculate optimal bit array size
    this._m = Math.ceil(-this._n * Math.log(this._p) / (Math.log(2) ** 2));

    // Calculate optimal number of hash functions
    this._k = Math.ceil((this._m / this._n) * Math.log(2));

    // Bit array — using Uint8Array (each element holds 8 bits)
    this._bits = new Uint8Array(Math.ceil(this._m / 8));

    this._count = 0;
  }

  /**
   * Add an item to the bloom filter.
   * @param {string} item
   */
  add(item) {
    const hashes = this._getHashes(item);
    for (const h of hashes) {
      const idx = h % this._m;
      this._bits[Math.floor(idx / 8)] |= (1 << (idx % 8));
    }
    this._count++;
  }

  /**
   * Check if an item might be in the set.
   * @param {string} item
   * @returns {boolean} - false = definitely not in set, true = probably in set
   */
  check(item) {
    const hashes = this._getHashes(item);
    for (const h of hashes) {
      const idx = h % this._m;
      if (!(this._bits[Math.floor(idx / 8)] & (1 << (idx % 8)))) {
        return false; // Definitely not in set
      }
    }
    return true; // Probably in set
  }

  /**
   * Generate k hash values using double hashing.
   * h_i(x) = h1(x) + i * h2(x)
   *
   * Uses MD5 for speed (not security-critical).
   * @param {string} item
   * @returns {number[]}
   */
  _getHashes(item) {
    const hash = crypto.createHash('md5').update(item).digest();
    const h1 = hash.readUInt32LE(0);
    const h2 = hash.readUInt32LE(4);

    const hashes = new Array(this._k);
    for (let i = 0; i < this._k; i++) {
      hashes[i] = Math.abs((h1 + i * h2) | 0);
    }
    return hashes;
  }

  /**
   * Number of items added.
   */
  get count() {
    return this._count;
  }

  /**
   * Estimated current false positive rate based on fill ratio.
   */
  get estimatedFPR() {
    const fillRatio = this._count / this._m;
    return Math.pow(1 - Math.exp(-this._k * fillRatio), this._k);
  }

  /**
   * Get filter stats.
   */
  stats() {
    return {
      items: this._count,
      expectedItems: this._n,
      bitArraySize: this._m,
      hashFunctions: this._k,
      targetFPR: this._p,
      estimatedFPR: this.estimatedFPR,
      memoryBytes: this._bits.length
    };
  }

  /**
   * Clear the filter.
   */
  clear() {
    this._bits.fill(0);
    this._count = 0;
  }
}

module.exports = { BloomFilter };
