// Crisp 2D instruments drawn over the world: tab, timing ribbon, small charts.
import { timingClass } from './music.js';
const CL = { tone: '#4ee08a', tens: '#5aa9ff', clash: '#ff5d6c' };
const FONT = '"Barlow Condensed","Arial Narrow",system-ui,sans-serif';
function fit(c, cssH) {
  const w = c.clientWidth || 300, h = cssH, d = Math.min(devicePixelRatio || 1, 3);
  if (c.width !== Math.round(w * d) || c.height !== Math.round(h * d)) { c.width = Math.round(w * d); c.height = Math.round(h * d); c.style.height = h + 'px'; }
  const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
  return { g, w, h };
}
// Tab: one bar of sixteenths on the top string. Played notes wear their timing colour.
export function Tab(canvas, { frets, height = 128 }) {
  const st = { now: -1, played: [] };
  function draw() {
    const small = (canvas.clientWidth || 300) < 520, H = small ? Math.min(height, 88) : height;
    const { g, w, h } = fit(canvas, H);
    const L = small ? 18 : 30, R = 6, n = frets.length, step = (w - L - R) / n, y0 = small ? 26 : 38, gap = small ? 7.2 : 10.5;
    g.strokeStyle = 'rgba(232,214,186,.34)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(L - 4, y0 + i * gap); g.lineTo(w - R, y0 + i * gap); g.stroke(); }
    g.fillStyle = 'rgba(232,214,186,.6)'; g.font = `700 ${small ? 9 : 12}px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    ['T', 'A', 'B'].forEach((t, i) => g.fillText(t, 2, y0 + gap * (1.4 + i * 1.3)));
    g.textAlign = 'center';
    for (let i = 0; i < n; i++) {
      const x = L + step * (i + .5);
      if (i === st.now) {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,180,84,.42)'); gr.addColorStop(1, 'rgba(255,180,84,.08)');
        g.fillStyle = gr; g.beginPath(); g.roundRect(x - step * .46, 1, step * .92, h - 2, 5); g.fill();
      }
      g.fillStyle = 'rgba(232,214,186,.72)'; g.font = `600 ${small ? 11 : 15}px ${FONT}`;
      g.fillText(i % 2 ? 'V' : '⊓', x, small ? 9 : 13);
      const v = st.played[i];
      const col = v == null ? '#fbf5ea' : CL[timingClass(v)];
      const fs = small ? 16 : 25;
      g.font = `700 ${fs}px ${FONT}`;
      g.fillStyle = 'rgba(12,8,5,.96)'; g.fillRect(x - fs * .36, y0 - fs * .5, fs * .72, fs);
      g.fillStyle = col; g.fillText(frets[i], x, y0 + 1);
      if (i % 4 === 0) {
        const by = y0 + gap * 5 + (small ? 8 : 11);
        g.strokeStyle = 'rgba(232,214,186,.7)'; g.lineWidth = small ? 2 : 3; g.beginPath(); g.moveTo(x - step * .25, by); g.lineTo(x + step * 3.25, by); g.stroke();
        g.fillStyle = 'rgba(232,214,186,.8)'; g.font = `600 ${small ? 11 : 14}px ${FONT}`; g.fillText(i / 4 + 1, x, by + (small ? 8 : 11));
      }
    }
  }
  return { draw, set(now, played) { st.now = now; st.played = played; draw(); } };
}
// Timing ribbon: each note lands around its grid slot. Above the line is late, below is early.
export function Ribbon(canvas, { slots = 16, height = 84 }) {
  let vals = [], pulse = 0;
  function draw() {
    const small = (canvas.clientWidth || 300) < 520, H = small ? Math.min(height, 66) : height;
    const { g, w, h } = fit(canvas, H);
    const L = 34, R = 8, m = h / 2, step = (w - L - R) / slots;
    const band = g.createLinearGradient(0, 0, 0, h);
    band.addColorStop(0, 'rgba(12,8,5,.0)'); band.addColorStop(.32, 'rgba(78,224,138,.07)'); band.addColorStop(.5, 'rgba(78,224,138,.13)'); band.addColorStop(.68, 'rgba(78,224,138,.07)'); band.addColorStop(1, 'rgba(12,8,5,0)');
    g.fillStyle = band; g.fillRect(L, 0, w - L - R, h);
    g.strokeStyle = 'rgba(232,214,186,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(L, m); g.lineTo(w - R, m); g.stroke();
    g.fillStyle = 'rgba(232,214,186,.82)'; g.font = `500 11.5px Inter,system-ui,sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('late', 0, 9); g.fillText('early', 0, h - 9);
    for (let i = 0; i < slots; i++) { const x = L + step * (i + .5), big = i % 4 === 0; g.strokeStyle = big ? 'rgba(232,214,186,.42)' : 'rgba(232,214,186,.2)'; g.beginPath(); g.moveTo(x, m - (big ? 11 : 5)); g.lineTo(x, m + (big ? 11 : 5)); g.stroke(); }
    const scale = (m - 8) / 30;
    vals.forEach((v, i) => {
      if (v == null) return;
      const x = L + step * (i + .5), y = m - Math.max(-30, Math.min(30, v)) * scale, c = timingClass(v), col = CL[c], r = small ? 5.4 : 6.6;
      g.save(); g.shadowColor = col; g.shadowBlur = i === vals.length - 1 ? 16 : 6; g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.restore();
      g.lineWidth = 1.6; g.strokeStyle = 'rgba(10,7,5,.9)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
    });
  }
  return { draw, push(v) { if (vals.length >= slots) vals = []; vals.push(v); draw(); }, set(a) { vals = a.slice(); draw(); }, clear() { vals = []; draw(); } };
}
// One-series sparkline.
export function spark(vals, W = 96, H = 30) {
  const lo = Math.min(...vals), hi = Math.max(...vals), x = i => 4 + i * (W - 12) / (vals.length - 1), y = v => 5 + (hi - v) * (H - 10) / (hi - lo || 1);
  const d = vals.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(''), e = vals.length - 1;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend, from ${vals[0]} to ${vals[e]}" style="flex:none"><path d="${d}" fill="none" stroke="#ffb454" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${x(e)}" cy="${y(vals[e])}" r="4" fill="#ffb454" stroke="#14100c" stroke-width="1.5"/></svg>`;
}
// Tempo climb as a stepped line, with slips marked.
export function stepChart({ vals, labels, marks = [], min, max, W = 760, H = 210 }) {
  const L = 34, R = 50, T = 12, B = 24, x = i => L + i * (W - L - R) / (vals.length - 1), y = v => T + (max - v) * (H - T - B) / (max - min);
  let o = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tempo over time, ending at ${vals[vals.length - 1]} BPM" style="display:block;width:100%;height:auto">`;
  [min, (min + max) / 2, max].forEach(v => { o += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,232,200,.14)"/><text x="${L - 7}" y="${y(v) + 4}" text-anchor="end" font-size="13" fill="#c9bba6" font-family="Inter,sans-serif">${Math.round(v)}</text>`; });
  labels.forEach((t, i) => { if (t) o += `<text x="${x(i)}" y="${H - 5}" text-anchor="middle" font-size="13" fill="#c9bba6" font-family="Inter,sans-serif">${t}</text>`; });
  let d = ''; vals.forEach((v, i) => { d += i === 0 ? `M${x(i)} ${y(v)}` : `H${x(i)}V${y(v)}`; });
  o += `<path d="${d}" fill="none" stroke="#ffb454" stroke-width="2.5" stroke-linejoin="round"/>`;
  marks.forEach(i => { o += `<circle cx="${x(i)}" cy="${y(vals[i])}" r="6" fill="#ff5d6c" stroke="#14100c" stroke-width="2"><title>Slipped at ${vals[i]} BPM</title></circle>`; });
  const e = vals.length - 1;
  o += `<circle cx="${x(e)}" cy="${y(vals[e])}" r="6" fill="#ffb454" stroke="#14100c" stroke-width="2"/><text x="${x(e) + 11}" y="${y(vals[e]) + 7}" font-size="21" font-weight="700" fill="#fbf5ea" font-family="'Barlow Condensed',sans-serif">${vals[e]}</text>`;
  return o + '</svg>';
}
