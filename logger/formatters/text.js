'use strict';

/**
 * Human-readable text log formatter.
 * Output: [2026-04-13 10:00:01] [info]  [elxmail:rotation] picked outreach1.com
 */
function format(entry) {
  const ts = entry.timestamp;
  const lvl = entry.level.padEnd(5);
  const comp = entry.component ? `[elxmail:${entry.component}]` : '[elxmail]';
  let line = `[${ts}] [${lvl}] ${comp.padEnd(25)} ${entry.message}`;

  if (entry.meta && Object.keys(entry.meta).length > 0) {
    line += ' ' + JSON.stringify(entry.meta);
  }

  return line;
}

module.exports = { format };
