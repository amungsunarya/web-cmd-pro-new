const os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const isWindows = os.platform() === 'win32';

module.exports = function pingHandler(ws) {
  const activePings = new Map();
  const send = (o) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); };

  ws.on('message', (msg) => {
    let data; try { data = JSON.parse(msg); } catch { return; }

    if (data.type === 'start') {
      const host = data.host;
      if (!host || !/^[a-zA-Z0-9._\-]+$/.test(host)) return;
      if (activePings.has(host)) return;

      const proc = spawn('ping', isWindows ? ['-t', host] : [host], { windowsHide: true });
      activePings.set(host, proc);

      let buffer = '';
      proc.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          const tMatch = line.match(/(?:time|waktu)[=<]([\d.]+)\s*ms/i);
          const time = tMatch ? parseFloat(tMatch[1]) : null;
          const alive = /TTL=|ttl=/i.test(line);
          const fail = /timed out|unreachable|hilang/i.test(line);
          if (alive || fail || tMatch) {
            send({ type: 'ping', host, alive, time, raw: line.trim() });
          }
        }
      });
      proc.on('close', () => activePings.delete(host));
    } else if (data.type === 'stop') {
      const proc = activePings.get(data.host);
      if (proc) { proc.kill(); activePings.delete(data.host); }
    }
  });

  ws.on('close', () => {
    for (const p of activePings.values()) { try { p.kill(); } catch {} }
  });
};