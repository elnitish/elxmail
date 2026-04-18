'use strict';

/**
 * Random rotation strategy.
 * Pure random selection from the available transport pool.
 */
class Random {
  /**
   * Pick a random transport.
   * @param {Object[]} transports - Available transports
   * @returns {Object|null}
   */
  pick(transports) {
    if (transports.length === 0) return null;
    const idx = Math.floor(Math.random() * transports.length);
    return transports[idx];
  }
}

module.exports = { Random };
