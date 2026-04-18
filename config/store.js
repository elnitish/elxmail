'use strict';

const defaults = require('../defaults');
const { expand } = require('./shortcuts');
const { validate } = require('./validator');

/**
 * Config store. After validation, the config is deep-frozen and stored here.
 * Every other component reads from this store. Read-only after init.
 */

let _config = null;

/**
 * Deep merge two objects. Source values override target.
 * Arrays are replaced, not merged.
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Deep freeze an object and all nested objects.
 */
function deepFreeze(obj) {
  Object.freeze(obj);
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

/**
 * Initialize the config store.
 * 1. Expand shorthand (domains → transports)
 * 2. Merge with defaults
 * 3. Validate
 * 4. Deep freeze
 *
 * @param {Object} userConfig - Developer's config from init()
 * @returns {Object} - Frozen config
 */
function init(userConfig) {
  // Step 1: Expand shortcuts
  const expanded = expand(userConfig);

  // Step 2: Merge with defaults (user overrides defaults)
  // transports have no default — they come entirely from user
  const transports = expanded.transports;
  delete expanded.transports;
  const merged = deepMerge(defaults, expanded);
  merged.transports = transports;

  // Step 3: Validate
  validate(merged);

  // Step 4: Deep freeze and store
  _config = deepFreeze(merged);
  return _config;
}

/**
 * Get the current config. Throws if not initialized.
 * @returns {Object}
 */
function get() {
  if (!_config) {
    throw new Error('elxmail not initialized. Call elxmail.init() first.');
  }
  return _config;
}

/**
 * Check if config has been initialized.
 * @returns {boolean}
 */
function isInitialized() {
  return _config !== null;
}

/**
 * Reset config (for testing only).
 */
function reset() {
  _config = null;
}

module.exports = { init, get, isInitialized, reset };
