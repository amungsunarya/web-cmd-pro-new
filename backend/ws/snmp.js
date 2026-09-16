const WebSocket = require('ws');
const snmp = require('net-snmp');

// =========================================
// OID standar (MIB-II)
// =========================================
const OIDS = {
  // System
  sysDescr:      '1.3.6.1.2.1.1.1.0',
  sysName:       '1.3.6.1.2.1.1.5.0',
  sysUpTime:     '1.3.6.1.2.1.1.3.0',
  sysLocation:   '1.3.6.1.2.1.1.6.0',

  // Interface table (walk)
  ifDescr:       '1.3.6.1.2.1.2.2.1.2',
  ifType:        '1.3.6.1.2.1.2.2.1.3',
  ifSpeed:       '1.3.6.1.2.1.2.2.1.5',
  ifPhysAddress: '1.3.6.1.2.1.2.2.1.6',
  ifOperStatus:  '1.3.6.1.2.1.2.2.1.8',
  ifInOctets:    '1.3.6.1.2.1.2.2.1.10',
  ifOutOctets:   '1.3.6.1.2.1.2.2.1.16',

  // CPU (HOST-RESOURCES-MIB)
  hrProcessorLoad: '1.3.6.1.2.1.25.3.3.1.2',

  // Storage (HOST-RESOURCES-MIB)
  hrStorageDescr:   '1.3.6.1.2.1.25.2.3.1.3',
  hrStorageSize:    '1.3.6.1.2.1.25.2.3.1.5',
  hrStorageUsed:    '1.3.6.1.2.1.25.2.3.1.6',

  // Printer (Printer-MIB)
  prtMarkerLifeCount: '1.3.6.1.2.1.43.10.2.1.4.1.1',
};

// =========================================
// Ambil sysDescr + sysName + sysUpTime
// =========================================
function pollSystem(session) {
  return new Promise((resolve, reject) => {
    session.get([OIDS.sysDescr, OIDS.sysName, OIDS.sysUpTime, OIDS.sysLocation], (err, varbinds) => {
      if (err) return reject(err);
      const result = {};
      for (const vb of varbinds) {
        if (snmp.isVarbindError(vb)) continue;
        const val = vb.value.toString();
        switch (vb.oid) {
          case OIDS.sysDescr:    result.sysDescr = val; break;
          case OIDS.sysName:     result.sysName = val; break;
          case OIDS.sysUpTime:   result.sysUpTime = Math.round(parseInt(val) / 100); break; // → detik
          case OIDS.sysLocation: result.sysLocation = val; break;
        }
      }
      resolve(result);
    });
  });
}

// =========================================
// Walk interface table
// =========================================
function walk(session, oid) {
  return new Promise((resolve, reject) => {
    const rows = [];
    session.subtree(oid, 20, (varbinds) => {
      for (const vb of varbinds) {
        if (!snmp.isVarbindError(vb)) {
          rows.push({ oid: vb.oid, value: vb.value });
        }
      }
    }, (err) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function pollInterfaces(session) {
  try {
    const [descr, status, speed, inOct, outOct] = await Promise.all([
      walk(session, OIDS.ifDescr),
      walk(session, OIDS.ifOperStatus),
      walk(session, OIDS.ifSpeed),
      walk(session, OIDS.ifInOctets),
      walk(session, OIDS.ifOutOctets),
    ]);

    const ifaces = {};
    const extractIndex = (oid, base) => parseInt(oid.replace(base + '.', ''));

    for (const row of descr) {
      const idx = extractIndex(row.oid, OIDS.ifDescr);
      ifaces[idx] = { index: idx, descr: row.value.toString() };
    }
    for (const row of status) {
      const idx = extractIndex(row.oid, OIDS.ifOperStatus);
      if (ifaces[idx]) ifaces[idx].operStatus = parseInt(row.value);
    }
    for (const row of speed) {
      const idx = extractIndex(row.oid, OIDS.ifSpeed);
      if (ifaces[idx]) ifaces[idx].speed = parseInt(row.value);
    }
    for (const row of inOct) {
      const idx = extractIndex(row.oid, OIDS.ifInOctets);
      if (ifaces[idx]) ifaces[idx].inOctets = parseInt(row.value);
    }
    for (const row of outOct) {
      const idx = extractIndex(row.oid, OIDS.ifOutOctets);
      if (ifaces[idx]) ifaces[idx].outOctets = parseInt(row.value);
    }

    return Object.values(ifaces);
  } catch {
    return [];
  }
}

async function pollCpu(session) {
  try {
    const rows = await walk(session, OIDS.hrProcessorLoad);
    const loads = rows.map(r => parseInt(r.value)).filter(v => !isNaN(v));
    if (!loads.length) return null;
    return Math.round(loads.reduce((a, b) => a + b, 0) / loads.length);
  } catch { return null; }
}

async function pollStorage(session) {
  try {
    const [descr, size, used] = await Promise.all([
      walk(session, OIDS.hrStorageDescr),
      walk(session, OIDS.hrStorageSize),
      walk(session, OIDS.hrStorageUsed),
    ]);

    const idxOf = (oid, base) => parseInt(oid.replace(base + '.', ''));
    const disks = {};
    for (const r of descr) {
      const i = idxOf(r.oid, OIDS.hrStorageDescr);
      disks[i] = { descr: r.value.toString() };
    }
    for (const r of size) {
      const i = idxOf(r.oid, OIDS.hrStorageSize);
      if (disks[i]) disks[i].size = parseInt(r.value);
    }
    for (const r of used) {
      const i = idxOf(r.oid, OIDS.hrStorageUsed);
      if (disks[i]) disks[i].used = parseInt(r.value);
    }
    return Object.values(disks)
      .filter(d => d.size > 0 && d.used >= 0)
      .map(d => ({
        descr: d.descr,
        size: d.size,
        used: d.used,
        percent: Math.round((d.used / d.size) * 100),
      }))
      .slice(0, 5);
  } catch { return []; }
}

// =========================================
// Printer marker
// =========================================
async function pollPrinter(session) {
  try {
    const rows = await walk(session, OIDS.prtMarkerLifeCount);
    const counts = rows.map(r => parseInt(r.value)).filter(v => !isNaN(v));
    if (!counts.length) return null;
    return { totalPages: counts.reduce((a, b) => a + b, 0) };
  } catch { return null; }
}

// =========================================
// Handler WebSocket
// =========================================
module.exports = function snmpHandler(ws) {
  let timer = null;
  let targets = [];
  const sessions = new Map();
  const prevIfaces = new Map();

  const send = (o) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); };

  async function pollTarget(target, session) {
    try {
      const system = await pollSystem(session);
      const interfaces = await pollInterfaces(session);
      const cpu = await pollCpu(session);
      const storage = await pollStorage(session);
      const printer = await pollPrinter(session);

      // Hitung bitrate dari delta counter
      const now = Date.now();
      let ifaceRates = null;
      const previous = prevIfaces.get(target.key);
      if (previous && previous.time) {
        const dt = (now - previous.time) / 1000;
        const prevMap = {};
        for (const i of previous.list) prevMap[i.index] = i;

        ifaceRates = interfaces.map(i => {
          const p = prevMap[i.index];
          if (!p) return { ...i, in_bps: 0, out_bps: 0 };
          return {
            ...i,
            in_bps:  Math.max(0, Math.round((i.inOctets  - (p.inOctets  || 0)) * 8 / dt)),
            out_bps: Math.max(0, Math.round((i.outOctets - (p.outOctets || 0)) * 8 / dt)),
          };
        });
      }

      prevIfaces.set(target.key, { time: now, list: interfaces });

      send({
        type: 'snmp',
        time: now,
        target: { id: target.id, name: target.name, host: target.host },
        data: {
          system,
          interfaces: ifaceRates || interfaces,
          cpu,
          storage,
          printer,
        }
      });
    } catch (e) {
      send({ type: 'error', target: { id: target.id, name: target.name, host: target.host }, msg: 'SNMP error: ' + e.message });
    }
  }

  function stopAll() {
    if (timer) { clearInterval(timer); timer = null; }
    for (const session of sessions.values()) {
      try { session.close(); } catch {}
    }
    sessions.clear();
    prevIfaces.clear();
    targets = [];
  }

  ws.on('message', (msg) => {
    let data; try { data = JSON.parse(msg); } catch { return; }

    if (data.type === 'start') {
      stopAll();
      const requestedTargets = Array.isArray(data.targets) ? data.targets : [data];
      targets = requestedTargets.slice(0, 20).filter((target) =>
        target?.host && /^[a-zA-Z0-9._\-]+$/.test(target.host)
      ).map((target, index) => ({
        ...target,
        id: target.id || index,
        key: String(target.id || `${target.host}:${target.port || 161}`),
        port: parseInt(target.port) || 161,
        version: target.version === '1' ? '1' : '2c',
        interval: Math.max(2000, parseInt(target.interval) || 5000),
        community: target.community || 'public',
        name: target.name || target.host,
      }));

      if (!targets.length) return send({ type: 'error', msg: 'Tidak ada host SNMP yang valid' });

      for (const target of targets) {
        const session = snmp.createSession(target.host, target.community, {
          port: target.port,
          version: target.version === '1' ? snmp.Version1 : snmp.Version2c,
          timeout: 5000,
          retries: 1,
        });
        sessions.set(target.key, session);
        session.on('error', (e) => send({
          type: 'error', target: { id: target.id, name: target.name, host: target.host },
          msg: 'SNMP session error: ' + e.message,
        }));
      }

      send({ type: 'info', msg: `Mulai monitoring ${targets.length} perangkat SNMP` });
      const pollAll = () => Promise.all(targets.map((target) => pollTarget(target, sessions.get(target.key))));
      pollAll();
      const interval = Math.min(...targets.map((target) => target.interval));
      timer = setInterval(pollAll, interval);
    }
    else if (data.type === 'stop') {
      stopAll();
      send({ type: 'info', msg: 'SNMP polling dihentikan' });
    }
  });

  ws.on('close', () => {
    stopAll();
  });
};