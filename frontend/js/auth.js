// Auth check, logout, ganti password
window.AUTH = (() => {
  const token   = localStorage.getItem('authToken');
  const user    = localStorage.getItem('authUser') || 'user';
  const role    = localStorage.getItem('authRole') || 'user';
  const exp     = parseInt(localStorage.getItem('authExpires') || '0');

  // Cek login
  if (!token || Date.now() > exp) {
    ['authToken','authUser','authRole','authExpires'].forEach(k =>
      localStorage.removeItem(k));
    location.replace('/login.html');
    return {};
  }

  // Update UI
  const userEl = document.getElementById('userName');
  const roleEl = document.getElementById('roleBadge');
  if (userEl) userEl.textContent = user;
  if (roleEl) { roleEl.textContent = role; roleEl.classList.add(role); }

  function clearAll() {
    ['authToken','authUser','authRole','authExpires'].forEach(k =>
      localStorage.removeItem(k));
  }

  function logout() {
    clearAll();
    location.replace('/login.html');
  }

  return {
    token, user, role, exp,
    logout,

    // Pasang event logout & ganti password
    attachHandlers() {
      const logoutBtn = document.getElementById('logoutBtn');
      if (logoutBtn) {
        logoutBtn.onclick = async () => {
          if (!confirm('Yakin ingin logout?')) return;
          try {
            await fetch('/api/logout', {
              method: 'POST',
              headers: { 'Authorization': 'Bearer ' + token }
            });
          } catch {}
          logout();
        };
      }

      const passBtn = document.getElementById('changePassBtn');
      const passModal = document.getElementById('passModal');
      const passAlert = document.getElementById('passAlert');
      if (!passBtn || !passModal) return;

      window.closePassModal = () => {
        passModal.classList.remove('active');
        passAlert.className = 'modal-alert';
      };

      passBtn.onclick = () => {
        document.getElementById('passCurrent').value = '';
        document.getElementById('passNew').value = '';
        document.getElementById('passConfirm').value = '';
        passAlert.className = 'modal-alert';
        passModal.classList.add('active');
      };

      document.getElementById('passSubmitBtn').onclick = async () => {
        const current = document.getElementById('passCurrent').value;
        const next = document.getElementById('passNew').value;
        const confirm = document.getElementById('passConfirm').value;
        const btn = document.getElementById('passSubmitBtn');
        passAlert.className = 'modal-alert';
        if (!current || !next) {
          passAlert.className = 'modal-alert error show';
          passAlert.textContent = '❌ Semua field wajib diisi';
          return;
        }
        if (next !== confirm) {
          passAlert.className = 'modal-alert error show';
          passAlert.textContent = '❌ Konfirmasi tidak sama';
          return;
        }
        btn.disabled = true; btn.textContent = '⏳ Menyimpan...';
        try {
          const r = await fetch('/api/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ current, next, confirm })
          });
          const d = await r.json();
          if (!r.ok) {
            passAlert.className = 'modal-alert error show';
            passAlert.textContent = '❌ ' + (d.error || 'Gagal');
            return;
          }
          passAlert.className = 'modal-alert success show';
          passAlert.textContent = '✅ Password diubah. Login ulang...';
          setTimeout(logout, 1500);
        } catch (e) {
          passAlert.className = 'modal-alert error show';
          passAlert.textContent = '❌ ' + e.message;
        } finally {
          btn.disabled = false; btn.textContent = '💾 Simpan';
        }
      };
    },

    // Auto logout saat expired
    startAutoLogout() {
      setInterval(() => {
        if (Date.now() > parseInt(localStorage.getItem('authExpires') || '0')) {
          alert('Sesi berakhir. Login kembali.');
          logout();
        }
      }, 60000);
    }
  };
})();