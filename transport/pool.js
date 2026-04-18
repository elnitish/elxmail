'use strict';

const nodemailer = require('nodemailer');

/**
 * SMTP Connection Pool.
 * Maintains persistent connections to SMTP servers per transport.
 * Reuses connections instead of opening a new one per email.
 *
 * Uses nodemailer's built-in pooling with lifecycle management:
 *   - Acquire/release pattern
 *   - Idle connection health checks (NOOP command)
 *   - Auto-reconnect on connection drop
 *   - Configurable max connections and messages per connection
 */

// Pool instances: Map<domain, PooledTransporter>
const _pools = new Map();

class PooledTransporter {
  /**
   * @param {Object} transport - Transport config
   * @param {Object} [poolConfig] - { maxConnections, maxMessages, idleTimeout }
   */
  constructor(transport, poolConfig = {}) {
    this._transport = transport;
    this._maxConnections = poolConfig.maxConnections || 5;
    this._maxMessages = poolConfig.maxMessages || 100;
    this._idleTimeout = poolConfig.idleTimeout || 30000;

    this._transporter = nodemailer.createTransport({
      pool: true,
      host: transport.host,
      port: transport.port || 587,
      secure: transport.port === 465,
      auth: {
        user: transport.auth.user,
        pass: transport.auth.pass
      },
      localAddress: transport.bindIP || undefined,
      maxConnections: this._maxConnections,
      maxMessages: this._maxMessages,
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 60000
    });

    this._stats = {
      sent: 0,
      errors: 0,
      activeConnections: 0,
      idleConnections: 0
    };

    // Track connection events
    this._transporter.on('idle', () => {
      this._stats.idleConnections++;
    });
  }

  /**
   * Send an email through the pool.
   * @param {Object} mailOpts - nodemailer mail options
   * @returns {Promise<Object>}
   */
  async send(mailOpts) {
    try {
      const info = await this._transporter.sendMail(mailOpts);
      this._stats.sent++;
      return info;
    } catch (err) {
      this._stats.errors++;
      throw err;
    }
  }

  /**
   * Verify the connection is alive.
   * @returns {Promise<boolean>}
   */
  async verify() {
    try {
      await this._transporter.verify();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if the pool is accepting messages.
   * @returns {boolean}
   */
  isIdle() {
    return this._transporter.isIdle();
  }

  /**
   * Get pool stats.
   */
  stats() {
    return { ...this._stats };
  }

  /**
   * Close the pool — all connections are terminated.
   */
  close() {
    this._transporter.close();
  }
}

/**
 * Get or create a pooled transporter for a transport config.
 * @param {Object} transport
 * @param {Object} [poolConfig]
 * @returns {PooledTransporter}
 */
function getPool(transport, poolConfig) {
  const key = transport.domain;

  if (_pools.has(key)) {
    return _pools.get(key);
  }

  const pool = new PooledTransporter(transport, poolConfig || transport.pool);
  _pools.set(key, pool);
  return pool;
}

/**
 * Close a specific pool.
 * @param {string} domain
 */
function closePool(domain) {
  const pool = _pools.get(domain);
  if (pool) {
    pool.close();
    _pools.delete(domain);
  }
}

/**
 * Close all pools. Used in shutdown.
 */
function closeAllPools() {
  for (const pool of _pools.values()) {
    pool.close();
  }
  _pools.clear();
}

/**
 * Get stats for all pools.
 */
function allStats() {
  const result = {};
  for (const [domain, pool] of _pools) {
    result[domain] = pool.stats();
  }
  return result;
}

module.exports = { PooledTransporter, getPool, closePool, closeAllPools, allStats };
