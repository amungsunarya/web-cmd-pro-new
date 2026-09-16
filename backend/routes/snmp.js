const express = require('express');
const snmp = require('net-snmp');

const router = express.Router();

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