'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * File log transport with size-based rotation and gzip compression.
 *
 * When the log file exceeds maxSize, it rotates:
 *   elxmail.log → elxmail.log.1 → elxmail.log.2 → ... → elxmail.log.N
 * If compress is true, rotated files are gzipped:
 *   elxmail.log.1.gz, elxmail.log.2.gz, etc.
 */
class FileTransport {
  constructor(options = {}) {
    this.filePath = options.filePath || './logs/elxmail.log';
    this.maxSize = this._parseSize(options.maxSize || '50mb');
    this.maxFiles = options.maxFiles || 10;
    this.compress = options.compress !== false;
    this._stream = null;
    this._currentSize = 0;
  }

  _parseSize(sizeStr) {
    const match = String(sizeStr).match(/^(\d+)\s*(kb|mb|gb)?$/i);
    if (!match) return 50 * 1024 * 1024; // default 50mb
    const num = parseInt(match[1], 10);
    const unit = (match[2] || 'mb').toLowerCase();
    const multipliers = { kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
    return num * (multipliers[unit] || 1024 * 1024);
  }

  _ensureDir() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  _getStream() {
    if (!this._stream) {
      this._ensureDir();
      this._stream = fs.createWriteStream(this.filePath, { flags: 'a' });
      try {
        const stats = fs.statSync(this.filePath);
        this._currentSize = stats.size;
      } catch {
        this._currentSize = 0;
      }
    }
    return this._stream;
  }

  write(formattedLine) {
    const stream = this._getStream();
    const data = formattedLine + '\n';
    stream.write(data);
    this._currentSize += Buffer.byteLength(data);

    if (this._currentSize >= this.maxSize) {
      this._rotate();
    }
  }

  _rotate() {
    // Close current stream
    if (this._stream) {
      this._stream.end();
      this._stream = null;
    }

    // Shift existing rotated files: .N → .N+1
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const ext = this.compress ? '.gz' : '';
      const from = `${this.filePath}.${i}${ext}`;
      const to = `${this.filePath}.${i + 1}${ext}`;
      if (fs.existsSync(from)) {
        if (i + 1 >= this.maxFiles) {
          fs.unlinkSync(from); // delete oldest
        } else {
          fs.renameSync(from, to);
        }
      }
    }

    // Move current log to .1 (and compress if enabled)
    if (fs.existsSync(this.filePath)) {
      if (this.compress) {
        const content = fs.readFileSync(this.filePath);
        fs.writeFileSync(`${this.filePath}.1.gz`, zlib.gzipSync(content));
      } else {
        fs.renameSync(this.filePath, `${this.filePath}.1`);
      }
      fs.unlinkSync(this.filePath);
    }

    this._currentSize = 0;
  }

  close() {
    if (this._stream) {
      this._stream.end();
      this._stream = null;
    }
  }
}

module.exports = { FileTransport };
