const WebSocket = require('ws');
const snmp = require('net-snmp');

const OIDS = {
  ifDescr: '1.3.6.1.2.1.2.2.1.2',
  ifInOctets: '1.3.6.1.2.1.2.2.1.10',
  ifOutOctets: '1.3.6.1.2.1.2.2.1.16',
  ifHCInOctets: '1.3.6.1.2.1.31.1.1.1.6',
  ifHCOutOctets: '1.3.6.1.2.1.31.1.1.1.10',
};

function counterValue(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (Buffer.isBuffer(value)) return Number(BigInt('0x' + value.toString('hex')));
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function walkCounter(session, highCapacityOid, legacyOid) {
  try {
    const rows = await walk(session, highCapacityOid);
    return rows.length ? rows : walk(session, legacyOid);
  } catch {
    return walk(session, legacyOid);
  }
}

function walk(session, oid) {
  return new Promise((resolve, reject) => {
    const rows = [];
    session.subtree(oid, 20, (varbinds) => {
      for (const vb of varbinds) {
        if (!snmp.isVarbindError(vb)) rows.push({ oid: vb.oid, value: vb.value });
      }
    }, (error) => error ? reject(error) : resolve(rows));
  });
}

module.exports = function trafficHandler(ws) {
  let timer = null;
  let session = null;
  let target = null;
  let previous = null;

  const send = (value) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value));
  };

  async function readStats() {
    const [descr, input, output] = await Promise.all([
      walk(session, OIDS.ifDescr),
      walkCounter(session, OIDS.ifHCInOctets, OIDS.ifInOctets),
      walkCounter(session, OIDS.ifHCOutOctets, OIDS.ifOutOctets),
    ]);
    const stats = {};
    const indexOf = (oid, base) => oid.slice(base.length + 1);

    for (const row of descr) stats[indexOf(row.oid, OIDS.ifDescr)] = {
      iface: row.value.toString(), rx_total: 0, tx_total: 0,
    };
    for (const row of input) {
      const item = stats[indexOf(row.oid, OIDS.ifInOctets)];
      if (item) item.rx_total = counterValue(row.value);
    }
    for (const row of output) {
      const item = stats[indexOf(row.oid, OIDS.ifOutOctets)];
      if (item) item.tx_total = counterValue(row.value);
    }
    return stats;
  }

  async function tick() {
    try {
      const current = await readStats();
      const now = Date.now();
      if (!previous) {
        previous = { stats: current, time: now };
        return;
      }
      const seconds = Math.max((now - previous.time) / 1000, 0.001);
      const data = Object.entries(current).map(([index, item]) => {
        const before = previous.stats[index] || item;
        return {
          iface: item.iface,
          rx_bps: Math.max(0, Math.round((item.rx_total - before.rx_total) / seconds)),
          tx_bps: Math.max(0, Math.round((item.tx_total - before.tx_total) / seconds)),
          rx_total: item.rx_total,
          tx_total: item.tx_total,
        };
      });
      previous = { stats: current, time: now };
      send({ type: 'traffic', time: now, target, data });
    } catch (error) {
      send({ type: 'error', msg: 'Gagal membaca traffic SNMP: ' + error.message });
    }
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (session) { try { session.close(); } catch {} session = null; }
    previous = null;
    target = null;
  }

  ws.on('message', (message) => {
    let data; try { data = JSON.parse(message); } catch { return; }
    if (data.type === 'start') {
      const host = String(data.host || '').trim();
      if (!host || !/^[a-zA-Z0-9._\-]+$/.test(host)) {
        return send({ type: 'error', msg: 'IP/hostname perangkat tidak valid' });
      }
      stop();
      const port = parseInt(data.port) || 161;
      const version = data.version === '1' ? '1' : '2c';
      const interval = Math.min(Math.max(parseInt(data.interval) || 1000, 1000), 10000);
      target = { host };
      session = snmp.createSession(host, data.community || 'public', {
        port, version: version === '1' ? snmp.Version1 : snmp.Version2c,
        timeout: 5000, retries: 1,
      });
      session.on('error', (error) => send({ type: 'error', msg: 'SNMP session error: ' + error.message }));
      tick();
      timer = setInterval(tick, interval);
      send({ type: 'info', msg: `Mulai monitoring traffic ${host}` });
    } else if (data.type === 'stop') {
      stop();
      send({ type: 'info', msg: 'Monitoring traffic dihentikan' });
    }
  });

  ws.on('close', stop);
};
