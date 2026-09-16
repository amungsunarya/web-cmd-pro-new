const express = require('express');
const os = require('os');
const { exec } = require('child_process');
const { ALLOWED_BINARIES, COMMANDS } = require('../config/commands');

const router = express.Router();

// GET /api/commands
router.get('/commands', (req, res) => {
  res.json({
    platform: os.platform(),
    commands: COMMANDS.map(c => ({
      id: c.id, label: c.label, category: c.category,
      needsTarget: !!c.needsTarget,
      targetLabel: c.targetLabel || 'Target'
    }))
  });
});

// POST /api/run
router.post('/run', (req, res) => {
  const { id, target } = req.body;
  const cmdDef = COMMANDS.find(c => c.id === id);
  if (!cmdDef) return res.status(400).json({ error: 'Perintah tidak dikenal' });

  let args = [];
  try { args = cmdDef.args(target || ''); }
  catch { return res.status(400).json({ error: 'Argumen invalid' }); }

  if (cmdDef.needsTarget && (!target || !/^[a-zA-Z0-9._:\-]+$/.test(target))) {
    return res.status(400).json({ error: 'Target tidak valid' });
  }

  exec(`${cmdDef.cmd} ${args.join(' ')}`,
    { timeout: cmdDef.timeout || 30000, cwd: cmdDef.cwd, windowsHide: true, maxBuffer: 5*1024*1024 },
    (err, stdout, stderr) => {
      res.json({
        label: cmdDef.label,
        cmdLine: `${cmdDef.cmd} ${args.join(' ')}`,
        output: (stdout || '') + (stderr ? '\n' + stderr : '') || '(kosong)',
        error: err ? err.message : null
      });
    });
});

// POST /api/run-custom
router.post('/run-custom', (req, res) => {
  const { cmd, args, label } = req.body;
  if (!cmd || !ALLOWED_BINARIES.has(cmd)) {
    return res.status(400).json({ error: `Perintah "${cmd}" tidak diizinkan` });
  }
  const argList = Array.isArray(args) ? args : [];
  for (const a of argList) {
    if (typeof a !== 'string' || !/^[a-zA-Z0-9._:\/\-=]+$/.test(a)) {
      return res.status(400).json({ error: `Argumen tidak valid: ${a}` });
    }
  }
  exec(`${cmd} ${argList.join(' ')}`,
    { timeout: 30000, windowsHide: true, maxBuffer: 5*1024*1024 },
    (err, stdout, stderr) => {
      res.json({
        label: label || cmd,
        cmdLine: `${cmd} ${argList.join(' ')}`,
        output: (stdout || '') + (stderr ? '\n' + stderr : '') || '(kosong)',
        error: err ? err.message : null
      });
    });
});

module.exports = router;