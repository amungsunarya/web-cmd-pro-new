const express = require('express');
const db = require('../db');
const auth = require('../config/auth');

const router = express.Router();

router.get('/users', auth, auth.adminOnly, (req, res) => {
  res.json({ users: db.listUsers() });
});

router.post('/users', auth, auth.adminOnly, (req, res) => {
  const { username, password, role } = req.body || {};
  try {
    const u = db.createUser({ username, password, role: role === 'admin' ? 'admin' : 'user' });
    db.logAction({
      userId: req.user.id, username: req.user.username,
      action: 'create_user', detail: u.username, ip: auth.getClientIp(req)
    });
    res.json({ ok: true, user: u });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/users/:id', auth, auth.adminOnly, (req, res) => {
  const id = parseInt(req.params.id);
  const target = db.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'User tidak ditemukan' });
  if (target.username === req.user.username) {
    return res.status(400).json({ error: 'Tidak bisa hapus akun sendiri' });
  }
  db.deleteUser(id);
  db.logAction({
    userId: req.user.id, username: req.user.username,
    action: 'delete_user', detail: target.username, ip: auth.getClientIp(req)
  });
  res.json({ ok: true });
});

router.get('/audit', auth, auth.adminOnly, (req, res) => {
  res.json({ logs: db.listAudit(200) });
});

module.exports = router;