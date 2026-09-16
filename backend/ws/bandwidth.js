const { spawn } = require('child_process');
const WebSocket = require('ws');

// Format iperf3 output:
// [  5]   0.00-1.00   sec  11.2 MBytes  94.1 Mbits/sec
function parseIperfLine(line) {
  // Interval
  const intervalMatch = line.match(/\[\s*\d+\]\s+([\d.]+)-([\d.]+)\s+sec\s+([\d.]+)\s+(\w+)\s+([\d.]+)\s+(\w+)\/sec/);
  if (intervalMatch) {
    return {
      type: 'interval',
      start: parseFloat(intervalMatch[1]),
      end: parseFloat(intervalMatch[2]),
      bytes: parseFloat(intervalMatch[3]),
      bytesUnit: intervalMatch[4],
      rate: parseFloat(intervalMatch[5]),
      rateUnit: intervalMatch[6],   // Mbits, Kbits, Gbits
    };
  }
  return null;
}

module.exports = function bandwidthHandler(ws) {
  let proc = null;
  const send = (o) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); };

  ws.on('message', (msg) => {
    let data; try { data = JSON.parse(msg); } catch { return; }

    if (data.type === 'start') {
      if (proc) { try { proc.kill(); } catch {} proc = null; }

      const host = data.host;
      const duration = Math.min(Math.max(parseInt(data.duration) || 10, 3), 60);
      const port = parseInt(data.port) || 5201;
      const protocol = data.protocol === 'udp' ? 'udp' : 'tcp';

      if (!host || !/^[a-zA-Z0-9._\-]+$/.test(host)) {
        return send({ type: 'error', msg: 'Host tidak valid' });
      }

      const args = ['-c', host, '-t', String(duration), '-p', String(port)];
      if (protocol === 'udp') args.push('-u', '-b', '100M');   // UDP: bitrate unlimited → 100M
      args.push('--json');   // output JSON biar mudah parse

      send({ type: 'info', msg: `Memulai iperf3 ke ${host}:${port} (${protocol}, ${duration}s)...` });

      proc = spawn('iperf3', args, { shell: false });

      let buffer = '';
      let jsonOutput = '';

      proc.stdout.on('data', (chunk) => {
        jsonOutput += chunk.toString();
      });

      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        // iperf3 menampilkan progress di stderr
        for (const line of text.split(/\r?\n/)) {
          if (!line.trim()) continue;
          const parsed = parseIperfLine(line);
          if (parsed) send(parsed);
          else send({ type: 'stderr', msg: line.trim() });
        }
      });

      proc.on('close', (code) => {
        // Parse output JSON
        try {
          const json = JSON.parse(jsonOutput);
          const end = json.end;
          send({
            type: 'result',
            summary: {
              sent: {
                bytes: end.sum_sent?.bytes,
                bits_per_second: end.sum_sent?.bits_per_second,
                mbps: end.sum_sent?.bits_per_second ? (end.sum_sent.bits_per_second / 1e6).toFixed(2) : null,
              },
              received: {
                bytes: end.sum_received?.bytes,
                bits_per_second: end.sum_received?.bits_per_second,
                mbps: end.sum_received?.bits_per_second ? (end.sum_received.bits_per_second / 1e6).toFixed(2) : null,
              },
              retransmits: end.sum_sent?.retransmits || 0,
              jitter_ms: end.sum?.jitter_ms,
              lost_packets: end.sum?.lost_packets,
              lost_percent: end.sum?.lost_percent,
              cpu: end.cpu_utilization_percent,
            }
          });
        } catch (e) {
          send({ type: 'error', msg: 'Gagal parse output iperf3: ' + e.message });
        }
        send({ type: 'done', code });
        proc = null;
      });

      proc.on('error', (err) => {
        send({ type: 'error', msg: `Tidak bisa menjalankan iperf3: ${err.message}` });
        send({ type: 'hint', msg: 'Pastikan iperf3 terpasang di container & server target menjalankan "iperf3 -s"' });
        proc = null;
      });
    }
    else if (data.type === 'stop') {
      if (proc) { try { proc.kill('SIGTERM'); } catch {} proc = null; }
      send({ type: 'info', msg: 'Tes dihentikan' });
    }
  });

  ws.on('close', () => {
    if (proc) { try { proc.kill(); } catch {} proc = null; }
  });
};