'use strict';

/**
 * In-memory suppression store using a Set.
 * Sub-millisecond lookups. For development and small lists.
 * Not persistent — lost on restart.
 */
class MemorySuppressionAdapter {
  constructor() {
    this._set = new Set();
    // Track suppression reason: Map<email, { reason, timestamp }>
    this._meta = new Map();
  }

  /**
   * Add an email to the suppression list.
   * @param {string} email - Normalized email
   * @param {string} [reason='manual'] - Why it was suppressed
   */
  add(email, reason = 'manual') {
    this._set.add(email);
    this._meta.set(email, { reason, timestamp: Date.now() });
  }

  /**
   * Check if an email is suppressed.
   * @param {string} email - Normalized email
   * @returns {boolean}
   */
  check(email) {
    return this._set.has(email);
  }

  /**
   * Remove an email from suppression.
   * @param {string} email
   */
  remove(email) {
    this._set.delete(email);
    this._meta.delete(email);
  }

  /**
   * Import a list of emails.
   * @param {string[]} emails
   * @param {string} [reason='import']
   */
  import(emails, reason = 'import') {
    for (const email of emails) {
      this.add(email, reason);
    }
  }

  /**
   * Export all suppressed emails.
   * @returns {Array<{ email: string, reason: string, timestamp: number }>}
   */
  export() {
    const result = [];
    for (const [email, meta] of this._meta) {
      result.push({ email, ...meta });
    }
    return result;
  }

  /**
   * @returns {number}
   */
  size() {
    return this._set.size;
  }

  /**
   * Clear all entries.
   */
  clear() {
    this._set.clear();
    this._meta.clear();
  }
}

module.exports = { MemorySuppressionAdapter };
