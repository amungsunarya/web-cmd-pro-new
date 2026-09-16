const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');

function readNetStats() {
  const data = fs.readFileSync('/proc/net/dev', 'utf8');
  const lines = data.split('\n').slice(2);
  const ifaces = {};
  for (const line of lines) {
    if (!line.trim()) continue;
    const [nameRaw, ...rest] = line.trim().split(':');
    const name = nameRaw.trim();
    const cols = rest.join(':').trim().split(/\s+/).map(Number);
    ifaces[name] = {
      rx_bytes: cols[0], rx_packets: cols[1],
      tx_bytes: cols[8], tx_packets: cols[9],
    };
  }
  return ifaces;
}

module.exports = function trafficHandler(ws) {
  let timer = null;
  let prev = null;
  let interval = 1000;   // ms
  let filterIface = null;

  const send = (o) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); };

  function tick() {
    try {
      const cur = readNetStats();
      const now = Date.now();

      if (!prev) {
        prev = { stats: cur, time: now };
        return;
      }

      const dt = (now - prev.time) / 1000; // detik
      const results = [];

      for (const iface of Object.keys(cur)) {
        if (filterIface && iface !== filterIface) continue;
        if (iface === 'lo' && !filterIface) continue;

        const c = cur[iface], p = prev.stats[iface];
        if (!p) continue;

        const rxDiff = c.rx_bytes - p.rx_bytes;
        const txDiff = c.tx_bytes - p.tx_bytes;

        results.push({
          iface,
          rx_bps: Math.max(0, Math.round(rxDiff / dt)),        // bytes per second
          tx_bps: Math.max(0, Math.round(txDiff / dt)),
          rx_total: c.rx_bytes,
          tx_total: c.tx_bytes,
        });
      }

      send({ type: 'traffic', time: now, data: results });
      prev = { stats: cur, time: now };
    } catch (e) {
      send({ type: 'error', msg: e.message });
    }
  }

  ws.on('message', (msg) => {
    let data; try { data = JSON.parse(msg); } catch { return; }

    if (data.type === 'start') {
      if (timer) clearInterval(timer);
      interval = Math.min(Math.max(parseInt(data.interval) || 1000, 500), 10000);
      filterIface = data.iface || null;
      prev = null;
      tick();  // baseline
      timer = setInterval(tick, interval);
      send({ type: 'info', msg: `Mulai monitoring traffic (interval ${interval}ms)` });
    }
    else if (data.type === 'stop') {
      if (timer) { clearInterval(timer); timer = null; }
      send({ type: 'info', msg: 'Monitoring dihentikan' });
    }
  });

  ws.on('close', () => {
    if (timer) { clearInterval(timer); timer = null; }
  });
};