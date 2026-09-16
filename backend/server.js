require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

// Modules
const authMiddleware = require('./config/auth');
const authRoutes      = require('./routes/auth');
const userRoutes      = require('./routes/users');
const cmdRoutes       = require('./routes/cmd');
const bandwidthRoutes = require('./routes/bandwidth');   // ← BARU
const trafficRoutes   = require('./routes/traffic');     // ← BARU
const snmpRoutes      = require('./routes/snmp');        // ← BARU
const pingWs          = require('./ws/ping');
const sshWs           = require('./ws/ssh');
const telnetWs        = require('./ws/telnet');
const bandwidthWs     = require('./ws/bandwidth');       // ← BARU
const trafficWs       = require('./ws/traffic');         // ← BARU
const snmpWs          = require('./ws/snmp');            // ← BARU
const db              = require('./db');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);
app.use(express.json({ limit: '256kb' }));

// =========================================
// ROUTES (API)
// =========================================
app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', authMiddleware, cmdRoutes);
app.use('/api', authMiddleware, bandwidthRoutes);
app.use('/api', authMiddleware, trafficRoutes);
app.use('/api', authMiddleware, snmpRoutes);

// =========================================
// STATIC (FRONTEND)
// =========================================
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));

// =========================================
// WEBSOCKET SERVERS
// =========================================
const wsMap = {
  '/ws/ping':      { wss: new WebSocket.Server({ noServer: true }), handler: pingWs },
  '/ws/ssh':       { wss: new WebSocket.Server({ noServer: true }), handler: sshWs },
  '/ws/telnet':    { wss: new WebSocket.Server({ noServer: true }), handler: telnetWs },
  '/ws/bandwidth': { wss: new WebSocket.Server({ noServer: true }), handler: bandwidthWs },
  '/ws/traffic':   { wss: new WebSocket.Server({ noServer: true }), handler: trafficWs },
  '/ws/snmp':      { wss: new WebSocket.Server({ noServer: true }), handler: snmpWs },
};

for (const [, { wss, handler }] of Object.entries(wsMap)) {
  wss.on('connection', handler);
}

// =========================================
// WS UPGRADE + AUTH
// =========================================
server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const entry = wsMap[pathname];
  if (!entry) { socket.destroy(); return; }

  let session = null;
  try {
    const token = new URL(req.url, 'http://localhost').searchParams.get('token');
    session = db.getSession(token);
  } catch {}
  if (!session) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  entry.wss.handleUpgrade(req, socket, head, (ws) => entry.wss.emit('connection', ws, req));
});

// =========================================
// CLEANUP SESSION
// =========================================
setInterval(() => {
  const n = db.cleanExpiredSessions();
  if (n) console.log(`🧹 ${n} session expired dihapus`);
}, 15 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`✅ Web CMD Pro v1.5 di http://localhost:${PORT}`);
  console.log(`💻 Platform: ${os.platform()}`);
  console.log(`🗄️  Database: ${process.env.DB_PATH || './data/app.db'}`);
  console.log(`👤 Total user: ${db.countUsers()}`);
  console.log(`📡 WS endpoints: ${Object.keys(wsMap).join(' ')}`);
  if (db.needsSetup()) console.log(`⚠️  BELUM ADA USER — buka browser untuk setup admin`);
});