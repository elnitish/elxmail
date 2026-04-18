'use strict';

const jsonFormatter = require('./formatters/json');
const textFormatter = require('./formatters/text');
const consoleTransport = require('./transports/console');
const { FileTransport } = require('./transports/file');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

/**
 * Structured logger for elxmail.
 * Every component gets a child logger with its name prefixed:
 *   logger.child('rotation') → logs tagged [elxmail:rotation]
 *
 * Supports console and file output, JSON and text formats,
 * and file rotation with compression.
 */
class Logger {
  constructor(options = {}) {
    this._level = LEVELS[options.level] != null ? LEVELS[options.level] : LEVELS.info;
    this._levelName = options.level || 'info';
    this._output = options.output || 'console';     // 'console' | 'file' | 'both'
    this._format = options.format || 'text';         // 'json' | 'text'
    this._component = options.component || null;
    this._formatter = this._format === 'json' ? jsonFormatter : textFormatter;
    this._fileTransport = null;

    if (this._output === 'file' || this._output === 'both') {
      this._fileTransport = new FileTransport({
        filePath: options.filePath,
        maxSize: options.rotation?.maxSize,
        maxFiles: options.rotation?.maxFiles,
        compress: options.rotation?.compress
      });
    }
  }

  /**
   * Create a child logger for a specific component.
   * Child inherits all settings but tags logs with the component name.
   */
  child(component) {
    const child = Object.create(this);
    child._component = component;
    return child;
  }

  _log(level, message, meta) {
    if (LEVELS[level] > this._level) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      component: this._component,
      message,
      meta: meta || {}
    };

    const formatted = this._formatter.format(entry);

    if (this._output === 'console' || this._output === 'both') {
      consoleTransport.write(formatted, level);
    }
    if ((this._output === 'file' || this._output === 'both') && this._fileTransport) {
      this._fileTransport.write(formatted);
    }
  }

  error(message, meta) { this._log('error', message, meta); }
  warn(message, meta) { this._log('warn', message, meta); }
  info(message, meta) { this._log('info', message, meta); }
  debug(message, meta) { this._log('debug', message, meta); }

  close() {
    if (this._fileTransport) {
      this._fileTransport.close();
    }
  }
}

module.exports = { Logger };
