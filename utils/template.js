'use strict';

/**
 * Simple {{variable}} template engine for email personalization.
 * No third-party dependency. Replaces {{firstName}}, {{company}}, etc.
 */

/**
 * Replace {{variable}} placeholders in a string with values from data object.
 * Unmatched placeholders are left as-is.
 *
 * @param {string} template - String containing {{variable}} placeholders
 * @param {Object} data - Key-value pairs for replacement
 * @returns {string}
 */
function render(template, data = {}) {
  if (!template || typeof template !== 'string') return template || '';
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] != null ? String(data[key]) : match;
  });
}

/**
 * Extract all variable names from a template string.
 * @param {string} template
 * @returns {string[]}
 */
function extractVariables(template) {
  if (!template || typeof template !== 'string') return [];
  const matches = template.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.slice(2, -2)))];
}

module.exports = { render, extractVariables };
