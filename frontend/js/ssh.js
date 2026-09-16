window.SSH = (() => {
  const $ = Utils.$;
  let ws = null, connected = false, currentAuth = 'password';

  function initWs() {
    ws = new WebSocket(API.wsUrl('/ws/ssh'));
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'data') append(msg.data);
      else if (msg.type === 'status') {
        $('sshStatus').textContent = msg.msg;
        if (msg.status === 'connected') setConnected(true);
        if (msg.status === 'disconnected') setConnected(false);
      }
      else if (msg.type === 'error') append('\n[ERROR] ' + msg.msg + '\n', '#f87171');
    };
    ws.onclose = () => { setConnected(false); setTimeout(initWs, 2000); };
  }

  function setConnected(on) {
    connected = on;
    $('sshInput').disabled = !on;
    $('sshConnectBtn').disabled = on;
    $('sshDisconnectBtn').disabled = !on;
    if (on) $('sshInput').focus();
  }

  function append(text, color = '') {
    const body = $('sshBody');
    const span = document.createElement('span');
    span.textContent = text;
    if (color) span.style.color = color;
    body.appendChild(span);
    body.scrollTop = body.scrollHeight;
  }

  function loadCfg() {
    try {
      const c = JSON.parse(localStorage.getItem('sshConfig') || 'null');
      if (c) {
        $('sshHost').value = c.host || '';
        $('sshPort').value = c.port || 22;
        $('sshUser').value = c.username || '';
        $('sshSave').checked = true;
      }
    } catch {}
  }

  function bindUI() {
    document.querySelectorAll('.key-type button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.key-type button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentAuth = btn.dataset.auth;
        $('authPasswordBlock').style.display = currentAuth === 'password' ? 'block' : 'none';
        $('authKeyBlock').style.display = currentAuth === 'key' ? 'block' : 'none';
      });
    });

    $('sshConnectBtn').onclick = () => {
      const host = $('sshHost').value.trim();
      const port = parseInt($('sshPort').value) || 22;
      const username = $('sshUser').value.trim();
      const password = $('sshPassword').value;
      const privateKey = $('sshPrivateKey').value;
      const passphrase = $('sshPassphrase').value;

      if (!host || !username) { alert('Host & Username wajib'); return; }
      if (currentAuth === 'password' && !password) { alert('Password wajib'); return; }
      if (currentAuth === 'key' && !privateKey) { alert('Private key wajib'); return; }

      if ($('sshSave').checked) {
        localStorage.setItem('sshConfig', JSON.stringify({ host, port, username }));
      } else {
        localStorage.removeItem('sshConfig');
      }

      append(`\n[${Utils.formatTime()}] Connect → ${username}@${host}:${port}\n`, '#38bdf8');

      const payload = { type: 'connect', host, port, username, cols: 120, rows: 30 };
      if (currentAuth === 'password') payload.password = password;
      else { payload.privateKey = privateKey; payload.passphrase = passphrase; }
      ws.send(JSON.stringify(payload));
    };

    $('sshDisconnectBtn').onclick = () => ws.send(JSON.stringify({ type: 'disconnect' }));
    $('sshClearBtn').onclick = () => { $('sshBody').innerHTML = ''; };

    $('sshInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        ws.send(JSON.stringify({ type: 'input', data: $('sshInput').value + '\r\n' }));
        $('sshInput').value = '';
      } else if (e.key === 'Tab') {
        e.preventDefault();
        ws.send(JSON.stringify({ type: 'input', data: '\t' }));
      } else if (e.key === 'c' && e.ctrlKey) {
        ws.send(JSON.stringify({ type: 'input', data: '\x03' }));
        append('^C\n');
      }
    });
  }

  return {
    init() { initWs(); loadCfg(); bindUI(); }
  };
})();