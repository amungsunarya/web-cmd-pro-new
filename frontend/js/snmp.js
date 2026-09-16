window.SNMP = (() => {
  const $ = Utils.$;
  let ws = null, running = false;
  let profiles = [];
  const deviceViews = new Map();

  function profileValues() {
    return {
      name: $('snmpProfileName').value.trim(),
      host: $('snmpHost').value.trim(),
      community: $('snmpCommunity').value.trim() || 'public',
      port: parseInt($('snmpPort').value) || 161,
      version: $('snmpVersion').value,
      interval: parseInt($('snmpInterval').value) || 5000,
    };
  }

  async function loadProfiles() {
    try {
      const res = await fetch('/api/snmp/profiles');
      const data = await res.json();
      profiles = data.profiles || [];
      const select = $('snmpProfile');
      select.innerHTML = '<option value="">— profil tersimpan —</option>';
      for (const profile of data.profiles || []) {
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = `${profile.name} — ${profile.host}`;
        option.dataset.profile = JSON.stringify(profile);
        select.appendChild(option);
      }
    } catch (e) {
      console.error('Gagal memuat profil SNMP:', e);
    }
  }

  function applyProfile(profile) {
    $('snmpProfileName').value = profile.name || '';
    $('snmpHost').value = profile.host || '';
    $('snmpCommunity').value = profile.community || 'public';
    $('snmpPort').value = profile.port || 161;
    $('snmpVersion').value = profile.version || '2c';
    $('snmpInterval').value = profile.interval || 5000;
    $('snmpDeleteBtn').disabled = !profile.id;
  }

  async function saveProfile() {
    const values = profileValues();
    if (!values.name) { alert('Masukkan nama profil'); return; }
    try {
      const res = await fetch('/api/snmp/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan profil');
      await loadProfiles();
      $('snmpProfile').value = String(data.profile.id);
      $('snmpDeleteBtn').disabled = false;
      startTargets([data.profile]);
    } catch (e) {
      alert(e.message);
    }
  }

  async function deleteProfile() {
    const id = $('snmpProfile').value;
    if (!id || !confirm('Hapus profil SNMP ini?')) return;
    const res = await fetch(`/api/snmp/profiles/${id}`, { method: 'DELETE' });
    if (!res.ok) { const data = await res.json(); alert(data.error || 'Gagal menghapus profil'); return; }
    applyProfile({});
    await loadProfiles();
  }

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
    if (msg.type === 'snmp') render(msg.data, msg.target);
    else if (msg.type === 'info') console.log(msg.msg);
    else if (msg.type === 'error') {
      const targetName = msg.target?.name || msg.target?.host;
      const error = `<div class="empty-state"><div class="big">❌</div><div>${Utils.escapeHtml(msg.msg)}</div></div>`;
      if (targetName) {
        const key = String(msg.target.id);
        const previous = deviceViews.get(key);
        deviceViews.set(key, {
          title: targetName, host: msg.target.host, html: error, status: 'offline',
          detailOpen: previous?.detailOpen || false,
        });
        renderDevices();
        if (previous?.status !== 'offline') Utils.notify(`${targetName} offline`, 'error');
      } else $('snmpContent').innerHTML = error;
    }
  }

  function statusFor(data) {
    const critical = (data.cpu != null && data.cpu > 80)
      || (data.storage || []).some(item => item.percent > 90);
    return critical ? 'critical' : 'online';
  }

  function statusLabel(status) {
    return status === 'critical' ? 'CRITICAL' : status === 'offline' ? 'OFFLINE' : status === 'online' ? 'ONLINE' : 'WAIT';
  }

  function renderDevices() {
    $('snmpContent').innerHTML = Array.from(deviceViews.entries()).map(([id, view]) => `
      <div class="snmp-device ${view.status || 'wait'}">
        <div class="snmp-device-head">
          <div><h3>${Utils.escapeHtml(view.title)}</h3><div class="snmp-device-host">${Utils.escapeHtml(view.host || '')}</div></div>
          <div class="status-pill ${view.status || 'wait'}"><span class="led"></span>${statusLabel(view.status || 'wait')}</div>
        </div>
        <div class="snmp-summary">${view.summary || 'Menunggu hasil polling...'}</div>
        <button class="btn btn-gray btn-sm snmp-detail-btn" data-device-detail="${Utils.escapeHtml(id)}">${view.detailOpen ? 'Sembunyikan' : 'Detail'}</button>
        <div class="snmp-device-detail ${view.detailOpen ? 'open' : ''}">${view.html || ''}</div>
      </div>`).join('');
    $('snmpContent').querySelectorAll('[data-device-detail]').forEach((button) => {
      button.onclick = () => {
        const view = deviceViews.get(button.dataset.deviceDetail);
        if (view) { view.detailOpen = !view.detailOpen; renderDevices(); }
      };
    });
  }

  function render(data, target = null) {
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

    if (target) {
      const key = String(target.id);
      const previous = deviceViews.get(key);
      deviceViews.set(key, {
        title: target.name, host: target.host, html, status: statusFor(data),
        summary: `${data.interfaces?.length || 0} interface, CPU ${data.cpu == null ? '—' : `${data.cpu}%`}, ${data.storage?.length || 0} storage`,
        detailOpen: previous?.detailOpen || false,
      });
      renderDevices();
    } else {
      $('snmpContent').innerHTML = html;
    }
  }

  function start() {
    const values = profileValues();
    if (!values.host) { alert('Masukkan IP device'); return; }
    startTargets([values]);
  }

  function startAll() {
    if (!profiles.length) { alert('Simpan minimal satu perangkat SNMP terlebih dahulu'); return; }
    startTargets(profiles);
  }

  function startTargets(targets) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      initWs();
      setTimeout(() => startTargets(targets), 500);
      return;
    }
    running = true;
    $('snmpStartBtn').disabled = true;
    $('snmpAllBtn').disabled = true;
    $('snmpStopBtn').disabled = false;
    deviceViews.clear();
    targets.forEach((target, index) => deviceViews.set(String(target.id || index), {
      title: target.name || target.host, host: target.host, status: 'wait', detailOpen: false,
      html: '<div class="empty-state"><div class="big">⏳</div><div>Menunggu hasil polling...</div></div>',
    }));
    renderDevices();
    ws.send(JSON.stringify({
      type: 'start',
      targets,
    }));
  }

  function stop() {
    running = false;
    $('snmpStartBtn').disabled = false;
    $('snmpAllBtn').disabled = false;
    $('snmpStopBtn').disabled = true;
    if (ws) ws.send(JSON.stringify({ type: 'stop' }));
  }

  function bindUI() {
    const startBtn = $('snmpStartBtn');
    const stopBtn  = $('snmpStopBtn');
    const allBtn = $('snmpAllBtn');
    $('snmpProfile').onchange = (event) => {
      const option = event.target.selectedOptions[0];
      if (option?.dataset.profile) applyProfile(JSON.parse(option.dataset.profile));
      else applyProfile({});
    };
    $('snmpSaveBtn').onclick = saveProfile;
    $('snmpDeleteBtn').onclick = deleteProfile;
    allBtn.onclick = startAll;

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
      loadProfiles();
    }
  };
})();