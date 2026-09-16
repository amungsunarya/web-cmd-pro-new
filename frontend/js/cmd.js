window.CmdTools = (() => {
  const $ = Utils.$;
  let builtIn = [];
  let custom = JSON.parse(localStorage.getItem('customCmds') || '[]');
  let activeCmd = null;

  function loadCommands() {
    fetch('/api/commands').then(r => r.json()).then(data => {
      builtIn = data.commands;
      $('platformInfo').textContent =
        `${data.platform} • ${builtIn.length} cmd + ${custom.length} custom • 👤 ${AUTH.user}`;
      renderSidebar();
    }).catch(() => {
      $('platformInfo').textContent = 'Gagal memuat daftar perintah';
    });
  }

  function renderSidebar() {
    const sidebar = $('cmdSidebar');
    sidebar.innerHTML = '';
    const byCat = {};
    builtIn.forEach(c => (byCat[c.category] = byCat[c.category] || []).push(c));
    Object.keys(byCat).forEach(cat => {
      const t = document.createElement('div');
      t.className = 'cat-title'; t.textContent = cat;
      sidebar.appendChild(t);
      byCat[cat].forEach(cmd => {
        const btn = document.createElement('button');
        btn.className = 'cmd-item'; btn.dataset.id = cmd.id;
        btn.textContent = cmd.label;
        btn.onclick = () => selectBuiltIn(cmd);
        sidebar.appendChild(btn);
      });
    });
    if (custom.length) {
      const t = document.createElement('div');
      t.className = 'cat-title'; t.textContent = '⭐ Custom';
      sidebar.appendChild(t);
      custom.forEach((cmd, idx) => {
        const btn = document.createElement('button');
        btn.className = 'cmd-item'; btn.dataset.custom = idx;
        btn.innerHTML = `${Utils.escapeHtml(cmd.label)} <span class="badge-custom">C</span>`;
        btn.onclick = () => selectCustom(idx);
        btn.oncontextmenu = (e) => { e.preventDefault(); deleteCustom(idx); };
        btn.title = 'Klik kanan untuk hapus';
        sidebar.appendChild(btn);
      });
    }
  }

  function selectBuiltIn(cmd) {
    activeCmd = { type: 'builtin', cmd };
    document.querySelectorAll('.cmd-item').forEach(b => b.classList.remove('active'));
    document.querySelector(`.cmd-item[data-id="${cmd.id}"]`)?.classList.add('active');
    $('cmdTarget').disabled = !cmd.needsTarget;
    $('cmdTarget').placeholder = cmd.needsTarget ? cmd.targetLabel : '(tanpa target)';
    $('cmdRunBtn').disabled = false;
  }

  function selectCustom(idx) {
    const cmd = custom[idx];
    activeCmd = { type: 'custom', cmd, idx };
    document.querySelectorAll('.cmd-item').forEach(b => b.classList.remove('active'));
    document.querySelector(`.cmd-item[data-custom="${idx}"]`)?.classList.add('active');
    $('cmdTarget').disabled = !cmd.args.includes('{target}');
    $('cmdTarget').placeholder = cmd.args.includes('{target}') ? 'Target' : '(tanpa target)';
    $('cmdRunBtn').disabled = false;
  }

  function addLine(text, cls = '') {
    const div = document.createElement('div');
    div.className = 'line ' + cls;
    div.textContent = text;
    $('cmdTerminal').appendChild(div);
    $('cmdTerminal').scrollTop = $('cmdTerminal').scrollHeight;
  }

  function renderOutput(text) {
    if (!text) return;
    text.split(/\r?\n/).forEach(raw => {
      if (!raw) { addLine('', ''); return; }
      let cls = '';
      if (/TTL=|ttl=|Reply from|bytes from/i.test(raw)) cls = 'success';
      else if (/timed out|unreachable|100% packet loss|hilang|failed/i.test(raw)) cls = 'fail';
      else if (/^\s*(Pinging|PING|Tracing|Server:|Address:)/i.test(raw)) cls = 'info';
      addLine(raw, cls);
    });
  }

  async function run() {
    if (!activeCmd) return;
    const target = $('cmdTarget').value.trim();
    $('cmdRunBtn').disabled = true;
    addLine('\n===== Menjalankan =====', 'info');
    try {
      let res, data;
      if (activeCmd.type === 'builtin') {
        if (activeCmd.cmd.needsTarget && !target) {
          addLine('⚠ Target kosong', 'fail');
          return;
        }
        res = await fetch('/api/run', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: activeCmd.cmd.id, target })
        });
      } else {
        const c = activeCmd.cmd;
        const args = c.args.replace(/\{target\}/g, target).split(/\s+/).filter(Boolean);
        res = await fetch('/api/run-custom', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: c.bin, args, label: c.label })
        });
      }
      data = await res.json();
      if (!res.ok) { addLine(`❌ ${data.error}`, 'fail'); return; }
      addLine(`> ${data.cmdLine}`, 'cmd');
      renderOutput(data.output);
      if (data.error) addLine(`⚠ ${data.error}`, 'error');
      addLine('--- selesai ---', 'dim');
    } catch (err) {
      addLine(`❌ ${err.message}`, 'fail');
    } finally {
      $('cmdRunBtn').disabled = false;
    }
  }

  function bindUI() {
    $('cmdRunBtn').onclick = run;
    $('cmdClearBtn').onclick = () => {
      $('cmdTerminal').innerHTML = '<div class="line dim">Terminal dibersihkan.</div>';
    };
    $('addCustomBtn').onclick = () => $('customModal').classList.add('active');
  }

  // Modal handlers (expose ke window karena dipanggil via onclick)
  window.closeCustomModal = () => $('customModal').classList.remove('active');
  window.saveCustomCmd = () => {
    const label = $('newCmdLabel').value.trim();
    const bin = $('newCmdBin').value.trim().toLowerCase();
    const args = $('newCmdArgs').value.trim();
    const cat = $('newCmdCat').value.trim() || 'Custom';
    if (!label || !bin) { alert('Label dan Binary wajib diisi'); return; }
    custom.push({ label, bin, args, cat });
    localStorage.setItem('customCmds', JSON.stringify(custom));
    $('newCmdLabel').value = ''; $('newCmdBin').value = '';
    $('newCmdArgs').value = ''; $('newCmdCat').value = 'Custom';
    window.closeCustomModal();
    renderSidebar();
  };
  function deleteCustom(idx) {
    if (!confirm('Hapus perintah ini?')) return;
    custom.splice(idx, 1);
    localStorage.setItem('customCmds', JSON.stringify(custom));
    renderSidebar();
  }

  return {
    init() {
      loadCommands();
      bindUI();
    }
  };
})();