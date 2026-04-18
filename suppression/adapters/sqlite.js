'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * SQLite suppression adapter.
 * Persistent suppression storage that survives restarts.
 * Uses better-sqlite3 for synchronous, fast access.
 */
class SQLiteSuppressionAdapter {
  /**
   * @param {string} [dbPath='./data/suppression.db']
   */
  constructor(dbPath) {
    this._dbPath = dbPath || './data/suppression.db';

    // Ensure directory exists
    const dir = path.dirname(this._dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this._db = new Database(this._dbPath);
    this._db.pragma('journal_mode = WAL');  // Better concurrent read performance
    this._db.pragma('synchronous = NORMAL');

    // Create table
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS suppressions (
        email TEXT PRIMARY KEY,
        reason TEXT NOT NULL DEFAULT 'manual',
        created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
      )
    `);

    // Prepare statements for performance
    this._stmtAdd = this._db.prepare('INSERT OR IGNORE INTO suppressions (email, reason, created_at) VALUES (?, ?, ?)');
    this._stmtCheck = this._db.prepare('SELECT 1 FROM suppressions WHERE email = ?');
    this._stmtRemove = this._db.prepare('DELETE FROM suppressions WHERE email = ?');
    this._stmtSize = this._db.prepare('SELECT COUNT(*) as count FROM suppressions');
    this._stmtExport = this._db.prepare('SELECT email, reason, created_at as timestamp FROM suppressions');
  }

  add(email, reason = 'manual') {
    this._stmtAdd.run(email, reason, Date.now());
  }

  check(email) {
    return !!this._stmtCheck.get(email);
  }

  remove(email) {
    this._stmtRemove.run(email);
  }

  import(emails, reason = 'import') {
    const insertMany = this._db.transaction((list) => {
      for (const email of list) {
        this._stmtAdd.run(email, reason, Date.now());
      }
    });
    insertMany(emails);
  }

  export() {
    return this._stmtExport.all();
  }

  size() {
    return this._stmtSize.get().count;
  }

  clear() {
    this._db.exec('DELETE FROM suppressions');
  }

  close() {
    this._db.close();
  }
}

module.exports = { SQLiteSuppressionAdapter };
