window.Users = (() => {
  const $ = Utils.$;

  function showAlert(message, type = 'error') {
    const alert = $('userAlert');
    alert.className = 'modal-alert show ' + type;
    alert.textContent = message;
  }

  function formatDate(seconds) {
    if (!seconds) return '-';
    return new Date(seconds * 1000).toLocaleString('id-ID');
  }

  async function load() {
    const list = $('userList');
    list.innerHTML = '<div class="empty-state">Memuat daftar user...</div>';
    try {
      const response = await fetch('/api/users');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal memuat user');
      list.innerHTML = (data.users || []).map(user => `
        <div class="user-row">
          <div>
            <strong>${Utils.escapeHtml(user.username)}</strong>
            <div class="user-meta">Dibuat: ${formatDate(user.created_at)} · Login: ${formatDate(user.last_login)}</div>
          </div>
          <div class="user-row-actions">
            <span class="role-badge ${user.role}">${user.role}</span>
            ${user.username === AUTH.user ? '<span class="user-current">Anda</span>' : `<button class="btn btn-danger btn-sm" data-delete-user="${user.id}">Hapus</button>`}
          </div>
        </div>`).join('') || '<div class="empty-state">Belum ada user.</div>';
      list.querySelectorAll('[data-delete-user]').forEach(button => {
        button.onclick = () => remove(button.dataset.deleteUser);
      });
    } catch (error) {
      list.innerHTML = `<div class="empty-state">${Utils.escapeHtml(error.message)}</div>`;
    }
  }

  async function remove(id) {
    if (!confirm('Hapus user ini?')) return;
    const response = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) return showAlert(data.error || 'Gagal menghapus user');
    showAlert('User berhasil dihapus.', 'success');
    load();
  }

  async function create() {
    const button = $('createUserBtn');
    button.disabled = true;
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: $('newUserName').value.trim(),
          password: $('newUserPassword').value,
          role: $('newUserRole').value,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal membuat user');
      $('newUserName').value = '';
      $('newUserPassword').value = '';
      showAlert('User berhasil ditambahkan.', 'success');
      load();
    } catch (error) {
      showAlert(error.message);
    } finally {
      button.disabled = false;
    }
  }

  return {
    init() {
      $('createUserBtn').onclick = create;
      $('reloadUsersBtn').onclick = load;
      load();
    },
  };
})();
