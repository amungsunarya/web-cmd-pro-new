const net = require('net');
const WebSocket = require('ws');

function stripTelnet(buf) {
  const out = []; let i = 0;
  while (i < buf.length) {
    if (buf[i] === 255) {
      const c = buf[i + 1];
      if (c === 255) { out.push(255); i += 2; }
      else if (c === 250) {
        let j = i + 2;
        while (j < buf.length - 1 && !(buf[j] === 255 && buf[j + 1] === 240)) j++;
        i = j + 2;
      }
      else if (c >= 251 && c <= 254) i += 3;
      else i += 2;
    } else { out.push(buf[i]); i++; }
  }
  return Buffer.from(out);
}

function stripAnsi(str) {
  return str
    .replace(/\x1B\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1B\][^\x07]*\x07/g, '')
    .replace(/\x1B[=>]/g, '')
    .replace(/\r\n/g, '\n');
}

module.exports = function telnetHandler(ws) {
  let socket = null;
  const send = (o) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); };

  ws.on('message', (msg) => {
    let data; try { data = JSON.parse(msg); } catch { return; }

    if (data.type === 'connect') {
      if (socket) { socket.destroy(); socket = null; }
      const host = data.host;
      const port = parseInt(data.port) || 23;
      if (!host || !/^[a-zA-Z0-9._\-]+$/.test(host)) {
        return send({ type: 'error', msg: 'Host tidak valid' });
      }
      send({ type: 'status', msg: `Menghubungkan ke ${host}:${port}...` });
      socket = net.createConnection({ host, port });

      socket.on('connect', () => send({ type: 'status', msg: `✅ Terhubung ${host}:${port}`, status: 'connected' }));
      socket.on('data', (b) => {
        const c = stripTelnet(b);
        if (c.length) send({ type: 'data', data: stripAnsi(c.toString('utf8')) });
      });
      socket.on('error', (e) => {
        send({ type: 'error', msg: `❌ ${e.message}` });
        send({ type: 'status', msg: 'Terputus', status: 'disconnected' });
      });
      socket.on('close', () => {
        send({ type: 'status', msg: '🔌 Ditutup', status: 'disconnected' });
        socket = null;
      });
    } else if (data.type === 'input') {
      if (socket && socket.writable) socket.write(data.data);
    } else if (data.type === 'disconnect') {
      if (socket) { socket.destroy(); socket = null; }
    }
  });

  ws.on('close', () => { if (socket) socket.destroy(); });
};