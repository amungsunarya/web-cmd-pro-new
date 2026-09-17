// Bootstrap — dijalankan paling akhir
document.addEventListener('DOMContentLoaded', () => {
  // Auth handlers
  AUTH.attachHandlers();
  AUTH.startAutoLogout();

  document.querySelectorAll('[data-admin-only]').forEach((element) => {
    if (AUTH.role !== 'admin') element.remove();
  });

  // Tab switching and restore the last selected menu after refresh.
  function activateView(viewName, remember = true) {
    const tab = document.querySelector(`.tab[data-view="${viewName}"]`);
    const view = document.getElementById('view-' + viewName);
    if (!tab || !view) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    tab.classList.add('active');
    view.classList.add('active');
    if (remember) localStorage.setItem('activeMenu', viewName);
  }

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => activateView(tab.dataset.view));
  });

  document.getElementById('homeTitle').onclick = () => activateView('ping');
  const savedView = localStorage.getItem('activeMenu');
  activateView(savedView || 'ping', false);

  // Init modules
  Ping.init();
  SSH.init();
  Telnet.init();
  CmdTools.init();
  Bandwidth.init();
  Traffic.init();
  SNMP.init();
  if (AUTH.role === 'admin') Users.init();
});