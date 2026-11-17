// Router, chrome, main loop. The world is optional: if WebGL fails, every screen still works.
import { SCREENS, byId, SECS, bindWorld } from './screens.js';
import { toggleSound, soundOn } from './audio.js';

const $ = s => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || qs.get('rm') === '1';
const NOOP = new Proxy(function () { }, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : (k === 'real' ? false : (k === 'then' ? undefined : NOOP)), apply: () => NOOP });
let W = NOOP;
const toast = (msg, ms = 3500) => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); if (ms) toast.t = setTimeout(() => { t.hidden = true; }, ms); };

// ─── Router ───
const stage = $('#stage');
let current = null, pending = null, sims = [];
function makeCtx(el, opts) {
  const c = { el, W, opts, timers: [], clean: [], reduced, $: s => el.querySelector(s), $$: s => [...el.querySelectorAll(s)],
    go, after: (ms, fn) => { const id = setTimeout(fn, ms); c.timers.push(id); return id; },
    every: (ms, fn) => { const id = setInterval(fn, ms); c.clean.push(() => clearInterval(id)); return id; },
    sim: fn => { sims.push(fn); c.clean.push(() => { sims = sims.filter(f => f !== fn); }); },
    onResize: fn => { c.resize = fn; },
    // A drift-free clock. div subdivides the beat; cb(n) fires once per tick.
    clock: (bpm, div, cb, delayMs = 0) => {
      let t0 = performance.now() + delayMs, n = 0, spb = 60000 / bpm / div;
      const f = now => { let guard = 0; while (now >= t0 + n * spb && guard++ < 8) cb(n++, c); if (guard >= 8) { t0 = now; n = 0; } };
      c.sim(f);
      return { set(b) { const nw = performance.now(); spb = 60000 / b / div; t0 = nw; n = 0; bpm = b; }, phase() { return (performance.now() - t0) / (60000 / bpm); } };
    },
  };
  return c;
}
function resetWorld() {
  if (!W.real) return;
  const G = W.guitar;
  W.setViews([]); W.setFps(30); W.setKeyMul(1);
  G.setSteps(null); G.setArc(null); G.setInlayDim(1); G.setBreath(0); G.clearNotes(.25);
  const g2 = W.peekSecondNeck(); if (g2) g2.setSteps(null);
  W.amp.setVisible(true); W.amp.setBacklight(1); W.amp.setBreath(0); W.metro.setQuiet(0);
}
function show(id, opts = {}) {
  const s = byId[id] || byId.today;
  if (current) { current.ctx.clean.forEach(f => f()); current.ctx.timers.forEach(clearTimeout); const old = current.el; old.classList.add('out'); setTimeout(() => old.remove(), 260); }
  sims = [];
  document.body.classList.remove('c-app', 'c-session', 'c-first');
  document.body.classList.add('c-' + (s.chrome || 'app'));
  document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === s.tab));
  const el = document.createElement('div'); el.className = 'screen ' + (s.cls || ''); el.dataset.screen = s.id;
  el.innerHTML = s.html(opts);
  stage.appendChild(el);
  stage.scrollTop = 0;
  el.querySelectorAll('.rise,.fadein').forEach((n, i) => { if (!n.style.getPropertyValue('--i')) n.style.setProperty('--i', i); });
  const ctx = makeCtx(el, opts);
  current = { s, el, ctx, timers: ctx.timers };
  resetWorld();
  try { s.enter?.(ctx); } catch (e) { console.error('Screen failed:', s.id, e); throw e; }
  fitScrims(el);
  requestAnimationFrame(() => { if (current?.el === el) { fitScrims(el); if (W.real) W.refit(); } });
  document.title = `${s.title}: Yames mocks`;
  document.querySelectorAll('#index a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + id));
  window.__screen = id;
}
// Portrait neck shots run off the top of the slot: fade them out behind the words.
function fitScrims(el) {
  const sl = el.querySelector('[data-slot]'); if (!sl) return;
  const r = sl.getBoundingClientRect(), e = el.getBoundingClientRect(), sc = el.querySelector('[data-sct]'), sb = el.querySelector('[data-scb]');
  if (sc) sc.style.height = (r.top - e.top + 56) + 'px';
  if (sb) {
    sb.style.top = (r.bottom - e.top - 46) + 'px';
    // The scrim sits over the canvas, so an inset 3D view needs a window cut in it.
    const mini = el.querySelector('[data-mini]');
    if (mini && mini.offsetParent) { const m = mini.getBoundingClientRect(), t = r.bottom - 46; sb.style.cssText += `;-webkit-mask-image:linear-gradient(#000,#000),linear-gradient(#000,#000);mask-image:linear-gradient(#000,#000),linear-gradient(#000,#000);-webkit-mask-size:100% 100%,${m.width}px ${m.height}px;mask-size:100% 100%,${m.width}px ${m.height}px;-webkit-mask-position:0 0,${m.left - e.left}px ${m.top - t}px;mask-position:0 0,${m.left - e.left}px ${m.top - t}px;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-composite:xor;mask-composite:exclude`; }
  }
}
function go(id, opts = {}) { pending = opts; if (location.hash === '#' + id) { show(id, opts); pending = null; } else location.hash = id; }
addEventListener('hashchange', () => { const id = location.hash.slice(1) || 'today', o = pending || {}; pending = null; show(id, o); closeIndex(); });
document.addEventListener('click', e => {
  const n = e.target.closest('[data-nav]'); if (n) return go(n.dataset.nav);
  const g = e.target.closest('[data-go]'); if (g && !g.disabled) { let o = {}; try { o = g.dataset.opts ? JSON.parse(g.dataset.opts) : {}; } catch { /* none */ } return go(g.dataset.go, o); }
});

// ─── Index ───
const indexEl = $('#index'), indexBtn = $('#indexBtn');
function closeIndex() { indexEl.hidden = true; indexBtn.setAttribute('aria-expanded', 'false'); }
indexEl.innerHTML = Object.keys(SECS).map(k => `<h4>${k}. ${SECS[k]}</h4>` + SCREENS.filter(s => s.sec === k).map(s => `<a href="#${s.id}">${s.title}<span>#${s.id}</span></a>`).join('')).join('');
indexBtn.onclick = () => { indexEl.hidden = !indexEl.hidden; indexBtn.setAttribute('aria-expanded', String(!indexEl.hidden)); };
document.addEventListener('pointerdown', e => { if (!indexEl.hidden && !e.target.closest('#index') && !e.target.closest('#indexBtn')) closeIndex(); });
addEventListener('keydown', e => { if (e.key === 'Escape') closeIndex(); });
const soundBtn = $('#soundBtn');
soundBtn.onclick = () => { const on = toggleSound(); soundBtn.textContent = on ? 'Sound on' : 'Sound off'; soundBtn.setAttribute('aria-pressed', String(on)); };

// ─── Boot ───
function bootDone() { requestAnimationFrame(() => { $('#boot').classList.add('done'); setTimeout(() => $('#boot').remove(), 1000); document.body.classList.remove('booting'); }); window.__ready = true; }
function webglAvailable() { try { const c = document.createElement('canvas'); return !!(window.WebGL2RenderingContext && c.getContext('webgl2')); } catch { return false; } }
async function boot() {
  try { await Promise.race([Promise.all([document.fonts.load('700 40px "Barlow Condensed"'), document.fonts.load('500 40px Fraunces')]), new Promise(r => setTimeout(r, 2500))]); } catch { /* fallback fonts are fine */ }
  await new Promise(r => setTimeout(r, 30));
  let msg = '';
  if (qs.get('nogl') === '1' || !webglAvailable()) msg = "This device can't draw the 3D world, so you're seeing a flat version. Everything still works.";
  else {
    try {
      const { createWorld } = await import('./world.js');
      const forced = qs.has('q') ? +qs.get('q') : null;
      W = createWorld({ canvas: $('#gl'), forcedTier: forced, reduced, snap: qs.get('snap') === '1', maxFps: +(qs.get('maxfps') || 240),
        onLost: () => toast('The graphics chip was reset. Restoring the scene…', 0),
        onRestored: () => { toast('Scene restored.'); W.refit(); } });
      W.real = true;
    } catch (e) { console.warn('3D unavailable:', e); W = NOOP; msg = "The 3D world couldn't load, so you're seeing a flat version. Everything still works."; }
  }
  if (msg) { document.body.classList.add('nogl'); toast(msg, 8000); }
  bindWorld(W);
  window.__W = W;
  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (W.real) W.resize(); current?.ctx.resize?.(); if (current) fitScrims(current.el); }, 80); });
  const first = location.hash.slice(1) || 'today';
  show(first, qs.get('flow') === '1' ? { flow: true } : {});
  function loop(now) {
    if (!document.hidden) for (const f of sims.slice()) f(now);
    if (W.real) W.frame(now);
    window.__frames = (window.__frames || 0) + 1;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  bootDone();
}
boot().catch(e => { console.error(e); bootDone(); });
