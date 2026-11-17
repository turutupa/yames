// Every screen: its words (taken from the concept mocks), its place in the world, and what's alive on it.
import { PLAN, BLUES, ALT, TAB_FRETS, TIMING_SEQ, chordNotes, windowFor, parseChords, noteName, OPEN, timingClass } from './music.js';
import { Tab, Ribbon, spark, stepChart, NeckStrip } from './widgets.js';
import * as snd from './audio.js';

let W;
export const bindWorld = w => { W = w; };
const portrait = () => innerHeight > innerWidth * 1.08;
const midi = (s, f) => OPEN[s - 1] + f;

// ─── Shots ───
// The fretboard is the hero: square-on enough that every fret, dot and note reads at a glance, with no blur over any of it.
// Landscape looks down at the board. Portrait looks up the neck from the body end.
function neckShot(lo, hi, slot, o = {}) {
  const p = portrait();
  return {
    show: [o.guitar && o.guitar !== W.guitar ? 'neck2' : 'guitar'], numScale: p ? 1 : .66,
    points: () => (o.guitar || W.guitar).windowPoints(lo, hi), slot,
    dir: o.dir || (p ? [.95, 1, 0] : [0, 1, .34]), fov: o.fov ?? (p ? 40 : 22), fill: o.fill ?? 1, fillY: o.fillY,
    key: { angle: .52, i: o.keyI ?? 3.0, offset: [-.9, 7.2, 2.4], ...(o.key || {}) }, rim: .6, env: .46, pool: o.pool ?? .9, drift: o.drift ?? 0,
  };
}
// The whole instrument: nut to 24, square on, with its real fret spacing.
const fullNeck = (slot, o = {}) => {
  const g = o.guitar || W.guitar;
  return {
    show: [g === W.guitar ? 'guitar' : 'neck2'], numScale: o.numScale ?? (portrait() ? 2.4 : 1.55),
    points: () => g.windowPoints(0, 24), slot, anchor: o.anchor,
    dir: [0, 1, .26], fov: 14, fill: o.fill ?? 1,
    key: { angle: .62, i: 3.1, offset: [-.6, 7.4, 2.2] }, rim: .6, env: .5, pool: o.pool ?? (portrait() ? .55 : 1.1), drift: 0,
  };
};
const meterShot = (slot, o = {}) => ({
  show: ['amp'], points: () => W.amp.pointsMeter(o.pad ?? .2), slot, dir: o.dir || [.03, .17, 1], fov: 18, fill: o.fill ?? 1,
  key: { i: 1.9, angle: .5, offset: [-1.6, 6, 6] }, rim: .6, env: .5, pool: 1.1, post: { bloom: .18 }, drift: o.drift ?? 0,
});
const tubesShot = (slot, o = {}) => ({
  show: ['amp'], points: () => W.amp.pointsTubes(), slot, dir: o.dir || [.1, .22, 1], fov: 24, fill: o.fill ?? 1,
  key: { i: o.keyI ?? .9, angle: .5, offset: [-1.5, 6, 5] }, rim: .4, env: .3, pool: .8, post: { bloom: .34 }, drift: .02,
});
const metroShot = (slot, o = {}) => ({
  show: ['metro'], points: () => W.metro.points(), slot, dir: o.dir || [.24, .14, 1], fov: 22, fill: o.fill ?? .98,
  key: { i: 3.0, angle: .42, offset: [-2.4, 7, 5] }, rim: 1, env: .55, pool: 1.3, post: { bloom: .14 },
});
const pedalShot = (slot, n = 4) => ({
  show: ['pedals'], points: () => W.pedals.pointsFor(Math.max(4, n)), slot, dir: [0, 1.15, .72], fov: 24, fill: .98,
  key: { i: 2.6, angle: .6, offset: [-1.8, 8, 2.5] }, rim: .5, env: .5, pool: .7, post: { bloom: .14 },
});

// ─── Snippets ───
const stripHtml = (c = '') => `<div class="neckstrip ${c}" data-strip></div>`;
function useStrip(c, lo, hi, notes = []) { const st = NeckStrip(c.$('[data-strip]')); c.clean.push(st.destroy); st.set(lo, hi); st.notes(notes); return st; }
const pri = (t, go, c = '', o) => `<button class="btn pri ${c}" data-go="${go}" ${o ? `data-opts='${JSON.stringify(o)}'` : ''}>${t}</button>`;
const sec = (t, go, c = '') => `<button class="btn ${c}" ${go ? `data-go="${go}"` : ''}>${t}</button>`;
const lnk = (t, go) => `<button class="link" data-go="${go}">${t}</button>`;
const coach = (t, g, c = '') => `<div class="coachline glass ${c}"><i class="lamp ${g ? 'g' : ''}"></i><div data-coach>${t}</div></div>`;
const TAG = { t: '<span class="tag t">Theory</span>', m: '<span class="tag m">Mechanics</span>', j: '<span class="tag">Jam, not graded</span>', r: '<span class="tag m">Ramp up</span>' };
const beats = () => `<div class="beats" data-beats aria-hidden="true"><i class="d"></i><i></i><i></i><i></i></div>`;
const sbar = ({ at = 1, of = 3, left = '', exit = 'today', exitText = 'Exit' }) => `<div class="sbar"><button data-go="${exit}">${exitText}</button><div class="pips">${Array.from({ length: of }, (_, i) => `<i class="${i < at - 1 ? 'done' : i === at - 1 ? 'on' : ''}"></i>`).join('')}</div><span class="left">${left}</span></div>`;
const frun = n => `<div class="sbar"><div class="brand" style="font-size:18px">YAM<b>E</b>S</div><div class="pips">${[1, 2, 3, 4, 5].map(i => `<i class="${i < n ? 'done' : i === n ? 'on' : ''}"></i>`).join('')}</div></div>`;
const barsHtml = b => `<div class="bars" data-bars>${b.map(x => `<div class="bar ${x[2]}"><span>${x[0]}</span><span>${x[1] || '&nbsp;'}</span></div>`).join('')}</div>`;
const setBeat = (c, i) => { const bs = c.$('[data-beats]'); if (bs) [...bs.children].forEach((d, k) => d.classList.toggle('on', k === i)); };
const pop = (el, cls = 'pop') => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
const tubesAt = v => Array(8).fill(v);

// ─── The take data ───
const BAR_CH = ['A7', 'D7', 'A7', 'E7', 'A7', 'D7', 'A7', 'E7'];
const landing = take => [
  { s: 1, f: 5, cls: 'tone' }, take === 1 ? { s: 2, f: 8, cls: 'clash' } : { s: 3, f: 7, cls: 'tone' },
  { s: 4, f: 7, cls: 'tone' }, { s: 3, f: 9, cls: 'tone' }, { s: 3, f: 6, cls: 'tone' }, { s: 2, f: 8, cls: 'clash' }, { s: 2, f: 5, cls: 'tone' }, { s: 3, f: 9, cls: 'tone' },
];
const state = { takes: 0, flow: false };
const LANDBARS = [['A7', 'A', 'tone'], ['D7', 'D', 'tone'], ['A7', 'A', 'tone'], ['E7', 'E', 'tone'], ['A7', 'C#', 'tone'], ['D7', 'G', 'clash'], ['A7', 'E', 'tone'], ['E7', 'E', 'tone']];
const showD7 = (G, tone = true) => { G.setNotes([...chordNotes('D7', 4, 9, 'tone', false).filter(n => !(n.s === 2 && n.f === 8)), { s: 2, f: 8, kind: 'clash', t: 'G', ring: true }]); G.setArc(2, 8, 7); };

// ─── Running an exercise over chord changes (shared by Theory and Setlist) ───
function runChanges(c, { bpm = 75, start = 0, take = 2, onEnd, slot, loop }) {
  const G = W.guitar, L = landing(take), strip = useStrip(c, ...windowFor(BAR_CH[start]));
  let barsDone = start;
  const chips = () => c.$$('[data-bars] .bar');
  const paint = (i, ch, note, cls) => { const b = chips()[i]; if (b) { b.className = 'bar ' + cls; b.children[1].innerHTML = note || '&nbsp;'; } };
  const prefill = n => { for (let i = 0; i < 8; i++) { const l = L[i]; if (i < n) paint(i, 0, noteName(l.s, l.f), l.cls); else paint(i, 0, '', i === n ? 'now' : ''); } };
  const chord = c.$('[data-chord]'), next = c.$('[data-next]'), feed = c.$('[data-feed]'), hint = c.$('[data-hint]');
  const setChord = (i) => {
    const ch = BAR_CH[i], nx = BAR_CH[(i + 1) % 8], [lo, hi] = windowFor(ch);
    if (chord) { chord.textContent = ch; pop(chord); }
    if (next) next.textContent = 'then ' + nx;
    if (hint) hint.textContent = `Amber: ${ch}'s chord tones, the notes to land on in bar ${i + 1}.`;
    const list = chordNotes(ch, lo, hi, 'aim', !portrait());
    G.setNotes(list, { fade: .22 }); strip.set(lo, hi); strip.notes(list);
  };
  prefill(start); setChord(start);
  const show = (i, l) => {
    if (!feed) return;
    const n = noteName(l.s, l.f), good = l.cls === 'tone';
    feed.innerHTML = `<b class="${good ? 'g' : 'r'}">${n}</b><span>${good ? `<span class="g">Chord tone</span> of ${BAR_CH[i]}, bar ${i + 1}` : `<span class="r">Clash</span> over ${BAR_CH[i]}, bar ${i + 1}`}</span>`;
    pop(feed);
  };
  if (start > 0) show(start - 1, L[start - 1]);
  return c.clock(bpm, 1, n => {
    const bi = n % 4, bar = barsDone;
    setBeat(c, bi);
    snd.click(bi === 0);
    if (bi === 0) {
      setChord(bar);
      prefill(bar);
      const l = L[bar];
      G.pluck(l.s, l.f, l.cls, { amp: .0075, light: 1, glow: 1, flash: 1, reduce: c.reduced });
      snd.pluck(midi(l.s, l.f), .34);
      paint(bar, 0, noteName(l.s, l.f), l.cls);
      show(bar, l);
    } else if (bi === 2 && Math.random() < .7) {
      const [lo] = windowFor(BAR_CH[bar]), s = 1 + Math.floor(Math.random() * 3), f = lo + 1 + Math.floor(Math.random() * 3);
      G.pluck(s, f, 'box', { amp: .0035, light: 0, glow: .16, flash: .1, reduce: c.reduced });
      snd.pluck(midi(s, f), .12);
    } else if (bi === 3) {
      // Glide to where the next chord sits, arriving on the change.
      const nx = (bar + 1) % 8, [a, b] = windowFor(BAR_CH[nx]);
      if (nx !== 0 || loop || !onEnd) { W.go(neckShot(a, b, slot), { dur: 60 / bpm * .92 }); strip.set(a, b); }
      if (bar === 7) {
        barsDone = 0;
        if (onEnd) c.after(60000 / bpm, onEnd); else { c.after(60000 / bpm * .9, () => prefill(0)); }
      } else barsDone++;
    }
  });
}

// ─── Screens ───
function todayScreen({ id, title, key, lead, extra = '', sub = '', cls = '' }) {
  const list = (min) => PLAN[key][min].map((i, k) => `<div class="item glass rise" style="--i:${k}"><div class="mins">${i[2]}<small>MIN</small></div><div class="grow"><div class="row wrap" style="gap:7px"><span class="h3">${i[1]}</span>${TAG[i[0]]}</div><div class="why">${i[3]}</div></div></div>`).join('');
  return {
    sec: 'B', id, title, tab: 'today', cls: 'is-today',
    html: () => `<div class="today">
        <div class="hero">
          <div class="titles">
            <div class="kick rise" style="--i:0">${lead}</div>
            <div class="mega rise" style="--i:1">Today</div>
            <div class="mins-line rise" style="--i:2" data-mins>10 min</div>
          </div>
          <div class="startbox rise" style="--i:3"><button class="btn pri big" data-start>Start</button></div>
          <div class="segbox rise" style="--i:4"><div class="label">How long have you got? Minutes:</div><div class="seg" role="group" aria-label="Minutes">${[5, 10, 15, 20].map(n => `<button class="${n === 10 ? 'on' : ''}" data-min="${n}" aria-pressed="${n === 10}">${n}</button>`).join('')}</div></div>
          ${sub ? `<div class="sm q rise donly" style="--i:5">${sub}</div>` : ''}
        </div>
        <div class="slot heroslot" data-slot></div>
        <div class="plan">
          <div class="planhead"><div class="kick rise" style="--i:4">What's in it, and why</div>${extra}</div>
          <div class="planlist" data-list>${list(10)}</div>
        </div>
      </div>`,
    enter(c) {
      const G = W.guitar, slot = c.$('[data-slot]');
      W.setFps(30);
      W.go(fullNeck(slot), { dur: c.opts.first ? 0 : 1.7, lift: .4 });
      W.amp.setTubes(tubesAt(.62), { stagger: .06 });
      G.sweep({ dur: 2.2, power: 2.6 });
      c.$$('[data-min]').forEach(b => { b.onclick = () => {
        const m = +b.dataset.min;
        c.$$('[data-min]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
        c.$('[data-mins]').textContent = m + ' min';
        c.$('[data-list]').innerHTML = list(m);
        G.strum('aim', .03, .007); G.sweep({ dur: 1, power: 2.6 });
      }; });
      c.$('[data-start]').onclick = () => { state.takes = 0; state.flow = true; c.go('theory', { countIn: true, flow: true }); };
    },
  };
}

const theory = {
  sec: 'C', id: 'theory', title: 'Running: Theory exercise', chrome: 'session', cls: 'is-take',
  html: () => `<div class="scrim-take" data-sct></div>${sbar({ at: 1, left: '9 min left' })}
    <div class="taketop none">
      <div class="takeinfo"><div class="kick">Theory · Blues path, step 2</div><div class="h3">Landing on chord tones</div><div class="why">Because you missed D7 yesterday. <span class="donly">Pass bar: 7 of 8 landings.</span><span class="ponly">Bar: 7 of 8.</span></div></div>
      <div class="chordrow"><div class="chord" data-chord>A7</div><div class="col" style="gap:clamp(6px,1.2vh,12px)"><div class="nextc" data-next>then D7</div>${beats()}</div></div>
      <div class="feed" data-feed></div>
      <div class="bpm num">75<small>BPM</small></div>
    </div>
    <div class="slot" data-slot></div>
    ${stripHtml()}
    <div class="sm q none" data-hint></div>
    ${barsHtml(BAR_CH.map(ch => [ch, '', '']))}
    <div class="row between none"><span class="why">Hold the pedal to end</span><button class="btn" data-end>End take</button></div>
    <div class="countin" data-countin hidden></div>`,
  enter(c) {
    const G = W.guitar, slot = c.$('[data-slot]');
    W.setFps(60); G.setInlayDim(.16); W.amp.setTubes(tubesAt(0), { stagger: 0 });
    const finish = () => { if (state.takes < 1) { state.takes = 1; c.go('between', { flow: state.flow }); } else c.go('result', { flow: state.flow }); };
    c.$('[data-end]').onclick = finish;
    const take = c.opts.take || (state.takes >= 1 ? 2 : (c.opts.flow ? 1 : 2));
    const flow = !!c.opts.flow, cIn = !!c.opts.countIn && !c.reduced;
    const start = flow ? 0 : 4;
    W.go(neckShot(...windowFor(BAR_CH[start]), slot), { dur: cIn ? 1.8 : 1.3, lift: cIn ? .9 : .3 });
    const run = () => runChanges(c, { bpm: 75, start, take, slot, onEnd: flow ? finish : null, loop: !flow });
    if (cIn) {
      const ci = c.$('[data-countin]'); ci.hidden = false; const spb = 800;
      G.setNotes(chordNotes('A7', 4, 9, 'aim', !portrait()), { fade: 1.2 });
      G.strum('aim', .05, .012);
      c.$('[data-feed]').innerHTML = '';
      [1, 2, 3, 4].forEach((n, i) => c.after(i * spb, () => { ci.innerHTML = `<b>${n}</b>`; setBeat(c, i); snd.click(i === 0); }));
      c.after(4 * spb, () => { ci.hidden = true; run(); });
    } else run();
  },
};

function mechSim(c, { bpm = 80, onEnd, seek = 4 }) {
  const G = W.guitar, tab = Tab(c.$('canvas.tab'), { frets: TAB_FRETS, height: 128 }), rib = Ribbon(c.$('canvas.ribbon'), { slots: 16, height: 84 });
  c.onResize(() => { tab.draw(); rib.draw(); });
  let bar = seek, played = [];
  const EVEN = [81, 83, 85, 85, 86, 85, 86, 86];
  const even = c.$('[data-even]'), notes = c.$('[data-right]'), bars = c.$('[data-barsn]'), line = c.$('[data-coach]');
  const LINES = { 4: 'Bar 5, beat 3 came in early. Otherwise tight.', 6: 'That shift to the 8th fret is where it gets loose.' };
  const box = [5, 7, 8].map(f => ({ s: 1, f, kind: 'aim', t: noteName(1, f) }));
  G.setNotes(box, { fade: .3 });
  useStrip(c, ...(portrait() ? [5, 8] : [3, 10]), box);
  tab.draw(); rib.draw();
  return c.clock(bpm, 4, n => {
    const i = n % 16;
    if (i === 0) { played = []; rib.clear(); }
    const base = TIMING_SEQ[i] + (Math.random() - .5) * 3, v = bar === 7 && i === 10 ? 12 : base;
    played[i] = v;
    const cls = timingClass(v), f = TAB_FRETS[i];
    G.pluck(1, f, cls, { amp: .0028, light: cls === 'tone' ? .22 : .5, glow: .5, flash: .34, reduce: c.reduced });
    snd.pluck(midi(1, f), .13);
    if (i % 4 === 0) { snd.click(i === 0); setBeat(c, i / 4); }
    tab.set(i, played); rib.push(v);
    if (i === 0 && even) even.textContent = EVEN[Math.min(7, bar)] + '%';
    if (i === 15) { bar++; if (bars) bars.innerHTML = `${Math.min(8, bar + 1)}<span class="q" style="font-size:.6em"> / 8</span>`; if (line && LINES[bar]) line.textContent = LINES[bar]; if (bar >= 8) { if (onEnd) { bar = 0; onEnd(); } else { bar = seek; if (bars) bars.innerHTML = `${bar + 1}<span class="q" style="font-size:.6em"> / 8</span>`; } } }
  });
}
const mechanics = {
  sec: 'C', id: 'mechanics', title: 'Running: Mechanics exercise', chrome: 'session', cls: 'is-take is-mech',
  html: () => `<div class="scrim-take" data-sct></div>${sbar({ at: 2, left: '4 min left', exit: 'today' })}
    <div class="takeinfo none"><div class="kick">Mechanics · Alternate Picking path, step 2</div><div class="h3">Even sixteenths</div><div class="why">Because evenness was 78% at 80 BPM. Pass bar: 85%.</div></div>
    <div class="row between none" style="gap:clamp(14px,2.4vw,36px);align-items:flex-end">
      <div class="stat xl"><b class="g" data-even>86%</b><span>even, this take</span></div>
      <div class="stat"><b data-right>98%</b><span>right notes</span></div>
      <div class="stat"><b data-barsn>5<span class="q" style="font-size:.6em"> / 8</span></b><span>bars</span></div>
      <div class="grow donly" style="max-width:560px"><canvas class="ribbon" aria-label="Timing of each note against the grid"></canvas></div>
      <div class="bpm num">80<small>BPM</small></div>
    </div>
    <div class="ponly none"><canvas class="ribbon" aria-label="Timing of each note against the grid"></canvas></div>
    <div class="slot" data-slot></div>
    ${stripHtml()}
    <div class="mechlow none">
      <div class="glass panelc"><canvas class="tab" role="img" aria-label="Tab: fifth, seventh and eighth fret on the high E string, in sixteenths"></canvas></div>
      <div class="col" style="gap:6px;justify-content:center">${coach('Bar 5, beat 3 came in early. Otherwise tight.')}<div class="why">I hear notes and timing. Down-up is on you: I can't hear pick direction.</div></div>
    </div>
    <div class="row between none wrap" style="row-gap:5px"><div class="grow"></div><div class="row">${lnk('Mock: what if it can\'t hear enough?', 'nocatch')}<button class="btn pri" data-go="result-mech" data-opts='{"flow":true}'>End take</button></div></div>`,
  enter(c) {
    W.setFps(60); W.guitar.setInlayDim(.16); W.amp.setTubes(tubesAt(0), { stagger: 0 });
    const slot = c.$('[data-slot]');
    // Two canvases for the two layouts: use the visible one.
    const ribs = c.$$('canvas.ribbon'); const vis = ribs.find(r => r.offsetParent !== null); ribs.forEach(r => { if (r !== vis) r.remove(); });
    const p = portrait();
    mechSim(c, { onEnd: c.opts.flow ? () => c.go('result-mech', { flow: true }) : null });
    W.go(neckShot(p ? 5 : 3, p ? 8 : 10, slot, p ? { dir: [1.2, 1, 0], fov: 42 } : {}), { dur: 1.3, lift: .3 });
  },
};
const between = {
  sec: 'C', id: 'between', title: 'Between takes', chrome: 'session',
  html: () => `<div class="scrim-split donly"></div><div class="scrim-take" data-sct></div>${sbar({ at: 1, left: '8 min left' })}
    <div class="split">
      <div class="col" style="justify-content:center">
        <div class="kick rise">Take 1 done · Landing on chord tones</div>
        <div class="row base rise" style="gap:12px"><div class="mega num" style="font-weight:700;letter-spacing:0">6 <span class="q">of 8</span></div><div class="h3 q">landings</div></div>
        <div class="rise">${coach('Both misses were on D7. Aim for F#, one fret below that G.')}</div>
        <div class="rise">${pri('Go again, 75 BPM', 'theory', 'big', { flow: true, take: 2 })}</div>
        <div class="row wrap rise" style="align-items:stretch">
          <div class="glass card grow" style="min-width:230px"><div class="row between"><div class="kick">Just say it</div><div class="row sm q" style="gap:5px"><i class="lamp g"></i>Listening</div></div><div class="say" style="margin-top:7px"><span class="key">again</span><span class="why">Same tempo</span><span class="key">slower / faster</span><span class="why">Change tempo by 5 BPM</span><span class="key">why</span><span class="why">Coach explains the miss</span><span class="key">next</span><span class="why">Move on</span></div></div>
          <div class="glass card donly" style="flex:0 1 210px"><div class="kick">Foot pedal</div><div class="say" style="margin-top:7px"><span class="ped">Tap</span><span class="why">Do the big action</span><span class="ped">Double tap</span><span class="why">Slower</span><span class="ped">Hold</span><span class="why">Next</span></div></div>
        </div>
      </div>
      <div class="col" style="min-height:0;flex:1 1 0"><div class="slot" data-slot></div>${stripHtml()}</div>
    </div>`,
  enter(c) {
    const G = W.guitar;
    useStrip(c, 5, 10, [{ s: 2, f: 8, kind: 'clash' }, { s: 2, f: 7, kind: 'aim' }]);
    W.go(neckShot(5, 10, c.$('[data-slot]')), { dur: 1.5 });
    c.after(800, () => { G.setNotes([{ s: 2, f: 8, kind: 'clash', t: 'G', ring: true }, { s: 2, f: 7, kind: 'aim', t: 'F#' }]); G.setArc(2, 8, 7); });
    c.every(2200, () => G.pluck(2, 7, 'aim', { amp: .006, light: .7, glow: .7, flash: .7, reduce: c.reduced }));
  },
};
const result = {
  sec: 'C', id: 'result', title: 'Result of a take: Theory', chrome: 'session', cls: 'is-result',
  html: () => `<div class="scrim-t" style="height:64px"></div><div class="scrim-below" data-scb></div>${sbar({ at: 1, left: '5 min left' })}
    <div class="slot" data-slot style="flex:1 1 34%"></div>
    <div class="col none" style="gap:8px">
      <div class="kick fadein" style="--i:1">Take 2 · Landing on chord tones · 75 BPM</div>
      <div class="row base wrap" style="gap:clamp(8px,1.6vw,18px)"><span class="num q fadein" style="--i:2;font-size:clamp(48px,10vh,96px);line-height:.9">6 →</span><span class="num g moved" data-moved style="font-size:clamp(108px,22vh,210px);line-height:.84;opacity:0">7</span><span class="h2 fadein" style="--i:3">of 8 landings</span><span class="tag ok" data-tagok style="opacity:0;font-size:15px">Pass bar met</span></div>
      <div class="bars" data-bars>${LANDBARS.map((x) => `<div class="bar"><span>${x[0]}</span><span>&nbsp;</span></div>`).join('')}</div>
    </div>
    <div class="split none result-low" style="flex:none">
      <div class="col fadein" style="--i:8">${coach('D7 is better: one of two landed. Bar 6 was G, which clashes. Next time try F#, one fret down.')}</div>
      <div class="view donly" data-mini style="height:clamp(96px,17vh,180px);border-radius:12px;overflow:hidden;border:1px solid var(--line)"></div>
    </div>
    <div class="fadein" style="--i:10" data-next>${pri('Next: Even sixteenths', 'mechanics', 'mid', { flow: true })}</div>
    <div class="row between wrap fadein" style="--i:11"><span class="why">Say <span class="key">next</span> or tap the pedal</span>${lnk('Why does that note clash?', 'coach')}</div>`,
  enter(c) {
    const G = W.guitar, A = W.amp;
    A.setMeter({ mode: 'tempo', clean: null, slip: null, mark: null, value: 75, instant: true }); A.setBacklight(.2); G.setNumberScale(1.3);
    W.setKeyMul(.28);
    W.go(tubesShot(c.$('[data-slot]')), { dur: 1.5, lift: 1 });
    showD7(G);
    const mini = c.$('[data-mini]');
    if (mini && mini.offsetParent) W.setViews([{ el: mini, spec: { show: ['guitar'], points: () => G.windowPoints(4, 9), dir: [0, 1, .34], fov: 20, fill: 1, overlay: true, key: { i: 3, angle: .5, offset: [-.9, 7.2, 2.4] } } }], { overlayInMain: false });
    A.setTubes(tubesAt(0), { stagger: 0 });
    const lv = LANDBARS.map(b => b[2] === 'clash' ? 'clash' : 1), stag = 150, d0 = 900;
    A.setTubes(lv, { stagger: stag / 1000, delay: d0 / 1000 });
    c.$$('[data-bars] .bar').forEach((b, i) => c.after(d0 + i * stag + 200, () => { b.className = 'bar ' + LANDBARS[i][2]; b.children[1].textContent = LANDBARS[i][1]; }));
    const reveal = d0 + 8 * stag + 500;
    c.after(reveal, () => {
      const m = c.$('[data-moved]'); m.style.opacity = 1; m.classList.add('fall');
      W.setKeyMul(1); c.$('[data-tagok]').style.transition = 'opacity .5s'; c.$('[data-tagok]').style.opacity = 1;
      snd.pluck(69, .3); snd.pluck(76, .22);
    });
    W.setFps(40);
    c.after(reveal + 1800, () => W.setFps(30));
  },
};
const resultMech = {
  sec: 'C', id: 'result-mech', title: 'Result of a take: Mechanics', chrome: 'session', cls: 'is-result',
  html: () => `<div class="scrim-t" style="height:64px"></div><div class="scrim-below" data-scb></div>${sbar({ at: 2, left: '2 min left' })}
    <div class="slot" data-slot style="flex:1 1 30%"></div>
    <div class="kick fadein none">Even sixteenths · 80 BPM · 8 bars</div>
    <div class="row base wrap none" style="gap:clamp(8px,1.6vw,18px)"><span class="num q fadein" style="font-size:clamp(48px,10vh,96px);line-height:.9">78 →</span><span class="num g" data-moved style="font-size:clamp(100px,20vh,190px);line-height:.84;opacity:0">86%</span><span class="h2 fadein">even</span><span class="tag ok" data-tagok style="opacity:0;font-size:15px">Pass bar met</span></div>
    ${coach('98% right notes. Two notes off the grid, both on the move to the 8th fret.', false, 'fadein')}
    <div class="fadein">${pri('Next: Jam, 2 min', 'jam', 'mid', { flow: true })}</div>
    <button class="choice glass fadein" data-go="edge"><b class="amber">Ramp this from the tempo you reached</b><span>Starts Ramp up at 80 BPM, Find my edge. Uses your session time, or adds 2 minutes.</span></button>
    <div class="why none fadein">Say <span class="key">next</span>, or <span class="key">ramp it</span></div>`,
  enter(c) {
    const A = W.amp;
    A.setMeter({ mode: 'even', clean: null, slip: null, mark: 85, value: 78, instant: true });
    A.setTubes(tubesAt(.3), { stagger: .05 });
    W.go(meterShot(c.$('[data-slot]')), { dur: 1.6, lift: .8 });
    W.setKeyMul(.5);
    c.after(1500, () => A.setMeter({ value: 86 }));
    c.after(1800, () => { c.$('[data-moved]').style.opacity = 1; c.$('[data-moved]').classList.add('fall'); c.$('[data-tagok]').style.transition = 'opacity .5s'; c.$('[data-tagok]').style.opacity = 1; W.setKeyMul(1); A.setTubes(tubesAt(.9), { stagger: .08 }); snd.pluck(69, .3); });
    W.setFps(60); c.after(4200, () => W.setFps(30));
  },
};
const nocatch = {
  sec: 'C', id: 'nocatch', title: '"I didn\'t catch enough"', chrome: 'session', cls: 'is-take',
  html: () => `<div class="scrim-take" data-sct></div>${sbar({ at: 2, left: '3 min left' })}
    <div class="center" style="justify-content:flex-start;padding-top:2vh;flex:none">
      <div class="kick rise">No grade for this take</div>
      <div class="h1 rise">I didn't catch enough. Play it again.</div>
      <div class="stat rise"><b>22</b><span>of 128 notes heard</span></div>
      <div class="why rise">I won't guess, so this take doesn't count against you. The signal was quiet: try moving closer to the mic, or turn the band down.</div>
    </div>
    <div class="slot" data-slot></div>
    ${stripHtml()}
    <div class="center" style="flex:none;padding-top:0">
      <div class="rise">${pri('Play it again', 'mechanics', 'mid')}</div>
      <div class="row wrap why rise">Say <span class="key">again</span> or tap the pedal · ${lnk('Check my sound', 'soundcheck')}</div>
    </div>`,
  enter(c) {
    const G = W.guitar;
    W.setKeyMul(.34); G.setInlayDim(.2); W.amp.setTubes(tubesAt(0), { stagger: 0 });
    useStrip(c, 4, 9);
    W.go(neckShot(4, 9, c.$('[data-slot]'), { keyI: 2.4, pool: .5 }), { dur: 1.3 });
    c.every(1700, () => { const f = [5, 7, 8][Math.floor(Math.random() * 3)]; G.pluck(1, f, 'dim', { amp: .0012, light: 0, glow: .1, flash: .05, reduce: c.reduced }); });
  },
};
const recap = {
  sec: 'C', id: 'recap', title: 'End of session', chrome: 'session', cls: 'is-recap',
  html: () => `<div class="scrim-t" style="height:52%"></div><div class="scrim-below" data-scb style="pointer-events:none"></div>${sbar({ at: 4, of: 3, left: '10 min played' })}
    <div class="none rise"><div class="kick">Session done</div><div class="h1 recaph">Good one. 2 exercises passed.</div></div>
    <div class="split" style="flex:0 1 auto">
      <div class="col">
        <div class="kick rise">What moved</div>
        <div class="ex glass rise"><div class="grow"><div class="h3">Landing on chord tones</div><div class="why">75 BPM · Pass bar met</div></div><div class="num" style="font-size:44px;line-height:1"><span class="q" style="font-size:.66em">6 →</span> <span class="g">7</span><span class="q" style="font-size:.4em;font-weight:500"> of 8</span></div></div>
        <div class="ex glass rise"><div class="grow"><div class="h3">Even sixteenths</div><div class="why">80 BPM · Pass bar met</div></div><div class="num" style="font-size:44px;line-height:1"><span class="q" style="font-size:.66em">78 →</span> <span class="g">86%</span></div></div>
        <div class="why rise">Jam wasn't graded.</div>
      </div>
      <div class="col">
        <div class="kick rise">Next session, 10 min</div>
        <div class="item glass rise"><div class="grow"><div class="row wrap" style="gap:7px"><span class="h3">Landing on chord tones, 90 BPM</span>${TAG.t}</div><div class="why">Because you passed 75 today.</div></div></div>
        <div class="item glass rise"><div class="grow"><div class="row wrap" style="gap:7px"><span class="h3">Even sixteenths with the band</span>${TAG.m}</div><div class="why">Because you passed alone at 80.</div></div></div>
      </div>
    </div>
    <div class="slot" data-slot></div>
    <div class="rise none">${pri('Done', 'today', 'big')}</div>`,
  enter(c) {
    W.amp.setTubes(tubesAt(.95), { stagger: .12, delay: .5 });
    W.go(tubesShot(c.$('[data-slot]'), { keyI: 1.2 }), { dur: 2.2, lift: 1.4 });
  },
};

// ─── D. Paths ───
function pathShot(guitar, slot) {
  return { show: [guitar === W.guitar ? 'guitar' : 'neck2'], numScale: 1.5, points: () => guitar.windowPoints(0, 24), slot, dir: [.3, 1, 0], fov: 16, fill: 1, key: { i: 2.8, angle: .55, offset: [-2, 8, 2.2], target: () => guitar.pointAt(3, 7) }, rim: .7, env: .55, pool: 1 };
}
function pathScreen(kind) {
  const T = kind === 't', steps = T ? BLUES : ALT, nm = T ? 'Blues path' : 'Alternate Picking path', cur = T ? 'step-land' : 'step-even';
  return {
    sec: 'D', id: T ? 'blues' : 'alt', title: 'A path: ' + (T ? 'Blues' : 'Alternate Picking'), tab: 'paths',
    html: () => `<div class="scrim-t" style="height:26%"></div><div class="none rise">${lnk('Paths', 'paths')}<div class="row wrap" style="gap:9px"><span class="h1" style="font-size:clamp(30px,5vh,48px)">${nm}</span>${TAG[kind]}</div><div class="why">${T ? 'What you choose to play, over a blues.' : 'How your hands play: notes, even timing, clean tempo.'}</div></div>
      <div class="pathgrid grow" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(250px,320px);gap:22px;min-height:0">
        <div class="steps-wrap" data-wrap><svg class="leaders" data-leaders aria-hidden="true"></svg><div class="neckslot" data-slot style="position:absolute;left:0;top:0;bottom:0;width:var(--neckw,34%)"></div>
          <div data-rows style="position:absolute;top:0;bottom:0;right:0;left:var(--neckw,34%)">${steps.map((s, i) => `<button class="steprow ${s[2] || 'later'}" ${s[2] === 'cur' ? `data-go="${cur}"` : ''} style="--i:${i}"><span class="nb">${s[2] === 'done' ? '✓' : i + 1}</span><span class="grow"><span class="nm">${s[0]}</span>${s[1] ? `<small>${s[1]}</small>` : ''}</span></button>`).join('')}</div>
        </div>
        <div class="col donly" style="justify-content:center">
          <div class="glass card rise"><div class="kick">Where you are</div><div class="h2" style="margin:3px 0">Step 2 of 10</div><div class="why">${T ? '1 passed. A step passes when all its exercises hit their bar.' : 'Clean tempo on sixteenths: 88 BPM.'}</div></div>
          <div class="glass card rise">${T ? `<div class="kick">How this path grades</div><div class="why" style="margin-top:3px">Which note you land on, per bar, against the chord. Only in exercises. Jam is never graded.</div>` : `<div class="kick">What this path can measure</div><div class="why" style="margin-top:3px"><b>Notes, timing evenness and clean tempo.</b> It cannot tell pick direction. Down-up is written in the tab, and checking it is your job.</div>`}</div>
          <div class="rise">${pri('Play step 2', cur)}</div>
        </div>
      </div>
      <div class="why ponly none">${T ? 'Graded in exercises only. Jam is never graded.' : 'Measures notes, evenness, clean tempo. Cannot tell pick direction.'}</div>`,
    enter(c) {
      const g = T ? W.guitar : W.getSecondNeck(), wrap = c.$('[data-wrap]'), rows = c.$('[data-rows]'), slot = c.$('[data-slot]');
      g.setSteps(steps.map(s => s[2]));
      const layout = () => {
        const H = wrap.clientHeight, h = H / 10;
        rows.style.setProperty('--rowh', Math.min(h - 2, 64) + 'px');
        c.$$('.steprow').forEach((r, i) => { r.style.top = (i * h + (h - Math.min(h - 2, 64)) / 2) + 'px'; });
        if (!W.real) return;
        const wr = wrap.getBoundingClientRect(), rl = rows.getBoundingClientRect();
        const ld = c.$('[data-leaders]');
        ld.innerHTML = steps.map((s, i) => {
          const p = W.project(g.stepPos(i)), x1 = p.x - wr.left, y1 = p.y - wr.top, y2 = i * h + h / 2, x2 = rl.left - wr.left + 2;
          const col = s[2] === 'cur' ? '#ffb454' : s[2] === 'done' ? '#4ee08a' : 'rgba(232,214,186,.3)';
          return `<path d="M${x1} ${y1}C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}" fill="none" stroke="${col}" stroke-width="${s[2] === 'cur' ? 1.6 : 1}"/>`;
        }).join('');
      };
      W.go(pathShot(g, slot), { dur: 1.8, lift: 1.2 });
      layout();
      const ld = c.$('[data-leaders]'); ld.style.opacity = 0; ld.style.transition = 'opacity .6s'; c.after(c.reduced ? 0 : 1500, () => { ld.style.opacity = 1; });
      c.onResize(layout);
      if (g.sweep) g.sweep({ dur: 2.2, power: 3 });
    },
  };
}
function stepScreen(kind) {
  const T = kind === 't';
  const ex = T ? [['Any chord tone, A7 D7 A7 E7, 60 BPM', '7 of 8 landings', 'Passed', 'd'], ['Same, 75 BPM', '7 of 8 landings', 'Best 6 of 8', 'c'], ['Same, 90 BPM', '7 of 8 landings', '', ''], ['Only the 3rd of each chord, 60 BPM', '6 of 8 landings', '', '']]
    : [['One string, 60 BPM', '85% even, 8 bars', 'Passed', 'd'], ['One string, 70 BPM', '85% even, 8 bars', 'Passed', 'd'], ['One string, 80 BPM', '85% even, 8 bars', 'Best 78%', 'c'], ['One string, 80 BPM, with the band', '85% even, 16 bars', '', '']];
  const why = T ? `<b>Why this step:</b> chord tones are what make a chord sound like itself. Landing on one when the chord changes makes your solo follow the band.` : `<b>Why this step:</b> sixteenths show up every timing wobble that eighths hide. Everything later on this path needs them even.`;
  const whyyou = T ? `<b>Why now, for you:</b> you passed Pentatonic box 1, and yesterday both misses were on D7.` : `<b>Why now, for you:</b> your eighths are clean to 104 BPM, and your sixteenths drop to 78% even at 80.`;
  return {
    sec: 'D', id: T ? 'step-land' : 'step-even', title: 'A step: ' + (T ? 'Landing on chord tones' : 'Even sixteenths'), tab: 'paths', cls: 'is-step',
    html: () => `<div class="scrim-split donly"></div><div class="scrim-take" data-sct></div><div class="none rise">${lnk(T ? 'Blues path' : 'Alternate Picking path', T ? 'blues' : 'alt')}<div class="kick">Step 2 of 10</div><div class="row wrap" style="gap:9px"><span class="h1" style="font-size:clamp(30px,5vh,48px)">${T ? 'Landing on chord tones' : 'Even sixteenths'}</span>${TAG[kind]}</div></div>
      <div class="split">
        <div class="col" style="justify-content:center">
          <div class="glass card rise"><div class="why">${why}</div><div class="why" style="margin-top:6px">${whyyou}</div></div>
          <div class="kick rise">Exercises</div>
          ${ex.map(e => `<div class="ex glass rise ${e[3] === 'c' ? 'cur' : ''}"><span class="tick ${e[3] === 'd' ? '' : e[3] === 'c' ? 'cur' : 'wait'}">${e[3] === 'd' ? '✓' : ''}</span><div class="grow"><div class="h3" style="font-size:19px">${e[0]}</div><div class="why">Pass bar: ${e[1]}${e[2] ? ` · <b>${e[2]}</b>` : ''}</div></div></div>`).join('')}
          <div class="rise">${pri('Play this exercise', T ? 'theory' : 'mechanics', 'mid')}</div>
        </div>
        <div class="col">
          <div class="slot" data-slot></div>
          ${stripHtml()}
          ${T ? '' : `<div class="glass panelc rise donly"><canvas class="tab"></canvas></div><div class="why rise donly">Tab is what to play. Down-up marks are guidance: I can't hear pick direction.</div>`}
        </div>
      </div>`,
    enter(c) {
      const g = T ? W.guitar : W.getSecondNeck();
      useStrip(c, 4, 9, T ? chordNotes('D7', 4, 9) : [5, 7, 8].map(f => ({ s: 1, f, kind: 'aim' })));
      W.go(neckShot(4, 9, c.$('[data-slot]'), { guitar: T ? null : g, dir: portrait() ? [0, 1, .34] : undefined, fov: portrait() ? 22 : undefined, key: { target: () => g.pointAt(3, 6) } }), { dur: 1.5 });
      if (T) { W.guitar.setNotes(chordNotes('D7', 4, 9, 'aim', !portrait()), { fade: .6 }); c.every(1900, () => { const n = chordNotes('D7', 4, 9).filter(x => x.kind === 'aim'), p = n[Math.floor(Math.random() * n.length)]; W.guitar.pluck(p.s, p.f, 'aim', { amp: .005, light: .7, glow: .6, flash: .8, reduce: c.reduced }); }); }
      else { const tc = c.$('canvas.tab'), t = Tab(tc, { frets: TAB_FRETS, height: 128 }); if (tc.offsetParent) { t.draw(); c.onResize(t.draw); } g.setNotes([5, 7, 8].map(f => ({ s: 1, f, kind: 'aim', t: noteName(1, f) })), { fade: .5 }); c.every(1400, () => g.pluck(1, [5, 7, 8][Math.floor(Math.random() * 3)], 'aim', { amp: .004, light: .6, glow: .6, flash: .4, reduce: c.reduced })); }
    },
  };
}
const paths = {
  sec: 'D', id: 'paths', title: 'Paths', tab: 'paths',
  html: () => {
    const later = a => `<div class="laterrow">` + a.map(n => `<span class="row" style="gap:6px"><span class="h3" style="font-size:17px;color:var(--quiet)">${n}</span><span class="tag">Later</span></span>`).join('') + `</div>`;
    const pips = `<div class="pips" style="margin:7px 0 5px">${Array.from({ length: 10 }, (_, i) => `<i class="${i < 1 ? 'done' : i === 1 ? 'on' : ''}"></i>`).join('')}</div>`;
    const card = (k, name, sub, prog, go, v) => `<div class="col" style="gap:7px;min-height:0"><div class="row rise" style="gap:7px">${TAG[k]}<span class="why">${sub}</span></div>
      <button class="pcard glass rise" data-go="${go}"><div class="view" data-view="${v}"><div class="veil"></div></div><div class="meta"><div><div class="row" style="gap:10px"><span class="h2">${name}</span><span class="tag ok">Running</span></div><div class="why">10 steps</div></div><div>${pips}<div class="why">${prog}</div></div></div></button>`;
    return `<div class="none rise"><div class="h1">Paths</div><div class="why">Pick a goal. You can run one of each kind, and a session can mix them.</div></div>
      <div class="pathcards">
        ${card('t', 'Blues path', 'What you choose to play', 'Step 2: Landing on chord tones', 'blues', 'a')}<div class="donly rise" style="flex:none">${later(['Rock Soloing', 'Jazz Basics', 'Know the Neck'])}</div></div>
        ${card('m', 'Alternate Picking path', 'How your hands play', 'Step 2: Even sixteenths', 'alt', 'b')}<div class="donly rise" style="flex:none">${later(['Economy Picking', 'Sweep Picking', 'Legato and Hand Sync', 'Rhythm Playing'])}</div></div>
      </div>
      <div class="ponly why none">Later: Rock Soloing, Jazz Basics, Know the Neck, Economy Picking, Sweep Picking, Legato and Hand Sync, Rhythm Playing.</div>`;
  },
  enter(c) {
    const g1 = W.guitar, g2 = W.getSecondNeck();
    const spec = (g, name) => ({ show: [name], overlay: true, env: .5, rim: .6, points: () => g.windowPoints(0, 24), dir: [0, 1, .3], fov: 14, fill: .985, key: { i: 3.1, angle: .62, target: () => g.pointAt(3, 12), offset: [-.6, 7.4, 2.2] } });
    g1.setSteps(BLUES.map(x => x[2])); g2.setSteps(ALT.map(x => x[2])); { const k = portrait() ? 2.4 : 1.6; g1.setNumberScale(k); g2.setNumberScale(k); }
    W.go({ show: [], points: () => W.guitar.windowPoints(2, 9), dir: [0, 1, .3], fov: 24, key: { i: .4 }, rim: .2, env: .2 }, { dur: 0 });
    W.setViews([{ el: c.$('[data-view=a]'), spec: spec(g1, 'guitar') }, { el: c.$('[data-view=b]'), spec: spec(g2, 'neck2') }], { main: false });
    c.every(2300, () => { const i = 1 + Math.floor(Math.random() * 6), g = Math.random() < .5 ? g1 : g2; g.pluck(i, 0, 'aim', { amp: .006, light: 0, glow: .3, flash: 0, reduce: c.reduced }); });
    W.setFps(30);
  },
};

// ─── E. Progress ───
const CLEAN = [72, 74, 74, 80, 84, 84, 88, 92], CLEAN_DATES = ['Sep 20', 'Sep 27', 'Oct 4', 'Oct 11', 'Oct 18', 'Oct 25', 'Nov 1', 'Nov 8'];
const progress = {
  sec: 'E', id: 'progress', title: 'Progress', tab: 'progress', cls: 'is-progress',
  html: () => {
    const sk = [['Chord tones on beat 1', [50, 62, 62, 75, 75, 88], '88%'], ['Evenness, sixteenths at 80', [61, 64, 70, 72, 78, 86], '86%'], ['Box notes found', [60, 60, 70, 70, 80, 80], '80%'], ['Held time, click out', [70, 74, 72, 80, 82, 86], '86%']];
    return `<div class="none rise"><div class="h1">Progress</div><div class="why">Everything here was measured from your playing: notes, timing evenness, clean tempo.</div></div>
    <div class="prog">
      <div class="col" style="min-height:0">
        <div class="row base rise none" style="gap:10px"><span class="num" style="font-size:clamp(60px,10vh,96px);line-height:.95">92</span><span class="q">BPM clean tempo, even sixteenths</span></div>
        <div class="slot" data-slot style="position:relative"><div data-labels style="position:fixed;inset:0;pointer-events:none"></div></div>
        <div class="why rise none">The fastest you stayed even, from Find my edge and exercises. Tap a saddle for its date.</div>
        <details class="table rise none"><summary>All eight readings</summary><table>${CLEAN.map((v, i) => `<tr><td>${CLEAN_DATES[i]}</td><td>${v} BPM</td></tr>`).join('')}</table></details>
      </div>
      <div class="col" style="gap:7px;justify-content:center;min-height:0">
        <div class="kick rise">Skills, last 6 weeks</div>
        ${sk.map(s => `<div class="skill glass rise"><div class="grow h3" style="font-size:18px">${s[0]}</div>${spark(s[1])}<div class="val">${s[2]}</div></div>`).join('')}
      </div>
    </div>`;
  },
  enter(c) {
    const Ch = W.chart, slot = c.$('[data-slot]'), lb = c.$('[data-labels]');
    Ch.setValues(CLEAN, { stagger: .11 });
    W.go({ show: ['chart'], lines: 0, points: () => Ch.points(), slot, dir: [.0, .06, 1], fov: 18, fill: 1, key: { i: 2.5, angle: .6, offset: [-2, 7, 5] }, rim: .8, env: .5, pool: 1.1, post: { bloom: .2 } }, { dur: 1.8, lift: 1 });
    const labels = () => {
      if (!W.real) return;
      let o = '';
      CLEAN.forEach((v, i) => {
        const p = W.project(Ch.pointOf(i));
        const end = i === CLEAN.length - 1, first = i === 0;
        if (end || first) o += `<div class="ptlabel ${end ? 'end' : ''}" style="left:${p.x}px;top:${p.y}px">${v}</div>`;
        o += `<button class="pthit" data-pt="${i}" aria-label="${CLEAN_DATES[i]}: ${v} BPM" style="left:${p.x}px;top:${p.y + 8}px;pointer-events:auto"></button>`;
      });
      [70, 80, 90].forEach(v => { const p = W.project(Ch.gridPoint(v)); o += `<div class="axislabel" style="left:${p.x + 26}px;top:${p.y}px;transform:translate(0,-120%)">${v}</div>`; });
            const fa = W.project(Ch.footOf(0)), fb = W.project(Ch.footOf(7));
      o += `<div class="ptdate" style="left:${fa.x}px;top:${fa.y + 4}px">Sep 20</div><div class="ptdate" style="left:${fb.x}px;top:${fb.y + 4}px">Nov 8</div>`;
      lb.innerHTML = o;
    };
    labels(); c.onResize(labels);
    lb.style.opacity = 0; lb.style.transition = 'opacity .6s'; c.after(c.reduced ? 0 : 1700, () => { lb.style.opacity = 1; });
    lb.addEventListener('click', e => { const b = e.target.closest('[data-pt]'); if (!b) return; lb.querySelector('.tip')?.remove(); const i = +b.dataset.pt, p = W.project(Ch.pointOf(i)); lb.insertAdjacentHTML('beforeend', `<div class="tip" style="left:${p.x}px;top:${p.y - 34}px"><b>${CLEAN[i]}</b>${CLEAN_DATES[i]}</div>`); });
    W.setFps(30); c.after(3000, () => W.setFps(20));
  },
};

// ─── F. Tools ───
const tools = {
  sec: 'F', id: 'tools', title: 'Tools', tab: 'tools',
  html: () => {
    const t = [['Metronome', 'Can drop the click out and score how you held time.', 'metronome', 'm'], ['Ramp up', 'Find my edge: climbs while you stay tight, and reports your clean tempo.', 'edge', 'r'], ['Setlist', 'A routine you build yourself.', 'setlist', 's'], ['Jam', 'A band and your chords. Never graded.', 'jam', 'j']];
    return `<div class="none rise"><div class="h1">Tools</div><div class="why">Use them any time. Results can feed back into your paths.</div></div>
    <div class="toolgrid">${t.map(x => `<button class="tool glass rise" data-go="${x[2]}"><div class="view" data-view="${x[3]}"><div class="veil"></div></div><div class="meta"><b>${x[0]}</b><span>${x[1]}</span></div></button>`).join('')}</div>
    <div class="rise">${coach("Your clean tempo was 88 BPM last week. Want to find today's edge?")}</div>`;
  },
  enter(c) {
    const { guitar: G, amp: A, metro: M, pedals: P } = W;
    A.setTubes(tubesAt(.8), { stagger: 0 }); A.setMeter({ mode: 'tempo', clean: 88, slip: null, mark: null, value: 88, instant: true });
    P.setItems(defaultSet(), { snap: true }); P.setActive('e');
    M.setBpm(90); M.setQuiet(0); M.setSwing(.32);
    G.setNotes(chordNotes('D7', 5, 10, 'aim', false), { fade: 0 });
    W.go({ show: [], points: () => G.windowPoints(2, 9), dir: [0, 1, .3], fov: 24, key: { i: .4 }, rim: .2, env: .25 }, { dur: 0 });
    const v = id => c.$(`[data-view=${id}]`), p = portrait(); G.setNumberScale(.85);
    W.setViews([
      { el: v('m'), spec: { show: ['metro'], points: () => M.points(), dir: [.26, .14, 1], fov: 22, fill: .94, key: { i: 3, angle: .5, target: () => M.root.position.clone().setY(1.6), offset: [-2.2, 7, 5] } } },
      { el: v('r'), spec: { show: ['amp'], points: () => A.pointsMeter(.1), dir: [.1, .2, 1], fov: 34, fill: 1.0, key: { i: 2, angle: .6, target: () => A.root.position.clone().setY(1.2), offset: [-1.5, 6, 6] } } },
      { el: v('s'), spec: { show: ['pedals'], points: () => P.pointsFor(4), dir: [.5, 1.1, .85], fov: 30, fill: 1.5, key: { i: 3.2, angle: .7, target: () => P.root.position.clone(), offset: [-1.8, 8, 2.5] } } },
      { el: v('j'), spec: { show: ['guitar'], overlay: true, points: () => G.windowPoints(4, 9), dir: [.8, 1, 0], fov: 34, fill: 1, key: { i: 3, angle: .55, target: () => G.pointAt(3, 7), offset: [-1.4, 7, 2.4] } } },
    ], { main: false });
    c.clock(90, 1, n => { M.beat(n % 4 === 0); });
    c.sim(now => M.setPhase(now / (60000 / 90)));
    c.clock(96, 2, n => { if (n % 4 === 0) G.pluck(6, 0, 'dim', { amp: .006, light: 0, glow: 0, flash: 0, reduce: c.reduced }); });
    W.setFps(30);
  },
};
const metronome = {
  sec: 'F', id: 'metronome', title: 'Metronome: click drop-out', tab: 'tools', cls: 'is-metro',
  html: () => {
    const seq = ['Click', 'Click', 'Out', 'Out', 'Click', 'Click', 'Out', 'Out'];
    return `<div class="scrim-l donly"></div><div class="scrim-take" data-sct></div><div class="scrim-below ponly-s" data-scb></div><div class="row between none">${lnk('Tools', 'tools')}<span class="tag ok">Listening</span></div>
    <div class="metrogrid grow">
      <div class="col none" style="justify-content:center;gap:clamp(8px,1.6vh,14px)">
        <div><div class="kick">Metronome</div><div class="h2">Click drop-out</div></div>
        <div class="bpm num" style="font-size:clamp(84px,17vh,170px)">90<small>BPM</small></div>
        <div data-bigbeat style="min-height:clamp(52px,10vh,104px);position:relative"><div class="beats big" data-beats aria-hidden="true"><i class="d"></i><i></i><i></i><i></i></div><div class="silence" data-silence style="position:absolute;left:0;top:50%;transform:translateY(-50%);opacity:0">Silence</div></div>
        <div class="h3 amber" data-next style="font-size:clamp(22px,3.4vh,32px)">Click for 2 bars</div>
        <div class="chips" data-chips>${seq.map(s => `<div class="chip ${s === 'Out' ? 'off' : ''}">${s}</div>`).join('')}</div>
        <div class="row wrap" style="align-items:stretch">
          <div class="glass card grow" style="min-width:210px"><div class="kick">Drop-out</div><div class="field"><span>Click on</span><span class="val">2 bars</span></div><div class="field"><span>Click out</span><span class="val on">2 bars</span></div><div class="field"><span>Getting easier</span><span class="val">Add bars if tight</span></div></div>
          <div class="glass card grow" style="min-width:170px"><div class="kick">Last silence</div><div class="stat" style="margin-top:4px"><b class="g" style="font-size:34px" data-back>Back within 9 ms</b><span>of the click when it returned</span></div></div>
        </div>
        <div class="row between">${pri('Stop and score', 'metronome-result')}<span class="why">Say <span class="key">stop</span></span></div>
      </div>
      <div class="slot" data-slot></div>
    </div>`;
  },
  enter(c) {
    const M = W.metro, bpm = 90, spb = 60000 / bpm;
    W.go(metroShot(c.$('[data-slot]')), { dur: 1.7, lift: .8 });
    M.setBpm(90); M.setSwing(.42);
    W.amp.setTubes(tubesAt(.3), { stagger: 0 });
    W.setFps(60);
    const chips = c.$$('[data-chips] .chip'), nx = c.$('[data-next]'), big = c.$('[data-beats]'), back = c.$('[data-back]');
    const t0 = performance.now();
    const BACK = [9, 12, 6, 14, 9, 11];
    let silenceN = 0, prevOut = false;
    c.sim(now => M.setPhase(c.reduced ? 0 : (now - t0) / spb));
    c.clock(bpm, 1, n => {
      const bi = n % 4, bar = Math.floor(n / 4) % 8, out = bar === 2 || bar === 3 || bar === 6 || bar === 7;
      if (bi === 0) {
        chips.forEach((ch, i) => { const o = i === 2 || i === 3 || i === 6 || i === 7; ch.className = 'chip ' + (o ? 'off ' : '') + (i === bar ? 'cur' : i < bar ? 'ok' : ''); });
        const nextOut = [2, 3, 6, 7].includes((bar + 1) % 8);
        nx.textContent = out ? (nextOut ? 'Silence. Hold it.' : 'Click back next bar') : (nextOut ? 'Silence next bar' : 'Click for 2 bars');
        M.setQuiet(out ? 1 : 0); W.setKeyMul(out ? .22 : 1);
        big.classList.toggle('quiet', out); big.style.opacity = out ? 0 : 1; c.$('[data-silence]').style.opacity = out ? 1 : 0;
        if (prevOut && !out) { silenceN = (silenceN + 1) % BACK.length; back.textContent = `Back within ${BACK[silenceN]} ms`; }
        prevOut = out;
      }
      if (!out) { [...big.children].forEach((d, k) => d.classList.toggle('on', k === bi)); M.beat(bi === 0); snd.click(bi === 0); }
      else [...big.children].forEach(d => d.classList.remove('on'));
    });
  },
};
const metroResult = {
  sec: 'F', id: 'metronome-result', title: 'Metronome: result', tab: 'tools',
  html: () => `<div class="scrim-l donly"></div><div class="scrim-below ponly-s" data-scb></div>${lnk('Metronome', 'metronome')}
    <div class="metrogrid grow">
      <div class="col" style="justify-content:center">
        <div class="row base wrap rise" style="gap:12px"><span class="num g" style="font-size:clamp(100px,22vh,200px);line-height:.86">86%</span><span class="h2">time held</span></div>
        <div class="why rise">6 silent stretches at 90 BPM, 112 notes heard.</div>
        <div class="kick rise">How far you drifted, by the end of each silence</div>
        <div class="chips rise">${['-9', '-12', '-6', '-14', '-9', '-11'].map(v => `<div class="chip ok">${v} ms</div>`).join('')}</div>
        <div class="rise">${coach("You rush a little in the silence, about 10 ms early. Try leaning back. It's steady, not getting worse.")}</div>
        <div class="rise">${pri('Again, 4 bars out', 'metronome', 'mid')}</div>
        <div class="why rise">Only scored on steady playing. Timing feedback is for exercises, not improvising.</div>
      </div>
      <div class="slot" data-slot></div>
    </div>`,
  enter(c) {
    W.go(metroShot(c.$('[data-slot]'), { dir: [-.2, .12, 1] }), { dur: 1.4 });
    W.metro.setQuiet(1); W.setKeyMul(.8); W.setFps(24);
  },
};
const edge = {
  sec: 'F', id: 'edge', title: 'Ramp up: Find my edge', tab: 'tools', cls: 'is-edge is-edge-run',
  html: () => {
    const l = [80, 84, 88, 92, 96, 100, 104];
    return `<div class="scrim-take" data-sct></div><div class="scrim-edge donly"></div><div class="scrim-below" data-scb></div><div class="row between none">${lnk('Tools', 'tools')}<span class="tag ok">Listening</span></div>
      <div class="row between top none">
        <div class="col" style="gap:0"><div class="kick">Ramp up · Even sixteenths</div><div class="h2">Find my edge</div></div>
      </div>
      <div class="edgegrid grow">
        <div class="col edgeleft" style="justify-content:center;gap:clamp(6px,1.4vh,14px)">
          <div class="row base" style="gap:8px"><span class="num" data-bpm style="font-size:clamp(120px,27vh,270px);line-height:.82">92</span><span class="h2 q num" style="font-weight:600">BPM</span></div>
          <div><div class="num amber" data-state style="font-size:clamp(48px,8.4vh,84px);line-height:1">Holding</div><div class="sm q" data-slipnote style="font-size:15px">You slipped at 96</div></div>
          <div class="row" style="gap:clamp(16px,2.4vw,30px)"><div class="stat"><b class="g" data-even>87%</b><span>even, last 4 bars</span></div><div class="stat"><b><span data-tight>2</span> <span class="q" style="font-size:.6em">of 4</span></b><span>tight bars until it climbs</span></div></div>
        </div>
        <div class="slot" data-slot></div>
      </div>
      <div class="chips none" data-ladder>${l.map(v => `<div class="chip" data-v="${v}">${v}</div>`).join('')}</div>
      <div class="none"><canvas class="ribbon" aria-label="Timing of the last notes, against the grid"></canvas></div>
      <div class="row between wrap none" style="row-gap:4px">${pri("I'm done", 'edge-result')}<span class="why">Or set a range myself: 80 to 120</span></div>`;
  },
  enter(c) {
    const A = W.amp, slot = c.$('[data-slot]');
    A.setMeter({ mode: 'tempo', clean: 88, slip: 96, mark: null, value: 80, instant: true });
    A.setTubes([.75, .75, .75, .75, .3, 0, 0, 0], { stagger: .05 });
    const rib = Ribbon(c.$('canvas.ribbon'), { slots: 16, height: 72 }); rib.draw(); c.onResize(rib.draw);
    W.go(meterShot(slot), { dur: 1.7, lift: 1 });
    W.setFps(60);
    const bpmEl = c.$('[data-bpm]'), stEl = c.$('[data-state]'), snEl = c.$('[data-slipnote]'), evEl = c.$('[data-even]'), tiEl = c.$('[data-tight]');
    const chips = c.$$('[data-ladder] .chip');
    const LAD = [80, 84, 88, 92, 96, 100, 104];
    let tempo = 92, tight = 2, phase = 'hold', slipped = true, clean = 92;
    const paint = () => {
      bpmEl.textContent = tempo;
      chips.forEach(ch => { const v = +ch.dataset.v; ch.className = 'chip ' + (v === tempo ? (phase === 'slip' ? 'bad' : 'cur') : v < tempo ? 'ok' : (slipped && v === 96 ? 'bad' : '')); });
      tiEl.textContent = tight;
      A.setMeter({ value: tempo, clean, slip: slipped ? 96 : null });
      A.setTubes(Array.from({ length: 8 }, (_, i) => i < (tempo - 72) / 4 ? .85 : .08), { stagger: .02 });
    };
    c.after(700, paint);
    const clk = c.clock(tempo, 4, n => {
      const i = n % 16, s = phase === 'slip' || (phase === 'climb' && tempo >= 96);
      const v = TIMING_SEQ[i] * (s ? 1.8 : .5) + (Math.random() - .5) * (s ? 14 : 4);
      rib.push(v);
      if (i % 4 === 0) { A.kick(1); snd.click(i === 0); }
      if (i === 15) barEnd();
    });
    function barEnd() {
      if (phase === 'slip') { tempo = 92; phase = 'hold'; tight = 0; stEl.textContent = 'Holding'; stEl.className = 'num amber'; snEl.textContent = 'You slipped at 96'; evEl.textContent = '87%'; evEl.className = 'g'; clk.set(tempo); paint(); return; }
      if (tempo >= 96) { phase = 'slip'; slipped = true; stEl.textContent = 'Slipped'; stEl.className = 'num r'; snEl.textContent = 'Back to 92 until it tightens'; evEl.textContent = '71%'; evEl.className = 'r'; paint(); return; }
      tight++;
      if (tight >= 4) { tight = 0; tempo = LAD[Math.min(LAD.length - 1, LAD.indexOf(tempo) + 1)]; phase = 'climb'; stEl.textContent = 'Climbing'; stEl.className = 'num g'; clk.set(tempo); snEl.textContent = 'You slipped at 96'; evEl.textContent = '85%'; }
      else if (phase === 'climb' && tight >= 1 && tempo < 96) { phase = 'hold'; stEl.textContent = 'Holding'; stEl.className = 'num amber'; }
      paint();
    }
    tiEl.textContent = tight;
  },
};
const edgeResult = {
  sec: 'F', id: 'edge-result', title: 'Ramp up: result', tab: 'tools', cls: 'is-edge',
  html: () => `<div class="scrim-take" data-sct></div><div class="scrim-edge donly"></div><div class="scrim-below" data-scb></div><div class="none">${lnk('Tools', 'tools')}</div>
    <div class="edgegrid grow">
      <div class="col edgeleft" style="justify-content:center">
        <div class="kick rise">Find my edge · Even sixteenths</div>
        <div class="row base wrap" style="gap:10px"><span class="num g" data-moved style="font-size:clamp(130px,28vh,270px);line-height:.82;opacity:0">92</span><span class="h2 fadein">BPM clean tempo</span></div>
        <div class="why rise" style="font-size:16px">Up from 88 last week. You stayed at least 85% even at 92, and slipped twice at 96.</div>
      </div>
      <div class="slot" data-slot></div>
    </div>
    <div class="none rise">${stepChart({ vals: [80, 84, 88, 92, 96, 92, 92, 96, 92], labels: ['', '', '1 min', '', '', '2 min', '', '', '3 min'], marks: [4, 7], min: 76, max: 100, ...(portrait() ? { W: 400, H: 170 } : { H: 150 }) })}<div class="sm q">Red: where you slipped.</div></div>
    <div class="none rise">${pri('Use 92 next session', 'today', 'mid')}</div>
    <div class="why none rise">Say <span class="key">again</span> to go for it once more</div>`,
  enter(c) {
    const A = W.amp;
    A.setMeter({ mode: 'tempo', clean: 88, slip: 96, mark: null, value: 80, instant: true });
    A.setTubes(tubesAt(.3), { stagger: .05 });
    W.setKeyMul(.6);
    W.go(meterShot(c.$('[data-slot]')), { dur: 1.5, lift: .6 });
    c.after(1300, () => A.setMeter({ value: 92 }));
    c.after(1800, () => { A.setMeter({ clean: 92 }); A.setTubes(tubesAt(.95), { stagger: .08 }); W.setKeyMul(1); c.$('[data-moved]').style.opacity = 1; c.$('[data-moved]').classList.add('fall'); snd.pluck(69, .3); });
    W.setFps(60); c.after(4000, () => W.setFps(30));
  },
};

// Setlist.
const KIND = { ramp: ['Ramp up', 'Even sixteenths, Find my edge', '3 min'], exercise: ['Exercise', 'Landing on chord tones, 75 BPM', '3 min'], metronome: ['Metronome', 'Click drop-out, 90 BPM', '2 min'], jam: ['Jam', 'Over a blues in A, not graded', '3 min'] };
const defaultSet = () => [{ key: 'r', kind: 'ramp' }, { key: 'e', kind: 'exercise' }, { key: 'm', kind: 'metronome' }, { key: 'j', kind: 'jam' }];
let setItems = defaultSet(), setSerial = 0;
const setlist = {
  sec: 'F', id: 'setlist', title: 'Setlist: editing My setlist', tab: 'tools',
  html: () => `<div class="scrim-take" data-sct></div><div class="scrim-below ponly-s" data-scb></div><div class="none">${lnk('Tools', 'tools')}</div>
    <div class="row between none rise"><div class="h1" style="font-size:clamp(32px,5.4vh,52px)">My setlist</div><span class="h3 q" data-total style="font-size:24px">About 11 min</span></div>
    <div class="slot" data-slot style="min-height:130px"></div>
    <div class="col none" style="gap:5px" data-rows></div>
    <div class="row wrap none rise" style="gap:6px"><button class="add" data-add="exercise">+ Exercise</button><button class="add" data-add="metronome">+ Metronome</button><button class="add" data-add="ramp">+ Ramp up</button><button class="add" data-add="jam">+ Jam</button></div>
    <div class="none rise" data-startset>${pri('Start setlist', 'setlist-run', 'mid')}</div>`,
  enter(c) {
    const P = W.pedals, rows = c.$('[data-rows]'), slot = c.$('[data-slot]');
    const render = () => {
      rows.innerHTML = setItems.map((it, i) => { const k = KIND[it.kind]; return `<div class="setrow glass"><span class="n">${i + 1}</span><div class="grow"><div class="h3">${k[0]}</div><div class="why" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${k[1]}</div></div><span class="sq dur">${k[2]}</span><button class="sq" data-up="${i}" aria-label="Move up" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>↑</button><button class="sq" data-down="${i}" aria-label="Move down" ${i === setItems.length - 1 ? 'disabled style="opacity:.3"' : ''}>↓</button><button class="sq" data-del="${i}" aria-label="Remove">×</button></div>`; }).join('');
      const total = setItems.reduce((a, it) => a + parseInt(KIND[it.kind][2]), 0);
      c.$('[data-total]').textContent = `About ${total} min`;
      P.setItems(setItems);
    };
    P.setItems(setItems, { snap: true });
    render();
    W.go(pedalShot(slot, Math.max(4, setItems.length)), { dur: 1.7, lift: 1 });
    rows.addEventListener('click', e => {
      const u = e.target.closest('[data-up]'), d = e.target.closest('[data-down]'), x = e.target.closest('[data-del]');
      if (u) { const i = +u.dataset.up; [setItems[i - 1], setItems[i]] = [setItems[i], setItems[i - 1]]; render(); }
      if (d) { const i = +d.dataset.down; [setItems[i + 1], setItems[i]] = [setItems[i], setItems[i + 1]]; render(); }
      if (x && setItems.length > 1) { setItems.splice(+x.dataset.del, 1); render(); W.go(pedalShot(slot, Math.max(4, setItems.length)), { dur: .6 }); }
    });
    c.$$('[data-add]').forEach(b => { b.onclick = () => { if (setItems.length >= 6) return; setItems.push({ key: 'x' + (++setSerial), kind: b.dataset.add }); render(); W.go(pedalShot(slot, Math.max(4, setItems.length)), { dur: .6 }); }; });
    c.$('[data-startset] button').addEventListener('click', () => { P.stomp(setItems[0].key); });
    W.setFps(40);
    P.setActive(null);
    c.after(900, () => { P.setActive(setItems[0]?.key); });
  },
};
const setlistRun = {
  sec: 'F', id: 'setlist-run', title: 'Setlist: running', chrome: 'session', cls: 'is-take',
  html: () => {
    const q = [['Ramp up', 'Clean tempo 92 BPM', 'd'], ['Landing on chord tones', 'Now, 2 min left', 'c'], ['Metronome', '2 min', ''], ['Jam', '3 min, not graded', '']];
    return `<div class="scrim-take" data-sct></div>${sbar({ at: 2, of: 4, left: 'My setlist, 2 of 4', exit: 'setlist' })}
    <div class="taketop none">
      <div class="takeinfo"><div class="h3">Landing on chord tones</div></div>
      <div class="chordrow"><div class="chord" data-chord>D7</div><div class="col" style="gap:clamp(6px,1.2vh,12px)"><div class="nextc" data-next>then A7</div>${beats()}</div></div>
      <div class="feed" data-feed></div>
      <div class="bpm num">75<small>BPM</small></div>
    </div>
    <div class="slot" data-slot></div>
    ${stripHtml()}
    ${barsHtml(BAR_CH.map(ch => [ch, '', '']))}
    <div class="col none" style="gap:3px">${q.map(x => `<div class="row between sm ${x[2] === 'c' ? 'amber' : 'q'}" ${x[2] === 'd' ? 'data-pd' : ''}><span>${x[2] === 'd' ? '✓ ' : x[2] === 'c' ? '▸ ' : '· '}${x[0]}</span><span>${x[1]}</span></div>`).join('')}</div>
    <div class="row between none"><span class="why">Moves on by itself. Say <span class="key">skip</span></span>${sec('Skip', 'tools')}</div>`;
  },
  enter(c) {
    const slot = c.$('[data-slot]');
    W.setFps(60); W.guitar.setInlayDim(.16); W.amp.setTubes(tubesAt(0), { stagger: 0 });
    W.go(neckShot(...windowFor('D7'), slot), { dur: 1.4, lift: .6 });
    runChanges(c, { bpm: 75, start: 5, take: 2, slot, loop: true });
  },
};
// Jam: never graded, never coloured by how you played.
const jam = {
  sec: 'F', id: 'jam', title: 'Jam: playing, typed chords', tab: 'tools', cls: 'is-jam is-take',
  html: () => `<div class="scrim-take" data-sct></div><div class="row between none"><div class="row" style="gap:9px"><span class="h1" style="font-size:clamp(32px,5.4vh,52px)">Jam</span><span class="tag">Not graded</span></div><div class="bpm num" style="font-size:clamp(46px,7vh,70px)">96<small>BPM</small></div></div>
    <div class="row none" style="gap:7px"><input class="typed" aria-label="Chords" value="A7 D7 A7 E7" data-chords spellcheck="false" autocomplete="off"><span class="val donly" style="padding:9px 12px">Blues shuffle</span></div>
    <div class="chordrow none"><div class="chord" data-chord>D7</div><div class="col" style="gap:clamp(6px,1.2vh,12px)"><div class="nextc" data-next>then A7</div>${beats()}</div></div>
    <div class="slot" data-slot></div>
    ${stripHtml()}
    <div class="sm q none" data-hint>Amber: tones of D7. Play anything. Nothing here is scored.</div>
    <div class="row between none"><button class="btn pri" data-done>Done</button><span class="why">Say <span class="key">done</span></span></div>`,
  enter(c) {
    const G = W.guitar, A = W.amp, slot = c.$('[data-slot]');
    W.setFps(60); G.setInlayDim(.22);
    A.setTubes(tubesAt(.7), { stagger: .05 });
    let chords = parseChords(c.$('[data-chords]').value).map(x => x.name), idx = 1;
    const strip = useStrip(c, ...windowFor(chords[1]));
    const chord = c.$('[data-chord]'), nxt = c.$('[data-next]'), hint = c.$('[data-hint]');
    const place = (i, dur) => {
      const n = chords[i % chords.length], [lo, hi] = windowFor(n);
      chord.textContent = n; pop(chord); nxt.textContent = 'then ' + chords[(i + 1) % chords.length];
      hint.textContent = `Amber: tones of ${n}. Play anything. Nothing here is scored.`;
      const list = chordNotes(n, lo, hi, 'aim', false);
      G.setNotes(list, { fade: .3 }); strip.set(lo, hi); strip.notes(list);
      W.go(neckShot(lo, hi, slot), { dur });
    };
    place(idx, 1.5);
    c.$('[data-chords]').addEventListener('change', e => { const a = parseChords(e.target.value).map(x => x.name); if (a.length) { chords = a; idx = 0; place(0, .7); } });
    c.$('[data-done]').onclick = () => c.go(c.opts.flow ? 'recap' : 'tools');
    // The band breathes through the strings.
    let br = 0;
    c.sim(() => { br *= .93; G.setBreath(c.reduced ? 0 : br * .0016); A.setBreath(br); });
    c.clock(96, 1, n => {
      const bi = n % 4;
      setBeat(c, bi);
      br = bi === 0 ? 1 : .55;
      const ch = parseChords(chords[idx % chords.length])?.[0], root = ch ? ch.r : 9;
      G.pluck(6, 0, 'dim', { amp: bi === 0 ? .009 : .005, light: 0, glow: .05, flash: 0, reduce: c.reduced });
      snd.bass(28 + ((root - 4 + 12) % 12) + (bi % 2 ? 7 : 0)); snd.hat(bi % 2 ? .07 : .04);
      if (bi === 3) { idx++; c.after(60000 / 96 * .9, () => place(idx, .45)); }
    });
  },
};

// ─── G. Coach ───
const askBar = `<div class="row none" style="gap:7px"><span class="ask">Say or type a question</span>`;
const coachClash = {
  sec: 'G', id: 'coach', title: 'Coach: why does that note clash? + show me', tab: 'coach',
  html: () => `<div class="scrim-take" data-sct></div><div class="scrim-below ponly-s" data-scb></div><div class="h1 none rise" style="font-size:clamp(30px,5vh,48px)">Ask the coach</div>
    <div class="col none slotcol"><div class="slot" data-slot></div>${stripHtml('ponly')}<div class="why none" data-note>Tap Show me and I'll light it on the neck.</div></div>
    <div class="col grow coachchat">
        <div class="msgs" data-msgs><div class="msg you">Why does that note clash?</div><div class="msg co">In bar 6 you landed on <b class="r">G</b> over D7. D7 is D, F#, A and C. G sits a half step above F#, so the two rub.</div></div>
        <div class="row none wrap" data-acts style="gap:7px"><button class="btn pri" data-show>Show me</button></div>
        ${askBar}<button class="btn" data-go="theory">Try it</button></div>
    </div>`,
  enter(c) {
    const G = W.guitar;
    G.setInlayDim(.35);
    const slot = c.$('[data-slot]'), P = portrait();
    W.go(P ? neckShot(4, 9, slot) : fullNeck(slot), { dur: 1.5 });
    const strip = P ? useStrip(c, 4, 9) : null;
    const show = () => {
      const m = c.$('[data-msgs]');
      m.insertAdjacentHTML('beforeend', `<div class="msg you">Show me</div><div class="msg co">Green is D7. Red is your G. One fret down is F#, a chord tone.</div>`);
      m.scrollTop = m.scrollHeight;
      c.$('[data-acts]').innerHTML = `<button class="btn" data-hear>Play the rub</button>`;
      showD7(G); if (strip) strip.notes(chordNotes('D7', 4, 9, 'tone', false));
      c.$('[data-note]').textContent = 'Show me plays D7 and the two notes, so you can hear the rub too.';
      G.sweep({ dur: 1, power: 2, from: 1, to: 3 });
      c.after(350, () => G.pluck(2, 8, 'clash', { amp: .008, light: 1, glow: 1, flash: 1, reduce: c.reduced }));
      c.after(1050, () => G.pluck(2, 7, 'tone', { amp: .008, light: 1, glow: 1, flash: 1, reduce: c.reduced }));
      c.$('[data-hear]').onclick = () => { G.pluck(2, 8, 'clash', { amp: .008, reduce: c.reduced }); snd.pluck(midi(2, 8), .3); snd.pluck(midi(2, 7), .3); c.after(700, () => { G.pluck(2, 7, 'tone', { amp: .008, reduce: c.reduced }); snd.pluck(midi(2, 7), .3); }); };
    };
    c.$('[data-show]').onclick = show;
    if (c.opts.show || location.search.includes('show=1')) c.after(700, show);
  },
};
const chatScreen = ({ id, title, msgs, extra = '' }) => ({
  sec: 'G', id, title, tab: 'coach',
  html: () => `<div class="h1 none rise" style="font-size:clamp(30px,5vh,48px)">Ask the coach</div>
    <div class="col grow" style="max-width:760px;width:100%"><div class="msgs">${msgs.map(([w, t]) => `<div class="msg ${w}">${t}</div>`).join('')}</div>${extra}${askBar}</div></div>`,
  enter(c) {
    W.go({ show: ['amp'], points: () => W.amp.pointsTubes(), dir: [-.5, .3, 1], fov: 26, fill: 1.6, anchor: [.82, .4], key: { i: 1, angle: .6 }, rim: .4, env: .3, pool: .8, post: { bloom: .3 } }, { dur: 1.6 });
    W.amp.setTubes(tubesAt(.7), { stagger: .06 });
  },
});
const coachWhy = chatScreen({ id: 'coach-why', title: 'Coach: why this exercise?', msgs: [['you', 'Why this exercise?'], ['co', "Yesterday at 75 BPM you landed on 6 of 8, and both misses were on D7. The bar is 7 of 8. It's step 2 on your Blues path, and passing it opens Call and response."], ['you', 'Can I skip it today?'], ['co', 'Sure. Do you want Even sixteenths for the full 10 minutes instead?']], extra: `<div class="row wrap none" style="gap:7px">${pri('Keep the plan', 'today')}${sec('Swap it', 'today')}</div>` });
const coachHonest = chatScreen({ id: 'coach-honest', title: 'Coach: what it will not claim', msgs: [['you', 'Am I alternate picking properly?'], ['co', "I can't tell. I hear notes and timing, not pick direction, and I can't see your hands. What I can say: your sixteenths were 86% even at 80 BPM."], ['you', 'How was my solo in Jam?'], ['co', "I don't grade Jam, so I've got nothing to tell you. If you'd like a score, try an exercise from the Blues path."]] });

// ─── H. Settings ───
const settings = {
  sec: 'H', id: 'settings', title: 'Settings', tab: 'settings',
  html: () => {
    const g = (t, rows) => `<div class="glass card rise"><div class="kick">${t}</div>${rows.map(r => `<div class="field"><span>${r[0]}</span><span class="val ${r[2] ? 'on' : ''}">${r[1]}</span></div>`).join('')}</div>`;
    return `<div class="scrim-all"></div><div class="h1 none rise">Settings</div>
    <div class="split" style="overflow:auto;flex:1 1 0;min-height:0;align-items:start;align-content:start">
      <div class="col">${g('Input', [['Hears you by', 'Microphone', 1]])}${g('Audio', [['Band / click volume', '70% / 50%'], ['Delay allowance', '42 ms']])}${g('Foot pedal', [['Pedal', 'Connected', 1], ['Tap / Double / Hold', 'Big action / Slower / Next']])}</div>
      <div class="col">${g('Coach voice', [['Voice', 'Warm, on', 1], ['Listens between takes', 'On', 1]])}<div class="glass card rise"><div class="kick">Coach model</div><div class="field"><span>Runs on</span><span class="row" style="gap:4px"><span class="val">Local</span><span class="val on">OpenRouter</span></span></div><div class="field"><span>Your key</span><span class="val">sk-or-••••••••4f2a</span></div><div class="why" style="margin-top:5px">Words the coach's explanations. Your grades come from measured notes and timing, on any setting.</div></div></div>
    </div>`;
  },
  enter(c) {
    W.go({ show: ['amp'], points: () => W.amp.pointsAll(), dir: [.5, .34, 1], fov: 26, fill: 1.1, key: { i: 1.7, angle: .8, target: () => W.amp.root.position.clone().setY(1.2) }, rim: .7, env: .45, pool: .8, post: { bloom: .2 } }, { dur: 1.7, lift: .6 });
    W.amp.setTubes(tubesAt(.5), { stagger: .05 }); W.amp.setBacklight(.42);
    W.setFps(20);
  },
};

// ─── A. First run ───
const firstShot = (slot) => fullNeck(slot, { fill: .98 });
const welcome = {
  sec: 'A', id: 'welcome', title: 'Welcome', chrome: 'first',
  html: () => `${frun(1)}<div class="grow slot" data-slot></div>
    <div class="center none" style="flex:none;padding-bottom:3vh">
      <div class="rise row base wrap" style="gap:.28em;font:700 clamp(60px,min(13vh,17vw),128px)/.95 var(--display);letter-spacing:.09em"><span>YAM<span class="amber">E</span>S</span><span class="q" style="font-family:var(--serif);font-weight:500;letter-spacing:-.02em;font-size:.8em">Coach</span></div>
      <div class="h3 rise" style="font-weight:500;font-size:clamp(20px,3vh,28px)">A band plays. You play. The coach hears your notes, and you get better along a path.</div>
      <div class="rise">${pri("Let's play", 'input', 'big')}</div>
      <div class="why rise">About two minutes of setup, then you're playing.</div>
    </div>`,
  enter(c) {
    W.go(fullNeck(c.$('[data-slot]'), { fill: .96 }), { dur: 2.4 });
    W.amp.setTubes(tubesAt(.8), { stagger: .22, delay: .3 });
    W.guitar.sweep({ dur: 2.8, power: 2.4, from: 1, to: 4 });
    c.after(900, () => W.guitar.strum('aim', .07, .01));
  },
};
const firstCenter = (n, id, title, body, enter) => ({ sec: 'A', id, title, chrome: 'first', html: () => `${frun(n)}<div class="slot firstslot" data-slot></div><div class="center">${body()}</div>`, enter });
const inputS = firstCenter(2, 'input', 'Pick input', () => `<div class="h1 rise">How will I hear you?</div>
  <button class="choice glass on rise" data-go="soundcheck"><b>Microphone</b><span>Your guitar in the room. Single notes work best.</span></button>
  <button class="choice glass rise" data-go="soundcheck"><b>MIDI</b><span>Keyboard or MIDI guitar. Exact notes and chords.</span></button>
  <button class="choice glass rise" data-go="soundcheck"><b>Tap the fretboard</b><span>No instrument to hand. Notes count, but timing means less.</span></button>`,
  c => { W.go(firstShot(c.$('[data-slot]')), { dur: 1.6 }); W.amp.setTubes(tubesAt(.6)); });
const soundcheck = {
  sec: 'A', id: 'soundcheck', title: 'Soundcheck', chrome: 'first',
  html: () => `<div class="scrim-split donly"></div><div class="scrim-take" data-sct data-off="0"></div>${frun(3)}<div class="split"><div class="col" style="justify-content:center">
      <div class="h1 rise">Play your low E string</div>
      <div class="row rise" style="gap:18px"><div class="num g" style="font-size:clamp(100px,20vh,180px);line-height:.9">E</div><div class="grow"><div class="sm q">Heard, in tune</div><div class="meter"><i data-level style="width:68%"></i></div><div class="sm q" style="margin-top:5px">Level is good</div></div></div>
      <div class="check glass rise"><span class="tick">✓</span>I can hear single notes</div>
      <div class="check glass rise"><span class="tick">✓</span>Timing delay measured: 42 ms, I'll allow for it</div>
      <div class="check glass rise"><span class="tick wait"></span><span>No headphones? The band plays drums only, so I don't mistake it for you.</span></div>
      <div class="rise">${pri('Sounds good', 'goal', 'mid')}</div>
    </div><div class="col" style="min-height:0;flex:1 1 0"><div class="slot" data-slot></div>${stripHtml()}</div></div>`,
  enter(c) {
    const G = W.guitar;
    W.setFps(60); useStrip(c, 1, 5, [{ s: 6, f: 0, kind: 'tone' }]);
    G.setNotes([{ s: 6, f: 0, kind: 'tone', t: 'E' }]);
    W.go(neckShot(0, 5, c.$('[data-slot]')), { dur: 1.6 });
    let lv = .68;
    const hit = () => { G.pluck(6, 0, 'tone', { amp: .016, light: 1, glow: 1, flash: 1, reduce: c.reduced }); lv = .78; snd.pluck(40, .4); };
    hit(); c.every(1800, hit);
    c.sim(() => { lv = Math.max(.14, lv * .997); const e = c.$('[data-level]'); if (e) e.style.width = (lv * 100).toFixed(0) + '%'; });
  },
};
const goal = firstCenter(4, 'goal', 'What do you want to get better at?', () => `<div class="h1 rise">What do you want to get better at?</div>
  <button class="choice glass rise" data-go="placement"><b>My hands</b><span>Mechanics: how your hands play. Starts the Alternate Picking path.</span></button>
  <button class="choice glass rise" data-go="placement"><b>What to play</b><span>Theory: what you choose to play. Starts the Blues path.</span></button>
  <button class="choice glass on rise" data-go="placement"><b>Both</b><span>One of each. A session can mix them.</span></button>`,
  c => W.go(firstShot(c.$('[data-slot]')), { dur: 1.6 }));
const placement = {
  sec: 'A', id: 'placement', title: 'Placement test', chrome: 'first',
  html: () => `${frun(5)}<div class="slot firstslot" data-slot></div><div class="center">
      <div class="kick rise">Placement, part 2 of 2. About 1 minute left</div>
      <div class="h2 rise">Pick even eighths on one string. I'll speed up until it wobbles.</div>
      <div class="row between rise"><div class="bpm num" data-b>78<small>BPM</small></div><div class="stat" style="text-align:right"><b class="g" data-e>84%</b><span>even so far</span></div></div>
      <div class="glass panelc rise"><canvas class="ribbon"></canvas></div>
      <div class="rise">${coach('Part 1: you found 6 of the 10 box notes I asked for. Now timing.')}</div>
      <div class="row between rise">${pri('Finish', 'placed')}${lnk('Skip: start me at step 1', 'today-first')}</div>
    </div>`,
  enter(c) {
    W.setFps(60);
    W.go(firstShot(c.$('[data-slot]')), { dur: 1.5 });
    const r = Ribbon(c.$('canvas.ribbon'), { slots: 16, height: 76 }); r.draw(); c.onResize(r.draw);
    c.clock(78, 2, n => { const i = n % 16, v = TIMING_SEQ[i] * .5 + (Math.random() - .5) * 5; r.push(v); W.guitar.pluck(1, 5, timingClass(v), { amp: .004, light: .3, glow: .4, flash: .3, reduce: c.reduced }); snd.pluck(69, .14); if (i === 0) snd.click(true); });
  },
};
const placed = firstCenter(5, 'placed', 'Placement result', () => `<div class="kick rise">Here's what I measured</div>
  <div class="check glass rise"><span class="tick">✓</span><span><b>6 of 10</b> box notes found. <span class="q">Blues path, step 1: Pentatonic box 1</span></span></div>
  <div class="check glass rise"><span class="tick">✓</span><span>Eighths even up to <b>78 BPM</b>. <span class="q">Alternate Picking path, step 1: Even eighths on one string</span></span></div>
  <div class="why rise">That's two minutes of playing, so it's only a starting point. I'll adjust as I hear more.</div>
  <div class="rise">${pri('Go to Today', 'today-first', 'big')}</div>`,
  c => { W.go(firstShot(c.$('[data-slot]')), { dur: 1.6 }); W.amp.setTubes(tubesAt(.8), { stagger: .08 }); });

const today = todayScreen({ id: 'today', title: 'Today: returning', key: 'ret', lead: 'Sunday', sub: 'Running: Blues path, step 2 · Alternate Picking path, step 2' });
const todayFirst = todayScreen({ id: 'today-first', title: 'Today: first time', key: 'first', lead: 'Your first session' });
const todayBack = todayScreen({ id: 'today-back', title: 'Today: back after a break', key: 'back', lead: 'Welcome back. It has been 12 days', extra: `<div class="glass card rise" style="margin-top:6px;padding:9px 13px"><div class="kick">Where you left off</div><div class="why"><b>7 of 8 landings at 75 BPM. Clean tempo 88 BPM.</b> Today starts slower.</div></div>` });

export const SCREENS = [welcome, inputS, soundcheck, goal, placement, placed, todayFirst, today, todayBack, theory, mechanics, between, result, resultMech, nocatch, recap, paths, pathScreen('t'), pathScreen('m'), stepScreen('t'), stepScreen('m'), progress, tools, metronome, metroResult, edge, edgeResult, setlist, setlistRun, jam, coachClash, coachWhy, coachHonest, settings];
export const byId = Object.fromEntries(SCREENS.map(s => [s.id, s]));
export const SECS = { A: 'First run', B: 'Today', C: 'Session', D: 'Paths', E: 'Progress', F: 'Tools', G: 'Coach', H: 'Settings' };
