const db = require('../db');

function getClientIp(req) {
  return (req.headers['x-forwarded-for']?.split(',')[0].trim())
      || req.socket?.remoteAddress
      || 'unknown';
}

function getToken(req) {
  const h = req.headers['authorization'];
  if (h?.startsWith('Bearer ')) return h.slice(7);
  if (req.query?.token) return req.query.token;
  return null;
}

function auth(req, res, next) {
  const s = db.getSession(getToken(req));
  if (!s) return res.status(401).json({ error: 'Unauthorized' });
  req.user = { id: s.user_id, username: s.username };
  next();
}

function adminOnly(req, res, next) {
  const u = db.findUser(req.user.username);
  if (!u || u.role !== 'admin') {
    return res.status(403).json({ error: 'Akses ditolak (admin only)' });
  }
  next();
}

module.exports = auth;
module.exports.getClientIp = getClientIp;
module.exports.getToken = getToken;
module.exports.adminOnly = adminOnly;