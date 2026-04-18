'use strict';

const http = require('http');
const { transparentPixelGIF } = require('./pixel');
const { decodeTrackingUrl } = require('./links');
const bus = require('../events');

/**
 * Tracking server for open and click tracking.
 * Lightweight HTTP server (no Express dependency) that handles:
 *
 *   GET /o/:trackingId — Open tracking (serves pixel, emits 'opened')
 *   GET /c/:trackingId/:encodedUrl — Click tracking (redirects, emits 'clicked')
 *   GET /health — Health check
 */
class TrackingServer {
  /**
   * @param {Object} [options]
   * @param {number} [options.port=3000]
   * @param {Object} [options.logger]
   */
  constructor(options = {}) {
    this._port = options.port || 3000;
    this._logger = options.logger;
    this._server = null;
    this._pixel = transparentPixelGIF();
  }

  /**
   * Start the tracking server.
   * @returns {Promise<void>}
   */
  start() {
    return new Promise((resolve, reject) => {
      this._server = http.createServer((req, res) => {
        const url = req.url;

        // Health check
        if (url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"status":"ok"}');
          return;
        }

        // Open tracking: /o/:trackingId
        const openMatch = url.match(/^\/o\/([a-f0-9]+)$/);
        if (openMatch) {
          const trackingId = openMatch[1];

          bus.emit('opened', {
            trackingId,
            ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
            timestamp: Date.now()
          });

          // Serve transparent pixel
          res.writeHead(200, {
            'Content-Type': 'image/gif',
            'Content-Length': this._pixel.length,
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache'
          });
          res.end(this._pixel);
          return;
        }

        // Click tracking: /c/:trackingId/:encodedUrl
        const clickMatch = url.match(/^\/c\/([a-f0-9]+)\/(.+)$/);
        if (clickMatch) {
          const trackingId = clickMatch[1];
          const encodedUrl = clickMatch[2];

          let originalUrl;
          try {
            originalUrl = decodeTrackingUrl(encodedUrl);
          } catch {
            res.writeHead(400);
            res.end('Invalid tracking URL');
            return;
          }

          bus.emit('clicked', {
            trackingId,
            url: originalUrl,
            ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
            timestamp: Date.now()
          });

          // 302 redirect to original URL
          res.writeHead(302, { 'Location': originalUrl });
          res.end();
          return;
        }

        // Not found
        res.writeHead(404);
        res.end();
      });

      this._server.listen(this._port, () => {
        if (this._logger) {
          this._logger.info(`tracking server listening on port ${this._port}`);
        }
        resolve();
      });

      this._server.on('error', reject);
    });
  }

  /**
   * Stop the tracking server.
   */
  stop() {
    return new Promise((resolve) => {
      if (this._server) {
        this._server.close(resolve);
        this._server = null;
      } else {
        resolve();
      }
    });
  }
}

module.exports = { TrackingServer };
