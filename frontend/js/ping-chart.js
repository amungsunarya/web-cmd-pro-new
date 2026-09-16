// ============================================================
// Ping Chart — Line chart real-time dengan Canvas
// ============================================================
window.PingChart = (() => {

  /**
   * Buat instance chart untuk 1 device
   * @param {HTMLCanvasElement} canvas
   */
  function create(canvas) {
    const ctx = canvas.getContext('2d');
    let data = [];          // array of { t: timestamp, v: latency|null, alive: bool }
    const MAX_POINTS = 60;  // tampilkan 60 data terakhir

    // Handle resize — canvas responsif
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    window.addEventListener('resize', resize);
    setTimeout(resize, 50);

    // Push data baru
    function push(sample) {
      data.push({ t: Date.now(), v: sample.time, alive: sample.alive });
      if (data.length > MAX_POINTS) data.shift();
      draw();
    }

    // Hitung skala Y
    function calcScale() {
      const values = data.filter(d => d.alive && d.v != null).map(d => d.v);
      if (!values.length) return { min: 0, max: 50 };
      const min = Math.max(0, Math.min(...values) * 0.8);
      const max = Math.max(...values) * 1.2 + 5;
      return { min, max };
    }

    // Draw line + area + titik
    function draw() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;

      ctx.clearRect(0, 0, w, h);

      const pad = { top: 12, right: 8, bottom: 18, left: 32 };
      const cw = w - pad.left - pad.right;
      const ch = h - pad.top  - pad.bottom;

      // Background grid
      ctx.strokeStyle = 'rgba(51,65,85,0.5)';
      ctx.lineWidth = 1;
      ctx.font = '9px Consolas, monospace';
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      const { min, max } = calcScale();
      const range = max - min || 1;

      // Horizontal grid lines (4 garis)
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + (ch * i / 4);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();

        // Label Y
        const val = Math.round(max - (range * i / 4));
        ctx.fillText(val + 'ms', pad.left - 4, y);
      }

      if (!data.length) return;

      // X step per data point
      const stepX = cw / (MAX_POINTS - 1);

      // Y untuk nilai
      const yFor = (v) => pad.top + ch - ((v - min) / range) * ch;

      // Warna berdasarkan rata-rata
      const avg = data.filter(d => d.alive && d.v != null).reduce((s, d) => s + d.v, 0)
                / Math.max(1, data.filter(d => d.alive && d.v != null).length);
      const lineColor = avg < 50 ? '#4ade80' : avg < 150 ? '#f59e0b' : '#f87171';

      // Gambar garis
      ctx.beginPath();
      let started = false;
      let lastX = 0, lastY = 0;

      for (let i = 0; i < data.length; i++) {
        const d = data[i];
        const x = pad.left + i * stepX;

        if (!d.alive || d.v == null) {
          // Paket hilang — gambar titik merah di baseline
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(x - 2, pad.top + ch - 6, 4, 6);
          started = false;
          continue;
        }

        const y = yFor(d.v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
        lastX = x;
        lastY = y;
      }

      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      // Titik terakhir (highlight)
      if (started) {
        ctx.beginPath();
        ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = lineColor;
        ctx.fill();
        ctx.strokeStyle = '#0a0e1a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Reset
    function clear() {
      data = [];
      draw();
    }

    return { push, clear, resize };
  }

  return { create };
})();