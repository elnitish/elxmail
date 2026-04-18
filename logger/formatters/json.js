'use strict';

/**
 * JSON log formatter. Each entry is a valid JSON object.
 * Ideal for log aggregation tools (ELK, Datadog, etc.)
 */
function format(entry) {
  return JSON.stringify({
    timestamp: entry.timestamp,
    level: entry.level,
    component: entry.component,
    message: entry.message,
    ...(entry.meta && Object.keys(entry.meta).length > 0 ? { meta: entry.meta } : {})
  });
}

module.exports = { format };
