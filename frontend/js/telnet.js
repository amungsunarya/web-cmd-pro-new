window.Telnet = (() => {
  const $ = Utils.$;
  let ws = null, connected = false;

  function initWs() {
    ws = new WebSocket(API.wsUrl('/ws/telnet'));
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'data') append(msg.data);
      else if (msg.type === 'status') {
        $('telnetStatus').textContent = msg.msg;
        if (msg.status === 'connected') setConnected(true);
        if (msg.status === 'disconnected') setConnected(false);
      }
      else if (msg.type === 'error') append('\n[ERROR] ' + msg.msg + '\n', '#f87171');
    };
    ws.onclose = () => setTimeout(initWs, 2000);
  }

  function setConnected(on) {
    connected = on;
    $('telnetInput').disabled = !on;
    $('telnetConnectBtn').disabled = on;
    $('telnetDisconnectBtn').disabled = !on;
    if (on) $('telnetInput').focus();
  }

  function append(text, color = '') {
    const body = $('telnetBody');
    const span = document.createElement('span');
    span.textContent = text;
    if (color) span.style.color = color;
    body.appendChild(span);
    body.scrollTop = body.scrollHeight;
  }

  function bindUI() {
    $('telnetConnectBtn').onclick = () => {
      const host = $('telnetHost').value.trim();
      const port = parseInt($('telnetPort').value) || 23;
      if (!host) { alert('Masukkan IP'); return; }
      append(`\n[${Utils.formatTime()}] Connect → ${host}:${port}\n`, '#38bdf8');
      ws.send(JSON.stringify({ type: 'connect', host, port }));
    };
    $('telnetDisconnectBtn').onclick = () => {
      ws.send(JSON.stringify({ type: 'disconnect' }));
      setConnected(false);
    };
    $('telnetClearBtn').onclick = () => { $('telnetBody').innerHTML = ''; };
    $('telnetInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        append($('telnetInput').value + '\n');
        ws.send(JSON.stringify({ type: 'input', data: $('telnetInput').value + '\r\n' }));
        $('telnetInput').value = '';
      }
    });
  }

  return { init() { initWs(); bindUI(); } };
})();