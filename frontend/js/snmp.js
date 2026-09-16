window.SNMP = (() => {
  const $ = Utils.$;
  let ws = null, running = false;

  function fmtBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 ** 3) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    return (bytes / 1024 ** 3).toFixed(2) + ' GB';
  }

  function fmtBps(bps) {
    if (!bps) return '0 bps';
    if (bps < 1000) return bps + ' bps';
    if (bps < 1e6) return (bps / 1e3).toFixed(1) + ' Kbps';
    if (bps < 1e9) return (bps / 1e6).toFixed(2) + ' Mbps';
    return (bps / 1e9).toFixed(2) + ' Gbps';
  }

  function fmtUptime(sec) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${d}h ${h}j ${m}m`;
  }

  function initWs() {
    ws = new WebSocket(API.wsUrl('/ws/snmp'));
    ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
    ws.onclose = () => { if (running) setTimeout(initWs, 2000); };
  }

  function handleMessage(msg) {
    if (msg.type === 'snmp') render(msg.data);
    else if (msg.type === 'info') console.log(msg.msg);
    else if (msg.type === 'error') {
      const el = $('snmpContent');
      el.innerHTML = `<div class="empty-state"><div class="big">❌</div><div>${Utils.escapeHtml(msg.msg)}</div></div>`;
    }
  }

  function render(data) {
    const sys = data.system || {};
    const ifaces = data.interfaces || [];
    const storage = data.storage || [];

    let html = '';

    // === SISTEM ===
    html += `
      <div class="snmp-card">
        <div class="snmp-head">🖥️ Sistem</div>
        <div class="snmp-grid">
          <div class="snmp-item"><div class="label">Nama</div><div class="value">${Utils.escapeHtml(sys.sysName || '—')}</div></div>
          <div class="snmp-item"><div class="label">Uptime</div><div class="value">${sys.sysUpTime ? fmtUptime(sys.sysUpTime) : '—'}</div></div>
          <div class="snmp-item full"><div class="label">Deskripsi</div><div class="value small">${Utils.escapeHtml(sys.sysDescr || '—')}</div></div>
          <div class="snmp-item full"><div class="label">Lokasi</div><div class="value small">${Utils.escapeHtml(sys.sysLocation || '—')}</div></div>
        </div>
      </div>`;

    // === CPU ===
    if (data.cpu != null) {
      const cls = data.cpu > 80 ? 'bad' : data.cpu > 50 ? 'warn' : 'good';
      html += `
        <div class="snmp-card">
          <div class="snmp-head">⚡ CPU</div>
          <div class="snmp-big ${cls}">${data.cpu}%</div>
          <div class="snmp-bar"><div class="snmp-bar-fill ${cls}" style="width:${data.cpu}%"></div></div>
        </div>`;
    }

    // === INTERFACES ===
    if (ifaces.length) {
      html += `<div class="snmp-card full-width">
        <div class="snmp-head">🔌 Interface (${ifaces.length})</div>
        <div class="snmp-table">
          <div class="snmp-tr head">
            <span>Nama</span><span>Status</span><span>Speed</span><span>↓ In</span><span>↑ Out</span>
          </div>`;
      for (const i of ifaces) {
        const up = i.operStatus === 1;
        const status = up ? '🟢 Up' : '🔴 Down';
        const speed = i.speed ? (i.speed / 1e6) + ' Mbps' : '—';
        const inRate  = i.in_bps  != null ? fmtBps(i.in_bps)  : '—';
        const outRate = i.out_bps != null ? fmtBps(i.out_bps) : '—';
        html += `<div class="snmp-tr">
          <span title="${Utils.escapeHtml(i.descr)}">${Utils.escapeHtml(i.descr)}</span>
          <span>${status}</span>
          <span>${speed}</span>
          <span class="rx">${inRate}</span>
          <span class="tx">${outRate}</span>
        </div>`;
      }
      html += `</div></div>`;
    }

    // === STORAGE ===
    if (storage.length) {
      html += `<div class="snmp-card">
        <div class="snmp-head">💾 Storage</div>`;
      for (const s of storage) {
        const cls = s.percent > 90 ? 'bad' : s.percent > 75 ? 'warn' : 'good';
        html += `
          <div class="snmp-storage-row">
            <div class="storage-name">${Utils.escapeHtml(s.descr)}</div>
            <div class="snmp-bar"><div class="snmp-bar-fill ${cls}" style="width:${s.percent}%"></div></div>
            <div class="storage-pct ${cls}">${s.percent}%</div>
            <div class="storage-detail">${fmtBytes(s.used)} / ${fmtBytes(s.size)}</div>
          </div>`;
      }
      html += `</div>`;
    }

    // === PRINTER ===
    if (data.printer) {
      html += `
        <div class="snmp-card">
          <div class="snmp-head">🖨️ Printer</div>
          <div class="snmp-grid">
            <div class="snmp-item"><div class="label">Total Halaman</div><div class="value">${data.printer.totalPages.toLocaleString()}</div></div>
          </div>
        </div>`;
    }

    $('snmpContent').innerHTML = html;
  }

  function start() {
    const host = $('snmpHost').value.trim();
    if (!host) { alert('Masukkan IP device'); return; }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      initWs();
      setTimeout(() => start(), 500);
      return;
    }
    running = true;
    $('snmpStartBtn').disabled = true;
    $('snmpStopBtn').disabled = false;
    $('snmpContent').innerHTML = '<div class="empty-state"><div class="big">⏳</div><div>Polling SNMP...</div></div>';
    ws.send(JSON.stringify({
      type: 'start',
      host,
      community: $('snmpCommunity').value || 'public',
      port: parseInt($('snmpPort').value) || 161,
      version: $('snmpVersion').value,
      interval: parseInt($('snmpInterval').value) || 5000,
    }));
  }

  function stop() {
    running = false;
    $('snmpStartBtn').disabled = false;
    $('snmpStopBtn').disabled = true;
    if (ws) ws.send(JSON.stringify({ type: 'stop' }));
  }

  function bindUI() {
    const startBtn = $('snmpStartBtn');
    const stopBtn  = $('snmpStopBtn');

    if (startBtn) {
      startBtn.onclick = start;
    } else {
      console.warn('⚠️ [snmp] #snmpStartBtn tidak ada di HTML');
    }

    if (stopBtn) {
      stopBtn.onclick = stop;
    } else {
      console.warn('⚠️ [snmp] #snmpStopBtn tidak ada di HTML');
    }
  }

  return {
    init() {
      initWs();
      bindUI();
    }
  };
})();