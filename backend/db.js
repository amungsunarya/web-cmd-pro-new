const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// =========================================
// SCHEMA
// =========================================
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    last_login INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    ip TEXT,
    user_agent TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    action TEXT NOT NULL,
    detail TEXT,
    ip TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS snmp_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    community TEXT NOT NULL DEFAULT 'public',
    port INTEGER NOT NULL DEFAULT 161,
    version TEXT NOT NULL DEFAULT '2c' CHECK (version IN ('1','2c')),
    interval INTEGER NOT NULL DEFAULT 5000,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ping_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    host TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    UNIQUE(user_id, host),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_snmp_profiles_user ON snmp_profiles(user_id);
  CREATE INDEX IF NOT EXISTS idx_ping_devices_user ON ping_devices(user_id);
`);

const BCRYPT_ROUNDS = 10;

// =========================================
// USERS
// =========================================
const countUsers = () => db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
const needsSetup = () => countUsers() === 0;

function createUser({ username, password, role = 'user' }) {
  username = String(username || '').trim();
  if (!/^[a-zA-Z0-9._\-]{3,32}$/.test(username)) {
    throw new Error('Username 3-32 karakter: huruf, angka, titik, minus, underscore');
  }
  if (!password || password.length < 6) throw new Error('Password min 6 karakter');
  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const info = db.prepare(
    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'
  ).run(username, hash, role);
  return { id: Number(info.lastInsertRowid), username, role };
}

const findUser = (username) =>
  db.prepare('SELECT * FROM users WHERE username = ?').get(username);

const verifyPassword = (plain, hash) => {
  try { return bcrypt.compareSync(plain, hash); } catch { return false; }
};

function updatePassword(userId, newPassword) {
  if (!newPassword || newPassword.length < 6) throw new Error('Password min 6 karakter');
  const hash = bcrypt.hashSync(newPassword, BCRYPT_ROUNDS);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

const touchLastLogin = (userId) => db.prepare(
  'UPDATE users SET last_login = ? WHERE id = ?'
).run(Math.floor(Date.now() / 1000), userId);

const listUsers = () => db.prepare(
  'SELECT id, username, role, created_at, last_login FROM users ORDER BY id'
).all();

const deleteUser = (userId) =>
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);

// =========================================
// SESSIONS
// =========================================
function createSession({ token, userId, username, ttl, ip, userAgent }) {
  const now = Date.now();
  db.prepare(`
    INSERT INTO sessions (token, user_id, username, created_at, expires_at, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(token, userId, username, now, now + ttl, ip || null, userAgent || null);
}

function getSession(token) {
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!s) return null;
  if (Date.now() > s.expires_at) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return s;
}

const deleteSession = (token) =>
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);

const cleanExpiredSessions = () =>
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()).changes;

// =========================================
// AUDIT
// =========================================
function logAction({ userId, username, action, detail, ip }) {
  try {
    db.prepare(`
      INSERT INTO audit_log (user_id, username, action, detail, ip)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId || null, username || null, action, detail || null, ip || null);
  } catch {}
}

const listAudit = (limit = 100) =>
  db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?').all(limit);

// =========================================
// SNMP PROFILES
// =========================================
const listSnmpProfiles = (userId) => db.prepare(
  'SELECT id, name, host, community, port, version, interval FROM snmp_profiles WHERE user_id = ? ORDER BY name COLLATE NOCASE'
).all(userId);

function createSnmpProfile({ userId, name, host, community = 'public', port = 161, version = '2c', interval = 5000 }) {
  const info = db.prepare(`
    INSERT INTO snmp_profiles (user_id, name, host, community, port, version, interval, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
  `).run(userId, name, host, community, port, version, interval);
  return db.prepare(
    'SELECT id, name, host, community, port, version, interval FROM snmp_profiles WHERE id = ?'
  ).get(info.lastInsertRowid);
}

const deleteSnmpProfile = (userId, profileId) => db.prepare(
  'DELETE FROM snmp_profiles WHERE id = ? AND user_id = ?'
).run(profileId, userId);

// =========================================
// PING DEVICES
// =========================================
const listPingDevices = (userId) => db.prepare(
  'SELECT id, host, name FROM ping_devices WHERE user_id = ? ORDER BY name COLLATE NOCASE'
).all(userId);

function savePingDevice({ userId, host, name }) {
  const info = db.prepare(`
    INSERT INTO ping_devices (user_id, host, name, updated_at)
    VALUES (?, ?, ?, strftime('%s','now'))
    ON CONFLICT(user_id, host) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at
  `).run(userId, host, name);
  return db.prepare(
    'SELECT id, host, name FROM ping_devices WHERE user_id = ? AND host = ?'
  ).get(userId, host);
}

const deletePingDevice = (userId, host) => db.prepare(
  'DELETE FROM ping_devices WHERE user_id = ? AND host = ?'
).run(userId, host);

// =========================================
// CLI
// =========================================
function resetAdminPassword(newPass) {
  const admin = db.prepare(
    "SELECT * FROM users WHERE role='admin' ORDER BY id LIMIT 1"
  ).get();
  if (!admin) { console.error('Tidak ada admin'); process.exit(1); }
  const hash = bcrypt.hashSync(newPass, BCRYPT_ROUNDS);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, admin.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(admin.id);
  console.log(`✅ Password admin "${admin.username}" direset.`);
}

module.exports = {
  db, needsSetup, countUsers, createUser, findUser, verifyPassword,
  updatePassword, touchLastLogin, listUsers, deleteUser,
  createSession, getSession, deleteSession, cleanExpiredSessions,
  logAction, listAudit, resetAdminPassword,
  listSnmpProfiles, createSnmpProfile, deleteSnmpProfile,
  listPingDevices, savePingDevice, deletePingDevice,
};