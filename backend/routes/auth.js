const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const auth = require('../config/auth');

const router = express.Router();
const SESSION_TTL = (parseInt(process.env.SESSION_HOURS) || 8) * 60 * 60 * 1000;

// Rate limit login
const loginAttempts = new Map();
function loginRateLimit(req, res, next) {
  const ip = auth.getClientIp(req);
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (rec && now < rec.resetAt) {
    if (rec.count >= 10) {
      return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' });
    }
    rec.count++;
  } else {
    loginAttempts.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 });
  }
  next();
}

// GET /api/setup-status
router.get('/setup-status', (req, res) => {
  res.json({ needsSetup: db.needsSetup() });
});

// POST /api/setup
router.post('/setup', loginRateLimit, (req, res) => {
  if (!db.needsSetup()) return res.status(400).json({ error: 'Setup sudah dilakukan' });
  const { username, password, confirm } = req.body || {};
  if (password !== confirm) return res.status(400).json({ error: 'Konfirmasi tidak sama' });
  try {
    const u = db.createUser({ username, password, role: 'admin' });
    db.logAction({ userId: u.id, username: u.username, action: 'setup', ip: auth.getClientIp(req) });
    res.json({ ok: true, user: u.username });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/login
router.post('/login', loginRateLimit, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username & password wajib diisi' });
  }
  const user = db.findUser(username);
  const valid = user && db.verifyPassword(password, user.password_hash);
  const ip = auth.getClientIp(req);

  if (!valid) {
    db.logAction({ username, action: 'login_failed', ip });
    return setTimeout(() => res.status(401).json({ error: 'Username atau password salah' }), 600);
  }

  const token = crypto.randomBytes(32).toString('hex');
  db.createSession({
    token, userId: user.id, username: user.username, ttl: SESSION_TTL,
    ip, userAgent: req.headers['user-agent'] || '',
  });
  db.touchLastLogin(user.id);
  db.logAction({ userId: user.id, username: user.username, action: 'login', ip });
  res.json({ token, user: user.username, role: user.role, expiresIn: SESSION_TTL });
});

// POST /api/logout
router.post('/logout', auth, (req, res) => {
  db.deleteSession(auth.getToken(req));
  db.logAction({ userId: req.user.id, username: req.user.username, action: 'logout', ip: auth.getClientIp(req) });
  res.json({ ok: true });
});

// GET /api/me
router.get('/me', auth, (req, res) => {
  const s = db.getSession(auth.getToken(req));
  const u = db.findUser(req.user.username);
  res.json({
    user: req.user.username,
    role: u?.role || 'user',
    expiresAt: s.expires_at,
    expiresIn: s.expires_at - Date.now(),
  });
});

// POST /api/change-password
router.post('/change-password', auth, (req, res) => {
  const { current, next, confirm } = req.body || {};
  if (next !== confirm) return res.status(400).json({ error: 'Konfirmasi tidak sama' });
  if (!next || next.length < 6) return res.status(400).json({ error: 'Password min 6 karakter' });
  const u = db.findUser(req.user.username);
  if (!u || !db.verifyPassword(current, u.password_hash)) {
    return res.status(400).json({ error: 'Password lama salah' });
  }
  try {
    db.updatePassword(u.id, next);
    db.logAction({ userId: u.id, username: u.username, action: 'change_password', ip: auth.getClientIp(req) });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;