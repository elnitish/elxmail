'use strict';

/**
 * Weighted random rotation strategy.
 * Each transport has a weight. Picks transport based on probability
 * distribution matching the weights.
 *
 * Algorithm:
 *   Generate random number 0-totalWeight.
 *   Walk through weights accumulating.
 *   Pick transport where accumulated weight exceeds random number.
 */
class Weighted {
  /**
   * @param {Object} weights - { 'outreach1.com': 40, 'outreach2.com': 35, ... }
   */
  constructor(weights = {}) {
    this._weights = weights;
  }

  /**
   * Pick a transport using weighted random selection.
   * @param {Object[]} transports - Available transports
   * @returns {Object|null}
   */
  pick(transports) {
    if (transports.length === 0) return null;
    if (transports.length === 1) return transports[0];

    // Build weight array for available transports only
    let totalWeight = 0;
    const entries = [];

    for (const t of transports) {
      const weight = this._weights[t.domain] || 1;
      totalWeight += weight;
      entries.push({ transport: t, weight });
    }

    // Weighted random selection
    const rand = Math.random() * totalWeight;
    let accumulated = 0;

    for (const entry of entries) {
      accumulated += entry.weight;
      if (rand < accumulated) {
        return entry.transport;
      }
    }

    // Fallback (shouldn't reach here)
    return transports[transports.length - 1];
  }
}

module.exports = { Weighted };
