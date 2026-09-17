const express = require('express');
const snmp = require('net-snmp');
const db = require('../db');
const auth = require('../config/auth');

const router = express.Router();

function validateProfile(body = {}) {
  const name = String(body.name || '').trim();
  const host = String(body.host || '').trim();
  const community = String(body.community || 'public').trim();
  const port = parseInt(body.port) || 161;
  const interval = parseInt(body.interval) || 5000;
  const version = body.version === '1' ? '1' : '2c';
  if (!name || name.length > 64) throw new Error('Nama profil wajib diisi (maks. 64 karakter)');
  if (!host || !/^[a-zA-Z0-9._\-]+$/.test(host)) throw new Error('Host tidak valid');
  if (!community || community.length > 128) throw new Error('Community tidak valid');
  if (port < 1 || port > 65535) throw new Error('Port tidak valid');
  if (interval < 2000 || interval > 60000) throw new Error('Interval harus 2000-60000 ms');
  return { name, host, community, port, version, interval };
}

router.get('/snmp/profiles', (req, res) => {
  res.json({ profiles: db.listSnmpProfiles() });
});

router.post('/snmp/profiles', (req, res) => {
  try {
    const profile = db.createSnmpProfile({ userId: req.user.id, ...validateProfile(req.body) });
    res.json({ ok: true, profile });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/snmp/profiles/:id', auth.adminOnly, (req, res) => {
  const result = db.deleteSnmpProfile(parseInt(req.params.id));
  if (!result.changes) return res.status(404).json({ error: 'Profil tidak ditemukan' });
  res.json({ ok: true });
});

// Test koneksi SNMP
router.post('/snmp/test', async (req, res) => {
  const { host, community = 'public', port = 161, version = '2c', timeout = 3000 } = req.body;

  if (!host || !/^[a-zA-Z0-9._\-]+$/.test(host)) {
    return res.status(400).json({ error: 'Host tidak valid' });
  }

  try {
    const session = snmp.createSession(host, community, {
      port: parseInt(port),
      version: version === '1' ? snmp.Version1 : snmp.Version2c,
      timeout: parseInt(timeout),
      retries: 1,
    });

    // Query sysDescr
    const OID = '1.3.6.1.2.1.1.1.0';
    await new Promise((resolve, reject) => {
      session.get([OID], (err, varbinds) => {
        session.close();
        if (err) return reject(err);
        if (snmp.isVarbindError(varbinds[0])) return reject(new Error(snmp.varbindError(varbinds[0])));
        res.json({
          ok: true,
          host,
          sysDescr: varbinds[0].value.toString(),
        });
        resolve();
      });
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;