const WebSocket = require('ws');
const { Client: SSHClient } = require('ssh2');

module.exports = function sshHandler(ws) {
  let conn = null, stream = null;
  const send = (o) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); };

  ws.on('message', (msg) => {
    let data; try { data = JSON.parse(msg); } catch { return; }

    if (data.type === 'connect') {
      try { stream?.end(); } catch {}
      try { conn?.end(); } catch {}
      conn = null; stream = null;

      const { host, port = 22, username, password, privateKey, passphrase, cols = 120, rows = 30 } = data;
      if (!host || !/^[a-zA-Z0-9._\-]+$/.test(host)) return send({ type: 'error', msg: 'Host tidak valid' });
      if (!username) return send({ type: 'error', msg: 'Username wajib' });
      if (!password && !privateKey) return send({ type: 'error', msg: 'Password atau key wajib' });

      const cfg = { host, port: parseInt(port) || 22, username, readyTimeout: 20000, keepaliveInterval: 15000 };
      if (password) cfg.password = password;
      if (privateKey) { cfg.privateKey = privateKey; if (passphrase) cfg.passphrase = passphrase; }

      send({ type: 'status', msg: `🔌 Menghubungkan ${host}:${cfg.port}...` });
      conn = new SSHClient();

      conn.on('ready', () => {
        send({ type: 'status', msg: `✅ Terhubung ${host}:${cfg.port}`, status: 'connected' });
        conn.shell({ term: 'xterm-256color', cols, rows }, (err, s) => {
          if (err) return send({ type: 'error', msg: `Shell gagal: ${err.message}` });
          stream = s;
          s.on('data', c => send({ type: 'data', data: c.toString('utf8') }));
          s.stderr.on('data', c => send({ type: 'data', data: c.toString('utf8') }));
          s.on('close', () => {
            send({ type: 'status', msg: '🔌 Shell ditutup', status: 'disconnected' });
            try { conn.end(); } catch {}
            stream = null;
          });
        });
      });
      conn.on('error', (e) => {
        send({ type: 'error', msg: `❌ ${e.message}` });
        send({ type: 'status', msg: 'Terputus', status: 'disconnected' });
      });
      conn.on('close', () => {
        send({ type: 'status', msg: '🔌 SSH ditutup', status: 'disconnected' });
        conn = null; stream = null;
      });
      conn.connect(cfg);
    }
    else if (data.type === 'input') {
      if (stream && stream.writable) stream.write(data.data);
    }
    else if (data.type === 'resize') {
      if (stream) { try { stream.setWindow(data.rows || 30, data.cols || 120, 0, 0); } catch {} }
    }
    else if (data.type === 'disconnect') {
      try { stream?.end(); } catch {}
      try { conn?.end(); } catch {}
      conn = null; stream = null;
      send({ type: 'status', msg: '🔌 Terputus', status: 'disconnected' });
    }
  });

  ws.on('close', () => {
    try { stream?.end(); } catch {}
    try { conn?.end(); } catch {}
  });
};