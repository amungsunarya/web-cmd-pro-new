(function () {
  const $ = id => document.getElementById(id);
  const alertBox = $('alertBox');

  function showAlert(msg, type = 'error') {
    alertBox.className = 'alert show ' + type;
    alertBox.textContent = msg;
  }
  function hideAlert() { alertBox.className = 'alert'; }

  // Redirect kalau sudah login
  (async () => {
    const token = localStorage.getItem('authToken');
    const exp = parseInt(localStorage.getItem('authExpires') || '0');
    if (!token || Date.now() > exp) return;
    try {
      const r = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } });
      if (r.ok) location.replace('/');
    } catch {}
  })();

  // Init
  async function init() {
    try {
      const r = await fetch('/api/setup-status');
      const d = await r.json();
      if (d.needsSetup) {
        $('setupForm').classList.remove('hidden');
        $('subtitle').textContent = 'Setup awal — buat admin pertama';
        $('modeLabel').textContent = 'mode: setup';
      } else {
        $('loginForm').classList.remove('hidden');
        $('subtitle').textContent = 'Masuk untuk melanjutkan';
        $('modeLabel').textContent = 'mode: login';
      }
    } catch {
      showAlert('❌ Tidak dapat menghubungi server');
    }
  }
  init();

  // Toggle password
  $('pwToggle').onclick = () => {
    const p = $('password');
    if (p.type === 'password') { p.type = 'text'; $('pwToggle').textContent = '🙈'; }
    else { p.type = 'password'; $('pwToggle').textContent = '👁'; }
  };

  // Setup
  $('setupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();
    const btn = $('setupBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span>Membuat...';
    try {
      const r = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: $('suUser').value.trim(),
          password: $('suPass').value,
          confirm: $('suConfirm').value,
        })
      });
      const d = await r.json();
      if (!r.ok) {
        showAlert('❌ ' + (d.error || 'Gagal'));
        btn.disabled = false; btn.textContent = '🚀 Buat Admin';
        return;
      }
      showAlert('✅ Admin dibuat! Silakan login.', 'success');
      $('setupForm').classList.add('hidden');
      $('loginForm').classList.remove('hidden');
      $('subtitle').textContent = 'Masuk untuk melanjutkan';
      $('modeLabel').textContent = 'mode: login';
      $('username').value = $('suUser').value.trim();
      $('password').focus();
    } catch (err) {
      showAlert('❌ ' + err.message);
      btn.disabled = false; btn.textContent = '🚀 Buat Admin';
    }
  });

  // Login
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();
    const btn = $('loginBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span>Memeriksa...';
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: $('username').value.trim(),
          password: $('password').value,
        })
      });
      const d = await r.json();
      if (!r.ok) {
        showAlert('❌ ' + (d.error || 'Login gagal'));
        btn.disabled = false; btn.textContent = '🔓 Masuk';
        $('password').value = '';
        return;
      }
      localStorage.setItem('authToken', d.token);
      localStorage.setItem('authUser', d.user);
      localStorage.setItem('authRole', d.role || 'user');
      localStorage.setItem('authExpires', Date.now() + d.expiresIn);
      btn.innerHTML = '✅ Mengalihkan...';
      setTimeout(() => location.replace('/'), 300);
    } catch (err) {
      showAlert('❌ ' + err.message);
      btn.disabled = false; btn.textContent = '🔓 Masuk';
    }
  });
})();