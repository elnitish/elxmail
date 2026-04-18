'use strict';

/**
 * Priority calculator for email jobs.
 * Assigns numeric priority based on recipient provider and retry status.
 * Lower number = higher priority.
 */

/**
 * Calculate priority for an email job.
 *
 * @param {string} provider - Recipient provider (gmail, outlook, yahoo, unknown)
 * @param {Object} priorityConfig - Priority mapping from config
 * @param {number} [attempt=0] - Current retry attempt (retries get slightly lower priority)
 * @returns {number}
 */
function calculate(provider, priorityConfig = {}, attempt = 0) {
  const basePriority = priorityConfig[provider] || priorityConfig.default || 5;
  // Retries get slightly deprioritized so fresh emails go first
  return basePriority + (attempt > 0 ? 10 : 0);
}

module.exports = { calculate };
