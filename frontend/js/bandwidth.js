window.Bandwidth = (() => {
  const $ = Utils.$;
  let ws = null, wsReady = false;

  function initWs() {
    ws = new WebSocket(API.wsUrl('/ws/bandwidth'));
    ws.onopen = () => { wsReady = true; };
    ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
    ws.onclose = () => { wsReady = false; setTimeout(initWs, 2000); };
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'info':
        addLine(msg.msg, 'info');
        break;
      case 'stderr':
        addLine(msg.msg);
        break;
      case 'interval':
        addLine(`[${msg.start.toFixed(2)}-${msg.end.toFixed(2)}s] ${msg.rate.toFixed(2)} ${msg.rateUnit}/sec (${msg.bytes} ${msg.bytesUnit})`, 'success');
        break;
      case 'result': {
        const s = msg.summary;
        const rx = s.received.mbps;
        const tx = s.sent.mbps;
        $('bwRx').textContent = rx || '—';
        $('bwTx').textContent = tx || '—';
        $('bwRetrans').textContent = s.retransmits ?? '—';
        $('bwCpu').textContent = s.cpu
          ? (s.cpu.host_total ? s.cpu.host_total.toFixed(1) : '—')
          : '—';
        addLine(`\n=== HASIL ===`, 'info');
        addLine(`Sent:      ${tx} Mbps`, 'success');
        addLine(`Received:  ${rx} Mbps`, 'success');
        if (s.retransmits != null) addLine(`Retrans:   ${s.retransmits}`, s.retransmits > 0 ? 'fail' : '');
        if (s.jitter_ms != null)   addLine(`Jitter:    ${s.jitter_ms.toFixed(2)} ms`);
        if (s.lost_percent != null) addLine(`Loss:      ${s.lost_percent.toFixed(2)}%`);
        break;
      }
      case 'error':
        addLine('[ERROR] ' + msg.msg, 'fail');
        if (msg.hint) addLine('[HINT] ' + msg.hint, 'info');
        stop();
        break;
      case 'hint':
        addLine('[HINT] ' + msg.msg, 'info');
        break;
      case 'done':
        addLine('=== Selesai ===', 'dim');
        stop();
        break;
    }
  }

  function addLine(text, cls = '') {
    const div = document.createElement('div');
    div.className = 'line ' + cls;
    div.textContent = text;
    $('bwBody').appendChild(div);
    $('bwBody').scrollTop = $('bwBody').scrollHeight;
  }

  function start() {
    const host = $('bwHost').value.trim();
    if (!host) { alert('Masukkan IP iperf3 server'); return; }
    $('bwBody').innerHTML = '';
    $('bwStartBtn').disabled = true;
    $('bwStopBtn').disabled = false;
    $('bwStatus').textContent = `Testing ${host}...`;
    $('bwRx').textContent = $('bwTx').textContent = '—';
    $('bwRetrans').textContent = $('bwCpu').textContent = '—';
    ws.send(JSON.stringify({
      type: 'start',
      host,
      port: parseInt($('bwPort').value) || 5201,
      protocol: $('bwProtocol').value,
      duration: parseInt($('bwDuration').value) || 10,
    }));
  }

  function stop() {
    $('bwStartBtn').disabled = false;
    $('bwStopBtn').disabled = true;
    $('bwStatus').textContent = 'Siap';
  }

  function bindUI() {
    $('bwStartBtn').onclick = start;
    $('bwStopBtn').onclick = () => {
      ws.send(JSON.stringify({ type: 'stop' }));
      stop();
    };
  }

  return { init() { initWs(); bindUI(); } };
})();