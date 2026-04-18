'use strict';

const http = require('http');
const { FBLHandler } = require('./handler');

/**
 * Optional webhook server for receiving FBL complaints via HTTP.
 * Uses plain Node http — no Express dependency.
 *
 * Endpoints:
 *   POST /complaint — receives complaint data as JSON
 *   GET  /health    — health check
 */
class FBLWebhook {
  /**
   * @param {Object} options
   * @param {number} [options.port=3001]
   * @param {string} [options.path='/complaint']
   * @param {Object} [options.logger]
   */
  constructor(options = {}) {
    this._port = options.port || 3001;
    this._path = options.path || '/complaint';
    this._logger = options.logger;
    this._handler = new FBLHandler({ logger: this._logger });
    this._server = null;
  }

  /**
   * Start the webhook server.
   * @returns {Promise<void>}
   */
  start() {
    return new Promise((resolve, reject) => {
      this._server = http.createServer((req, res) => {
        if (req.method === 'GET' && req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
          return;
        }

        if (req.method === 'POST' && req.url === this._path) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const result = this._handler.processComplaint(data);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ received: true, email: result.email }));
            } catch (err) {
              // Try as raw ARF report
              try {
                const result = this._handler.processReport(body);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ received: true, email: result.email }));
              } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid complaint data' }));
              }
            }
          });
          return;
        }

        res.writeHead(404);
        res.end();
      });

      this._server.listen(this._port, () => {
        if (this._logger) {
          this._logger.info(`FBL webhook listening on port ${this._port}`);
        }
        resolve();
      });

      this._server.on('error', reject);
    });
  }

  /**
   * Stop the webhook server.
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

module.exports = { FBLWebhook };
