// Fetch wrapper + WebSocket helper (butuh AUTH_TOKEN dari auth.js)
window.API = (() => {
  const _origFetch = window.fetch;
  const WRAPPED = Symbol('wrapped');

  if (!_origFetch[WRAPPED]) {
    window.fetch = async (url, opts = {}) => {
      if (typeof url === 'string' && url.startsWith('/api')) {
        opts.headers = opts.headers || {};
        if (window.AUTH?.token) {
          opts.headers['Authorization'] = 'Bearer ' + window.AUTH.token;
        }
      }
      const res = await _origFetch(url, opts);
      if (res.status === 401 && window.AUTH?.logout) {
        window.AUTH.logout();
      }
      return res;
    };
    window.fetch[WRAPPED] = true;
  }

  return {
    wsUrl(path) {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const t = window.AUTH?.token || '';
      return `${proto}://${location.host}${path}?token=${encodeURIComponent(t)}`;
    }
  };
})();