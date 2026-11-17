// Light Web Audio. Off until tapped, and always mutable.
let ctx = null, on = false, master = null;
export const soundOn = () => on;
export function toggleSound() {
  on = !on;
  if (on && !ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) { ctx = new AC(); master = ctx.createGain(); master.gain.value = .5; master.connect(ctx.destination); } }
  if (ctx) { if (on) ctx.resume(); else ctx.suspend(); }
  return on;
}
function env(g, t, a, d) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + .004); g.gain.exponentialRampToValueAtTime(.0005, t + d); }
export function click(strong = false) {
  if (!on || !ctx) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'square'; o.frequency.value = strong ? 1760 : 1180; env(g, t, strong ? .22 : .14, .045);
  o.connect(g).connect(master); o.start(t); o.stop(t + .06);
}
export function pluck(midi, level = .3) {
  if (!on || !ctx) return;
  const t = ctx.currentTime, f = 440 * Math.pow(2, (midi - 69) / 12);
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.value = f; o2.type = 'triangle'; o2.frequency.value = f * 2.001;
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(Math.min(6000, f * 7), t); lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.4), t + .5);
  env(g, t, level, 1.1);
  o.connect(lp); o2.connect(lp); lp.connect(g).connect(master);
  o.start(t); o2.start(t); o.stop(t + 1.2); o2.stop(t + 1.2);
}
export function bass(midi, level = .24) {
  if (!on || !ctx) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'triangle'; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12); env(g, t, level, .42);
  o.connect(g).connect(master); o.start(t); o.stop(t + .5);
}
export function hat(level = .05) {
  if (!on || !ctx) return;
  const t = ctx.currentTime, n = ctx.sampleRate * .04, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(), g = ctx.createGain(), hp = ctx.createBiquadFilter();
  s.buffer = b; hp.type = 'highpass'; hp.frequency.value = 7000; env(g, t, level, .04);
  s.connect(hp).connect(g).connect(master); s.start(t);
}
