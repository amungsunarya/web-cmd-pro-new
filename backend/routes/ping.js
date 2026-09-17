const express = require('express');
const db = require('../db');

const router = express.Router();

function validateDevice(body = {}) {
  const host = String(body.host || '').trim();
  const name = String(body.name || host).trim() || host;
  if (!host || !/^[a-zA-Z0-9._\-]+$/.test(host)) throw new Error('Host tidak valid');
  if (name.length > 64) throw new Error('Nama maksimal 64 karakter');
  return { host, name };
}

router.get('/ping/devices', (req, res) => {
  res.json({ devices: db.listPingDevices(req.user.id) });
});

router.post('/ping/devices', (req, res) => {
  try {
    const device = db.savePingDevice({ userId: req.user.id, ...validateDevice(req.body) });
    res.json({ ok: true, device });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/ping/devices/:host', (req, res) => {
  const result = db.deletePingDevice(req.user.id, req.params.host);
  if (!result.changes) return res.status(404).json({ error: 'Perangkat tidak ditemukan' });
  res.json({ ok: true });
});

module.exports = router;