const express = require('express');
const { exec } = require('child_process');

const router = express.Router();

// Cek apakah iperf3 terpasang
router.get('/bandwidth/status', (req, res) => {
  exec('which iperf3 || command -v iperf3', (err, stdout) => {
    res.json({
      installed: !err && stdout.trim().length > 0,
      path: stdout.trim() || null,
    });
  });
});

module.exports = router;