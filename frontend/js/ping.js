window.Ping = (() => {
  const $ = Utils.$;
  const devices = new Map();
  let ws = null, wsReady = false;
  const queue = [];

  function initWs() {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;
    ws = new WebSocket(API.wsUrl('/ws/ping'));
    ws.onopen = () => {
      wsReady = true;
      for (const d of devices.values()) ws.send(JSON.stringify({ type: 'start', host: d.host }));
      while (queue.length) ws.send(queue.shift());
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'ping') updateDevice(msg);
    };
    ws.onclose = () => { wsReady = false; setTimeout(initWs, 2000); };
  }

  function wsSend(obj) {
    const s = JSON.stringify(obj);
    if (wsReady && ws.readyState === WebSocket.OPEN) ws.send(s);
    else queue.push(s);
  }

  async function loadDevices() {
    try {
      const res = await fetch('/api/ping/devices');
      const data = await res.json();
      (data.devices || []).forEach(d => addDevice(d.host, d.name, false));

      const legacy = JSON.parse(localStorage.getItem('pingDevices') || '[]');
      for (const device of legacy) {
        if (devices.has(device.host)) continue;
        addDevice(device.host, device.name, false);
        await saveDevice(devices.get(device.host));
      }
      if (legacy.length) localStorage.removeItem('pingDevices');
    } catch (e) {
      console.error('Gagal memuat perangkat ping:', e);
    }
  }

  async function saveDevice(device) {
    try {
      const res = await fetch('/api/ping/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: device.host, name: device.name }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Gagal menyimpan perangkat');
    } catch (e) {
      alert(e.message);
    }
  }

  function addDevice(host, name, save = true) {
    host = (host || '').trim();
    if (!host || devices.has(host)) return;
    const d = {
      host, name: name?.trim() || host,
      history: [], sent: 0, received: 0,
      lastTime: null, avgTimes: [], status: 'wait', card: null
    };
    devices.set(host, d);
    renderDevice(d);
    wsSend({ type: 'start', host });
    if (save) saveDevice(d);
    updateEmpty();
  }

  function removeDevice(host) {
    const d = devices.get(host); if (!d) return;
    wsSend({ type: 'stop', host });
    d.card?.remove();
    devices.delete(host);
    fetch(`/api/ping/devices/${encodeURIComponent(host)}`, { method: 'DELETE' })
      .catch(e => console.error('Gagal menghapus perangkat ping:', e));
    updateEmpty();
  }

  function updateEmpty() {
    $('emptyState').style.display = devices.size ? 'none' : 'block';
  }

  function renderDevice(d) {
    const card = document.createElement('div');
    card.className = 'device-card';
    card.innerHTML = `
      <div class="device-head">
        <div>
          <div class="device-name">${Utils.escapeHtml(d.name)}</div>
          <div class="device-host">${Utils.escapeHtml(d.host)}</div>
        </div>
        <div class="status-pill wait" data-status><span class="led"></span>WAIT</div>
      </div>
      <div class="sparkline" data-spark></div>
      <div class="device-stats">
        <div class="stat-mini"><div class="label">Last</div><div class="value" data-last>-</div></div>
        <div class="stat-mini"><div class="label">Avg</div><div class="value" data-avg>-</div></div>
        <div class="stat-mini"><div class="label">Loss</div><div class="value" data-loss>0%</div></div>
      </div>
      <div class="device-actions">
        <button class="btn btn-gray btn-sm" data-action="rename">✎ Rename</button>
        ${AUTH.role === 'admin' ? '<button class="btn btn-danger btn-sm" data-action="remove">✕ Hapus</button>' : ''}
      </div>`;
    $('deviceGrid').appendChild(card);

    card.querySelector('[data-action="rename"]').onclick = () => {
      const nn = prompt('Nama baru:', d.name);
      if (nn !== null) {
        d.name = nn.trim() || d.host;
        card.querySelector('.device-name').textContent = d.name;
        saveDevice(d);
      }
    };
    const removeButton = card.querySelector('[data-action="remove"]');
    if (removeButton) removeButton.onclick = () => removeDevice(d.host);
    d.card = card;
    updateCard(d);
  }

  function updateDevice(msg) {
    const d = devices.get(msg.host); if (!d) return;
    d.sent++;
    if (msg.alive && msg.time != null) {
      d.received++;
      d.lastTime = msg.time;
      d.avgTimes.push(msg.time);
      if (d.avgTimes.length > 20) d.avgTimes.shift();
      d.status = 'up';
    } else if (!msg.alive) {
      d.status = 'down';
      d.lastTime = null;
    }
    d.history.push({ alive: msg.alive, time: msg.time });
    if (d.history.length > 40) d.history.shift();
    updateCard(d);
  }

  function updateCard(d) {
    const card = d.card; if (!card) return;
    const pill = card.querySelector('[data-status]');
    pill.className = 'status-pill ' + d.status;
    pill.innerHTML = `<span class="led"></span>${d.status === 'up' ? 'ONLINE' : d.status === 'down' ? 'OFFLINE' : 'WAIT'}`;
    card.classList.toggle('up', d.status === 'up');
    card.classList.toggle('down', d.status === 'down');

    const spark = card.querySelector('[data-spark]');
    spark.innerHTML = '';
    const maxT = Math.max(20, ...d.history.map(h => h.time || 0));
    for (let i = 0; i < 40; i++) {
      const bar = document.createElement('div');
      bar.className = 'spark-bar';
      const h = d.history[i];
      if (h) {
        if (!h.alive) bar.classList.add('loss');
        else {
          bar.style.height = Math.max(10, Math.min(100, ((h.time || 1) / maxT) * 100)) + '%';
          bar.classList.add((h.time || 0) > 100 ? 'high' : 'up');
        }
      }
      spark.appendChild(bar);
    }
    card.querySelector('[data-last]').textContent = d.lastTime != null ? d.lastTime.toFixed(0) + 'ms' : '-';
    const avg = d.avgTimes.length ? (d.avgTimes.reduce((a, b) => a + b, 0) / d.avgTimes.length) : null;
    card.querySelector('[data-avg]').textContent = avg != null ? avg.toFixed(1) + 'ms' : '-';
    const loss = d.sent ? Math.round(((d.sent - d.received) / d.sent) * 100) : 0;
    card.querySelector('[data-loss]').textContent = loss + '%';
  }

  function bindUI() {
    $('addDeviceBtn').onclick = () => {
      const host = $('pingHost').value.trim();
      const name = $('pingName').value.trim();
      if (!host) { alert('Masukkan IP/hostname'); return; }
      addDevice(host, name);
      $('pingHost').value = '';
      $('pingName').value = '';
      $('pingHost').focus();
    };
    $('pingHost').addEventListener('keypress', e => {
      if (e.key === 'Enter') $('addDeviceBtn').click();
    });
    $('addDefaultsBtn').onclick = () => {
      [['192.168.1.1','Router'], ['127.0.0.1','Localhost'], ['8.8.8.8','Google DNS']]
        .forEach(([h, n]) => addDevice(h, n));
    };
  }

  return {
    async init() {
      initWs();
      await loadDevices();
      bindUI();
      setTimeout(updateEmpty, 100);
    }
  };
})();