const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'accounts.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Operational',
    status TEXT NOT NULL DEFAULT 'Unchecked',
    username TEXT DEFAULT '',
    password_ref TEXT DEFAULT '',
    last_verified TEXT,
    verify_message TEXT,
    verify_screenshot TEXT,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    account_id INTEGER,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  );
`);

// Migration: add password column if missing
try {
  db.exec(`ALTER TABLE accounts ADD COLUMN password TEXT DEFAULT ''`);
} catch (e) {
  // Column already exists
}

// Create account_keys table for API credentials
db.exec(`
  CREATE TABLE IF NOT EXISTS account_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    key_type TEXT NOT NULL,
    key_name TEXT NOT NULL,
    key_value TEXT NOT NULL DEFAULT '',
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  );
`);

// Migration: add developer_url column
try {
  db.exec("ALTER TABLE accounts ADD COLUMN developer_url TEXT DEFAULT ''");
} catch (e) {}
// Migration: add login_url column
try {
  db.exec("ALTER TABLE accounts ADD COLUMN login_url TEXT DEFAULT ''");
} catch (e) {}
// Migration: add mcp_server column
try {
  db.exec("ALTER TABLE accounts ADD COLUMN mcp_server TEXT DEFAULT ''");
} catch (e) {}

// Populate passwords for existing accounts
const emptyPassCount = db.prepare("SELECT COUNT(*) as cnt FROM accounts WHERE password = '' OR password IS NULL").get().cnt;
if (emptyPassCount > 0) {
  db.prepare("UPDATE accounts SET password = 'Developer@2026' WHERE password = '' OR password IS NULL").run();
  console.log(`Set default password for ${emptyPassCount} accounts`);
}

// Seed accounts if table is empty
const count = db.prepare('SELECT COUNT(*) as cnt FROM accounts').get().cnt;
if (count === 0) {
  const seedFile = path.join(__dirname, 'accounts.json');
  if (fs.existsSync(seedFile)) {
    const accounts = JSON.parse(fs.readFileSync(seedFile, 'utf-8'));
    const insert = db.prepare(`
      INSERT INTO accounts (name, url, category, status, username)
      VALUES (@name, @url, @category, @status, @username)
    `);
    const insertMany = db.transaction((items) => {
      for (const item of items) {
        insert.run({
          name: item.name,
          url: item.url,
          category: item.category || 'Operational',
          status: item.status || 'Unchecked',
          username: item.username || '',
        });
      }
    });
    insertMany(accounts);
    console.log(`Seeded ${accounts.length} accounts into SQLite`);
  }
}

// Log an activity
function logActivity(type, message, accountId = null, details = null) {
  db.prepare(`
    INSERT INTO activity_log (type, message, account_id, details)
    VALUES (?, ?, ?, ?)
  `).run(type, message, accountId, details ? JSON.stringify(details) : null);
}

module.exports = { db, logActivity };
