// Bootstrap — dijalankan paling akhir
document.addEventListener('DOMContentLoaded', () => {
  // Auth handlers
  AUTH.attachHandlers();
  AUTH.startAutoLogout();

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('view-' + tab.dataset.view).classList.add('active');
    });
  });

  // Init modules
  Ping.init();
  SSH.init();
  Telnet.init();
  CmdTools.init();
  Bandwidth.init();
  Traffic.init();
  SNMP.init();
});