// Helper umum — tersedia di seluruh aplikasi
window.Utils = {
  $: (id) => document.getElementById(id),

  escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])
    );
  },

  formatTime(d = new Date()) {
    return d.toLocaleTimeString();
  },

  notify(message, type = 'info') {
    const container = document.getElementById('appToast');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
  },
};