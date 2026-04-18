'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Per-domain warm-up state tracker.
 * Persists state to a JSON file so it survives server restarts.
 *
 * Tracks for each domain:
 *   - startDate: when warm-up began
 *   - sentToday: emails sent today
 *   - lastResetDate: when sentToday was last reset
 */
class WarmupTracker {
  /**
   * @param {string} [statePath] - Path to persist state JSON
   */
  constructor(statePath) {
    this._statePath = statePath || null;
    // Map<domain, { startDate: string, sentToday: number, lastResetDate: string }>
    this._state = new Map();
    this._load();
  }

  /**
   * Initialize tracking for a domain.
   * @param {string} domain
   * @param {string} [startDate] - ISO date string override, defaults to today
   */
  init(domain, startDate) {
    if (this._state.has(domain)) return; // Don't overwrite existing

    this._state.set(domain, {
      startDate: startDate || new Date().toISOString().split('T')[0],
      sentToday: 0,
      lastResetDate: new Date().toISOString().split('T')[0]
    });

    this._save();
  }

  /**
   * Get the current warm-up day for a domain.
   * Day 1 = startDate, Day 2 = startDate + 1, etc.
   * @param {string} domain
   * @returns {number} - Current day (1-based)
   */
  getCurrentDay(domain) {
    const state = this._state.get(domain);
    if (!state) return 1;

    const start = new Date(state.startDate);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    return Math.max(1, diffDays + 1); // 1-based
  }

  /**
   * Get how many emails have been sent today for a domain.
   * @param {string} domain
   * @returns {number}
   */
  getSentToday(domain) {
    this._resetIfNewDay(domain);
    const state = this._state.get(domain);
    return state ? state.sentToday : 0;
  }

  /**
   * Record a send for a domain.
   * @param {string} domain
   */
  recordSend(domain) {
    this._resetIfNewDay(domain);
    const state = this._state.get(domain);
    if (state) {
      state.sentToday++;
      this._save();
    }
  }

  /**
   * Reset sentToday counter if we're on a new day.
   */
  _resetIfNewDay(domain) {
    const state = this._state.get(domain);
    if (!state) return;

    const today = new Date().toISOString().split('T')[0];
    if (state.lastResetDate !== today) {
      state.sentToday = 0;
      state.lastResetDate = today;
      this._save();
    }
  }

  /**
   * Get full state for a domain.
   */
  getState(domain) {
    this._resetIfNewDay(domain);
    const state = this._state.get(domain);
    if (!state) return null;
    return {
      ...state,
      currentDay: this.getCurrentDay(domain)
    };
  }

  /**
   * Get state for all domains.
   */
  getAllStates() {
    const result = {};
    for (const [domain] of this._state) {
      result[domain] = this.getState(domain);
    }
    return result;
  }

  /**
   * Load state from disk.
   */
  _load() {
    if (!this._statePath) return;
    try {
      if (fs.existsSync(this._statePath)) {
        const data = JSON.parse(fs.readFileSync(this._statePath, 'utf8'));
        for (const [domain, state] of Object.entries(data)) {
          this._state.set(domain, state);
        }
      }
    } catch {
      // Corrupted file — start fresh
    }
  }

  /**
   * Save state to disk.
   */
  _save() {
    if (!this._statePath) return;
    try {
      const dir = path.dirname(this._statePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = {};
      for (const [domain, state] of this._state) {
        data[domain] = state;
      }
      fs.writeFileSync(this._statePath, JSON.stringify(data, null, 2));
    } catch {
      // Best effort — don't crash on save failure
    }
  }

  /**
   * Reset all tracking state.
   */
  reset() {
    this._state.clear();
    if (this._statePath && fs.existsSync(this._statePath)) {
      fs.unlinkSync(this._statePath);
    }
  }
}

module.exports = { WarmupTracker };
