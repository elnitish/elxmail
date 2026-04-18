'use strict';

/**
 * Console log transport with color-coded output.
 * Errors in red, warnings in yellow, debug in gray, info in default.
 */
const COLORS = {
  error: '\x1b[31m',  // red
  warn: '\x1b[33m',   // yellow
  info: '\x1b[0m',    // default
  debug: '\x1b[90m',  // gray
  reset: '\x1b[0m'
};

function write(formattedLine, level) {
  const color = COLORS[level] || COLORS.info;
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(color + formattedLine + COLORS.reset + '\n');
}

module.exports = { write };
