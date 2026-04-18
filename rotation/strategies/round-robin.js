'use strict';

/**
 * Round-robin rotation strategy.
 * Cycles through transports sequentially: A → B → C → A → B → C ...
 */
class RoundRobin {
  constructor() {
    this._index = 0;
  }

  /**
   * Pick the next transport from available pool.
   * @param {Object[]} transports - Available (non-paused, non-maxed) transports
   * @returns {Object|null}
   */
  pick(transports) {
    if (transports.length === 0) return null;
    const transport = transports[this._index % transports.length];
    this._index++;
    return transport;
  }

  reset() {
    this._index = 0;
  }
}

module.exports = { RoundRobin };
