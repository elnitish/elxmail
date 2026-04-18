'use strict';

const { SMTPServer } = require('smtp-server');

/**
 * Mock SMTP server for testing.
 * Accepts connections, validates SMTP commands, returns configurable responses.
 * Can simulate bounces, timeouts, and rate limits.
 */
class MockSMTPServer {
  /**
   * @param {Object} [options]
   * @param {number} [options.port=2525]
   * @param {boolean} [options.authRequired=false]
   * @param {string} [options.user='test']
   * @param {string} [options.pass='test']
   * @param {Function} [options.onMessage] - Called with (from, to, content) for each message
   * @param {Object} [options.responses] - Custom response overrides
   */
  constructor(options = {}) {
    this._port = options.port || 2525;
    this._messages = [];
    this._onMessage = options.onMessage || null;
    this._rejectRecipients = new Set(); // Emails that will bounce
    this._rateLimitAfter = Infinity;    // Reject after N messages

    this._server = new SMTPServer({
      authOptional: !options.authRequired,
      disabledCommands: options.authRequired ? [] : ['STARTTLS'],
      onAuth: (auth, session, callback) => {
        if (options.authRequired) {
          if (auth.username === (options.user || 'test') && auth.password === (options.pass || 'test')) {
            callback(null, { user: auth.username });
          } else {
            callback(new Error('Invalid credentials'));
          }
        } else {
          callback(null, { user: 'anonymous' });
        }
      },
      onMailFrom: (address, session, callback) => {
        callback();
      },
      onRcptTo: (address, session, callback) => {
        // Simulate hard bounce for specific recipients
        if (this._rejectRecipients.has(address.address)) {
          callback(new Error('550 5.1.1 User unknown'));
          return;
        }
        callback();
      },
      onData: (stream, session, callback) => {
        let content = '';
        stream.on('data', (chunk) => { content += chunk.toString(); });
        stream.on('end', () => {
          // Simulate rate limit
          if (this._messages.length >= this._rateLimitAfter) {
            callback(new Error('421 4.7.0 Too many messages, try again later'));
            return;
          }

          const msg = {
            from: session.envelope.mailFrom.address,
            to: session.envelope.rcptTo.map(r => r.address),
            content,
            timestamp: Date.now()
          };
          this._messages.push(msg);
          if (this._onMessage) this._onMessage(msg);
          callback();
        });
      },
      logger: false
    });
  }

  /**
   * Start the mock SMTP server.
   * @returns {Promise<void>}
   */
  start() {
    return new Promise((resolve, reject) => {
      this._server.listen(this._port, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Stop the server.
   * @returns {Promise<void>}
   */
  stop() {
    return new Promise((resolve) => {
      this._server.close(resolve);
    });
  }

  /**
   * Configure specific recipients to bounce.
   * @param {string[]} emails
   */
  rejectRecipients(emails) {
    for (const e of emails) this._rejectRecipients.add(e);
  }

  /**
   * Simulate rate limiting after N messages.
   * @param {number} n
   */
  rateLimitAfter(n) {
    this._rateLimitAfter = n;
  }

  /**
   * Get all received messages.
   * @returns {Object[]}
   */
  getMessages() {
    return this._messages;
  }

  /**
   * Clear received messages.
   */
  clearMessages() {
    this._messages = [];
  }

  /**
   * Get the port the server is listening on.
   */
  get port() {
    return this._port;
  }
}

module.exports = { MockSMTPServer };
