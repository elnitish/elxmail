'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * SQLite analytics adapter.
 * Persistent analytics storage for production use.
 * Stores all email lifecycle events with timestamp indexing.
 */
class SQLiteAnalyticsAdapter {
  /**
   * @param {string} [dbPath='./data/analytics.db']
   */
  constructor(dbPath) {
    this._dbPath = dbPath || './data/analytics.db';

    const dir = path.dirname(this._dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this._db = new Database(this._dbPath);
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('synchronous = NORMAL');

    this._db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        email TEXT,
        domain TEXT,
        ip TEXT,
        provider TEXT,
        message_id TEXT,
        tracking_id TEXT,
        meta TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    this._db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_domain ON events(domain);
      CREATE INDEX IF NOT EXISTS idx_events_provider ON events(provider);
    `);

    this._stmtInsert = this._db.prepare(`
      INSERT INTO events (type, email, domain, ip, provider, message_id, tracking_id, meta, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }

  store(event) {
    this._stmtInsert.run(
      event.type,
      event.email || null,
      event.domain || null,
      event.ip || null,
      event.provider || null,
      event.messageId || null,
      event.trackingId || null,
      event.meta ? JSON.stringify(event.meta) : null,
      event.timestamp || Date.now()
    );
  }

  query(opts = {}) {
    let sql = 'SELECT * FROM events WHERE 1=1';
    const params = [];

    if (opts.type) { sql += ' AND type = ?'; params.push(opts.type); }
    if (opts.domain) { sql += ' AND domain = ?'; params.push(opts.domain); }
    if (opts.provider) { sql += ' AND provider = ?'; params.push(opts.provider); }
    if (opts.ip) { sql += ' AND ip = ?'; params.push(opts.ip); }
    if (opts.from) { sql += ' AND timestamp >= ?'; params.push(opts.from); }
    if (opts.to) { sql += ' AND timestamp <= ?'; params.push(opts.to); }

    sql += ' ORDER BY timestamp ASC';

    return this._db.prepare(sql).all(...params).map(row => ({
      ...row,
      meta: row.meta ? JSON.parse(row.meta) : null
    }));
  }

  countByType(opts = {}) {
    let sql = 'SELECT type, COUNT(*) as count FROM events WHERE 1=1';
    const params = [];

    if (opts.domain) { sql += ' AND domain = ?'; params.push(opts.domain); }
    if (opts.provider) { sql += ' AND provider = ?'; params.push(opts.provider); }
    if (opts.ip) { sql += ' AND ip = ?'; params.push(opts.ip); }
    if (opts.from) { sql += ' AND timestamp >= ?'; params.push(opts.from); }
    if (opts.to) { sql += ' AND timestamp <= ?'; params.push(opts.to); }

    sql += ' GROUP BY type';

    const rows = this._db.prepare(sql).all(...params);
    const counts = {};
    for (const row of rows) {
      counts[row.type] = row.count;
    }
    return counts;
  }

  prune(before) {
    const result = this._db.prepare('DELETE FROM events WHERE timestamp < ?').run(before);
    return result.changes;
  }

  size() {
    return this._db.prepare('SELECT COUNT(*) as count FROM events').get().count;
  }

  clear() {
    this._db.exec('DELETE FROM events');
  }

  close() {
    this._db.close();
  }
}

module.exports = { SQLiteAnalyticsAdapter };
