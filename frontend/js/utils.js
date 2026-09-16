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
};