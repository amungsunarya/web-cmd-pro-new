const express = require('express');
const fs = require('fs');
const os = require('os');

const router = express.Router();

// Baca stats network dari /proc/net/dev (Linux)
function readNetStats() {
  const data = fs.readFileSync('/proc/net/dev', 'utf8');
  const lines = data.split('\n').slice(2); // skip header
  const ifaces = {};
  for (const line of lines) {
    if (!line.trim()) continue;
    const [nameRaw, ...rest] = line.trim().split(':');
    const name = nameRaw.trim();
    const cols = rest.join(':').trim().split(/\s+/).map(Number);
    ifaces[name] = {
      rx_bytes: cols[0],
      rx_packets: cols[1],
      rx_errors: cols[2],
      rx_dropped: cols[3],
      tx_bytes: cols[8],
      tx_packets: cols[9],
      tx_errors: cols[10],
      tx_dropped: cols[11],
    };
  }
  return ifaces;
}

// GET /api/traffic/ifaces — daftar interface
router.get('/traffic/ifaces', (req, res) => {
  try {
    if (os.platform() !== 'linux') {
      return res.status(400).json({ error: 'Fitur ini hanya untuk Linux' });
    }
    const stats = readNetStats();
    const ifaces = Object.keys(stats).filter(n => n !== 'lo');
    res.json({ ifaces, all: Object.keys(stats) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;