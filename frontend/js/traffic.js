window.Traffic = (() => {
  const $ = Utils.$;
  let ws = null, running = false;
  const ifaceMap = new Map();   // name -> { rx, tx, el }

  function fmtBytes(bps) {
    if (bps < 1024) return bps + ' B/s';
    if (bps < 1024 * 1024) return (bps / 1024).toFixed(1) + ' KB/s';
    if (bps < 1024 * 1024 * 1024) return (bps / 1024 / 1024).toFixed(2) + ' MB/s';
    return (bps / 1024 / 1024 / 1024).toFixed(2) + ' GB/s';
  }

  async function loadIfaces() {
    try {
      const r = await fetch('/api/traffic/ifaces');
      const d = await r.json();
      const sel = $('trafficIface');
      sel.innerHTML = '<option value="">— semua interface —</option>';
      d.ifaces.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      });
    } catch (e) {
      console.error('Gagal load interface:', e);
    }
  }

  function initWs() {
    ws = new WebSocket(API.wsUrl('/ws/traffic'));
    ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
    ws.onclose = () => {
      if (running) setTimeout(initWs, 2000);
    };
  }

  function handleMessage(msg) {
    if (msg.type === 'traffic') update(msg.data);
    else if (msg.type === 'info') console.log(msg.msg);
    else if (msg.type === 'error') console.error(msg.msg);
  }

  function update(data) {
    const grid = $('trafficGrid');

    // Sembunyikan empty state
    grid.innerHTML = '';

    for (const iface of data) {
      const card = document.createElement('div');
      card.className = 'traffic-card';
      const rxMbps = (iface.rx_bps * 8 / 1e6).toFixed(2);
      const txMbps = (iface.tx_bps * 8 / 1e6).toFixed(2);

      card.innerHTML = `
        <div class="traffic-head">
          <span class="traffic-name">${Utils.escapeHtml(iface.iface)}</span>
          <span class="traffic-status">● LIVE</span>
        </div>
        <div class="traffic-row">
          <div class="traffic-stat rx">
            <div class="label">↓ RX</div>
            <div class="value">${rxMbps}</div>
            <div class="unit">Mbps</div>
            <div class="sub">${fmtBytes(iface.rx_bps)}</div>
          </div>
          <div class="traffic-stat tx">
            <div class="label">↑ TX</div>
            <div class="value">${txMbps}</div>
            <div class="unit">Mbps</div>
            <div class="sub">${fmtBytes(iface.tx_bps)}</div>
          </div>
        </div>
        <div class="traffic-total">
          <span>Total: ↓ ${fmtBytes(iface.rx_total)} | ↑ ${fmtBytes(iface.tx_total)}</span>
        </div>
      `;
      grid.appendChild(card);
    }
  }

  function start() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      initWs();
      setTimeout(() => start(), 500);
      return;
    }
    running = true;
    $('trafficStartBtn').disabled = true;
    $('trafficStopBtn').disabled = false;
    ws.send(JSON.stringify({
      type: 'start',
      iface: $('trafficIface').value || null,
      interval: parseInt($('trafficInterval').value),
    }));
  }

  function stop() {
    running = false;
    $('trafficStartBtn').disabled = false;
    $('trafficStopBtn').disabled = true;
    if (ws) ws.send(JSON.stringify({ type: 'stop' }));
  }

  function bindUI() {
    $('trafficStartBtn').onclick = start;
    $('trafficStopBtn').onclick = stop;
  }

  return {
    init() {
      initWs();
      loadIfaces();
      bindUI();
    }
  };
})();