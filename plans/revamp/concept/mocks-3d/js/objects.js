// The other things on the bench: tube amp with its tempo meter, metronome, pedals, the tempo chart.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './tex.js';

const lathe = (pts, seg = 28) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
const FONT = '"Barlow Condensed","Arial Narrow",system-ui,sans-serif';
const HALO = () => T.radial([[0, 'rgba(255,255,255,1)'], [.18, 'rgba(255,255,255,.5)'], [.5, 'rgba(255,255,255,.1)'], [1, 'rgba(255,255,255,0)']]);

function metalKnob(mats, r = .24, h = .2) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(lathe([[0, 0], [r * 1.14, 0], [r * 1.14, .03], [r, .045], [r, h - .03], [r * .9, h], [0, h]], 40), mats.alu);
  body.rotation.x = Math.PI / 2; body.castShadow = true; g.add(body);
  const line = new THREE.Mesh(new THREE.BoxGeometry(.018, r * .62, .006), new THREE.MeshBasicMaterial({ color: 0xffb454, toneMapped: false }));
  line.position.set(0, r * .58, h + .003); g.add(line);
  return g;
}

// ─────────── Tube amp ───────────
export function createAmp({ tier, tex }) {
  const root = new THREE.Group();
  const W = 6.6, H = 2.0, D = 2.5;
  const walnut = new THREE.MeshPhysicalMaterial({ ...tex.walnut, color: 0xffffff, clearcoat: .55, clearcoatRoughness: .26, envMapIntensity: .9 });
  const cab = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 4, .07), walnut); cab.position.y = H / 2 + .1; cab.castShadow = true; cab.receiveShadow = true; root.add(cab);
  const faceMat = new THREE.MeshStandardMaterial({ ...tex.brushedDark, metalness: 1, roughness: 1, envMapIntensity: 1.1 });
  const face = new THREE.Mesh(new RoundedBoxGeometry(W - .36, H - .3, .08, 3, .02), faceMat);
  face.position.set(0, H / 2 + .1, D / 2 + .015); face.receiveShadow = true; root.add(face);
  const chassisMat = new THREE.MeshStandardMaterial({ ...tex.brushedLight, metalness: 1, roughness: 1, envMapIntensity: 1.2 });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(W - .46, .03, D - .4), chassisMat);
  chassis.position.set(0, H + .105, 0); chassis.receiveShadow = true; root.add(chassis);
  const topY = H + .12;

  // Transformers.
  const canMat = new THREE.MeshPhysicalMaterial({ color: 0x17120f, metalness: .4, roughness: .36, clearcoat: .8, clearcoatRoughness: .2 });
  [-1.9, 0, 1.9].forEach(x => { const c = new THREE.Mesh(new RoundedBoxGeometry(1.1, .86, .7, 3, .08), canMat); c.position.set(x, topY + .43, -.62); c.castShadow = true; root.add(c); });

  // Eight tubes, one per bar.
  const N = 8, gap = .62, startX = -(N - 1) * gap / 2, tz = .42, thr = .2;
  const tubeProfile = [[.0, 0], [.128, 0], [.15, .05], [.15, .72], [.135, .84], [.09, .93], [.03, .98], [.008, 1.02], [0, 1.03]];
  const glassGeo = lathe(tubeProfile, tier >= 1 ? 28 : 18);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: .1, roughness: .02, metalness: 0, envMapIntensity: 1.5, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: .02 });
  const plateGeo = lathe([[.09, .2], [.098, .22], [.098, .62], [.09, .64]], 16);
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x35302b, metalness: .85, roughness: .42, side: THREE.DoubleSide });
  const getterGeo = lathe([[.0, .845], [.13, .85], [.1, .92], [.0, .97]], 18);
  const getterMat = new THREE.MeshStandardMaterial({ color: 0x8e8a83, metalness: 1, roughness: .34, envMapIntensity: 1.4, transparent: true, opacity: .42, depthWrite: false, side: THREE.DoubleSide });
  const socketGeo = lathe([[0, 0], [.19, 0], [.19, .06], [.16, .09], [0, .09]], 24);
  const socketMat = new THREE.MeshPhysicalMaterial({ color: 0x241a13, roughness: .35, clearcoat: .7, clearcoatRoughness: .3 });
  const micaGeo = new THREE.CylinderGeometry(.122, .122, .006, 16);
  const haloMap = HALO();
  const fils = new THREE.CylinderGeometry(.012, .012, .16, 8);
  const crownG = new THREE.TorusGeometry(.082, .009, 6, 24).rotateX(Math.PI / 2);
  const tubes = [];
  for (let i = 0; i < N; i++) {
    const x = startX + i * gap, g = new THREE.Group(); g.position.set(x, topY, tz); root.add(g);
    const sock = new THREE.Mesh(socketGeo, socketMat); sock.receiveShadow = true; g.add(sock);
    const inner = new THREE.Group(); inner.position.y = .08; g.add(inner);
    inner.add(new THREE.Mesh(plateGeo, plateMat));
    [.2, .645].forEach(y => { const m = new THREE.Mesh(micaGeo, plateMat); m.position.y = y; inner.add(m); });
    const filMat = new THREE.MeshBasicMaterial({ color: 0x220a02, toneMapped: false });
    const fil = new THREE.Mesh(crownG, filMat); fil.position.y = .665; inner.add(fil);
    [-.05, .05].forEach(dx => { const h = new THREE.Mesh(fils, filMat); h.position.set(dx, .72, 0); inner.add(h); });
    const low = new THREE.Mesh(crownG, filMat); low.position.y = .185; inner.add(low);
    const get = new THREE.Mesh(getterGeo, getterMat); inner.add(get);
    const gl = new THREE.Mesh(glassGeo, glass); gl.renderOrder = 4; inner.add(gl);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloMap, color: 0xff9a3c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false }));
    glow.position.set(0, .62, .04); glow.scale.set(.74, 1.02, 1); glow.renderOrder = 5; g.add(glow);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(.9, .9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: haloMap, color: 0xff8a30, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    pool.position.y = .012; g.add(pool);
    tubes.push({ fil, glow, pool, v: 0, to: 0, delay: 0, col: new THREE.Color(0xff9a3c), group: g });
  }
  const tubeLight = new THREE.PointLight(0xff9a48, 0, 7, 1.6); tubeLight.position.set(0, topY + .7, tz + .3); root.add(tubeLight);
  const warm = new THREE.Color(0xff9a3c), red = new THREE.Color(0xff3a48), cold = new THREE.Color(0x220a02), hot = new THREE.Color(0xfff0c8);
  function setTubes(levels, { stagger = .13, delay = 0 } = {}) { // levels: 0..1 per tube, or 'clash'
    levels.forEach((lv, i) => { const t = tubes[i], clash = lv === 'clash'; t.to = clash ? .34 : lv; t.delay = delay + i * stagger; t.col.copy(clash ? red : warm); });
  }
  let breath = 0;
  function updateTubes(dt, time) {
    let sum = 0;
    tubes.forEach((t, i) => {
      if (t.delay > 0) { t.delay -= dt; } else {
        const rate = t.to > t.v ? 1.7 : 1.05; // Heaters warm up slowly.
        t.v += (t.to - t.v) * Math.min(1, dt * rate * 2);
      }
      const flick = 1 + Math.sin(time * 7.3 + i * 2.1) * .012 + breath * .18;
      const v = Math.max(0, t.v * flick);
      t.fil.material.color.copy(cold).lerp(t.col, Math.min(1, v * 1.5)).lerp(hot, Math.max(0, v - .6) * 1.2);
      t.glow.material.color.copy(t.col); t.pool.material.color.copy(t.col);
      t.glow.material.opacity = Math.min(1, v * v * .95); t.pool.material.opacity = v * .55;
      t.glow.visible = v > .01; t.pool.visible = v > .01;
      sum += v;
    });
    tubeLight.intensity = sum / N * 7.5;
  }

  // ─ The meter on the face ─
  const mw = 3.2, mh = 1.34, my = H / 2 + .1, mz = D / 2 + .06;
  const meter = new THREE.Group(); meter.position.set(0, my, mz); root.add(meter);
  const fw = tier >= 1 ? 2048 : 1024, fh = fw * mh / mw | 0;
  const fc = document.createElement('canvas'); fc.width = fw; fc.height = fh;
  const faceTex = T.toTex(fc); faceTex.anisotropy = 8;
  const faceM = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshBasicMaterial({ map: faceTex, toneMapped: false, color: 0xffffff }));
  meter.add(faceM);
  const LO = 60, HI = 140, SW = .78;
  const pivot = new THREE.Vector2(0, -mh / 2 - .42);
  const needleLen = 1.56, needleStart = .72;
  const ang = v => SW - (Math.max(LO - 3, Math.min(HI + 3, v)) - LO) / (HI - LO) * SW * 2; // radians from vertical; +left
  const state = { clean: null, slip: null, value: 80, vel: 0, target: 80, kick: 0, mode: 'tempo' };
  const fp = (a, r) => [fw * (.5 + (Math.sin(-a) * r) / mw), fh * (.5 - ((pivot.y + Math.cos(a) * r) / mh))];
  function paintFace() {
    const g = fc.getContext('2d'), S = fw / mw;
    const bg = g.createRadialGradient(fw * .5, fh * .95, fh * .1, fw * .5, fh * .5, fw * .62);
    bg.addColorStop(0, '#fff4d8'); bg.addColorStop(.55, '#f6d796'); bg.addColorStop(1, '#b37b33');
    g.fillStyle = bg; g.fillRect(0, 0, fw, fh);
    const Rm = 1.36;
    const arc = (a1, a2, r, lw, col) => { g.strokeStyle = col; g.lineWidth = lw * S; g.lineCap = 'butt'; g.beginPath(); for (let i = 0; i <= 60; i++) { const a = a1 + (a2 - a1) * i / 60, p = fp(a, r); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); } g.stroke(); };
    const lo = state.mode === 'even' ? 60 : LO, hi = state.mode === 'even' ? 100 : HI;
    const A = v => SW - (v - lo) / (hi - lo) * SW * 2;
    // Zones.
    arc(A(lo), A(hi), Rm, .012, '#2b1a0c');
    if (state.clean != null) arc(A(lo), A(state.clean), Rm - .05, .07, '#1f8a50');
    if (state.slip != null) arc(A(state.slip), A(Math.min(hi, state.slip + (hi - lo) * .04)), Rm - .05, .1, '#c8283a');
    // Ticks.
    const major = state.mode === 'even' ? 10 : 10, minor = state.mode === 'even' ? 2 : 2;
    for (let v = lo; v <= hi; v += minor) {
      const a = A(v), isM = (v - lo) % major === 0, r0 = Rm, r1 = Rm + (isM ? .13 : .065), p0 = fp(a, r0), p1 = fp(a, r1);
      g.strokeStyle = '#21140a'; g.lineWidth = (isM ? .016 : .007) * S; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
      if (isM) {
        const p = fp(a, Rm + .24);
        g.save(); g.translate(p[0], p[1]); g.rotate(-a);
        g.fillStyle = '#21140a'; g.font = `700 ${.2 * S}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(v + '', 0, 0); g.restore();
      }
    }
    g.fillStyle = 'rgba(33,20,10,.92)'; g.textAlign = 'center';
    g.font = `600 ${.098 * S}px ${FONT}`; g.fillText(state.mode === 'even' ? 'PERCENT EVEN' : 'BEATS PER MINUTE', fw / 2, fh * .74);
    if (state.mark != null) { const a = A(state.mark), p0 = fp(a, Rm - .1), p1 = fp(a, Rm + .05); g.strokeStyle = '#21140a'; g.lineWidth = .028 * S; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke(); }
    faceTex.needsUpdate = true;
  }
  // Clean-tempo and slip flags.
  const flag = (col) => { const m = new THREE.Mesh(new THREE.BoxGeometry(.032, .3, .004), new THREE.MeshBasicMaterial({ color: col, toneMapped: false })); m.visible = false; return m; };
  const flagPivot = new THREE.Group(); flagPivot.position.set(pivot.x, pivot.y, .022); meter.add(flagPivot);
  const nGroup = new THREE.Group(); nGroup.position.set(pivot.x, pivot.y, .03); meter.add(nGroup);
  const nShadow = new THREE.Group(); nShadow.position.set(pivot.x + .018, pivot.y - .012, .006); meter.add(nShadow);
  const needleMat = new THREE.MeshBasicMaterial({ color: 0x120a05, toneMapped: false });
  const nGeo = new THREE.BoxGeometry(.016, needleLen - needleStart, .006); nGeo.translate(0, (needleLen + needleStart) / 2, 0);
  const needle = new THREE.Mesh(nGeo, needleMat); nGroup.add(needle);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(.02, .3, .007), new THREE.MeshBasicMaterial({ color: 0xd42a30, toneMapped: false })); tip.position.y = needleLen - .15; nGroup.add(tip);
  const shadow = new THREE.Mesh(nGeo, new THREE.MeshBasicMaterial({ color: 0x3a1c04, transparent: true, opacity: .32, toneMapped: false, depthWrite: false })); nShadow.add(shadow);
  // Bridge over the pivot.
  const hood = new THREE.Mesh(new RoundedBoxGeometry(mw, .24, .05, 2, .012), new THREE.MeshStandardMaterial({ color: 0x17120e, metalness: .7, roughness: .4 })); hood.position.set(0, -mh / 2 + .1, .05); meter.add(hood);
  // Glass.
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: .05, roughness: .04, metalness: 0, envMapIntensity: 2.2, depthWrite: false, clearcoat: 1, clearcoatRoughness: .03 })); gl.position.z = .09; gl.renderOrder = 6; meter.add(gl);
  // Bezel.
  const bz = new THREE.Shape(), o = .13;
  const rr = (s, x, y, w, h, r) => { s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); };
  rr(bz, -mw / 2 - o, -mh / 2 - o, mw + 2 * o, mh + 2 * o, .08);
  const hole = new THREE.Path(); rr(hole, -mw / 2, -mh / 2, mw, mh, .03); bz.holes.push(hole);
  const bzGeo = new THREE.ExtrudeGeometry(bz, { depth: .08, bevelEnabled: true, bevelThickness: .03, bevelSize: .025, bevelSegments: 4, curveSegments: 8 });
  const bzMat = new THREE.MeshStandardMaterial({ color: 0xd9c7a0, metalness: 1, roughness: .34, envMapIntensity: 2.4 });
  const bezel = new THREE.Mesh(bzGeo, bzMat); bezel.position.z = -.02; bezel.castShadow = true; meter.add(bezel);
  // Knobs and engravings.
  const mats = { alu: new THREE.MeshStandardMaterial({ color: 0xcfc6b4, metalness: 1, roughness: .28, envMapIntensity: 1.5 }) };
  const knobs = [];
  [-2.55, 2.55].forEach(x => { const k = metalKnob(mats, .32, .26); k.position.set(x, my + .02, mz - .02); k.rotation.z = x < 0 ? .7 : -.5; root.add(k); knobs.push(k); });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.05, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb454, toneMapped: false })); lamp.position.set(2.0, my - .6, mz - .01); root.add(lamp);
  const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloMap, color: 0xffa040, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); lampGlow.scale.setScalar(.42); lampGlow.position.copy(lamp.position); root.add(lampGlow);
  // Engraving.
  const ec = T.textCanvas(1024, 96, (g, w, h) => { g.fillStyle = 'rgba(232,218,190,.74)'; g.font = `600 58px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = '26px'; g.fillText('YAMES', w / 2, h / 2); });
  const eng = new THREE.Mesh(new THREE.PlaneGeometry(1.6, .15), new THREE.MeshBasicMaterial({ map: T.toTex(ec), transparent: true, depthWrite: false, toneMapped: false })); eng.position.set(-2.55, my - .68, mz - .005); eng.scale.setScalar(.5); root.add(eng);

  const zero = () => { paintFace(); };
  function setMeter({ value, clean, slip, mode, mark, instant }) {
    let repaint = false;
    if (mode !== undefined && mode !== state.mode) { state.mode = mode; repaint = true; }
    if (clean !== undefined && clean !== state.clean) { state.clean = clean; repaint = true; }
    if (slip !== undefined && slip !== state.slip) { state.slip = slip; repaint = true; }
    if (mark !== undefined && mark !== state.mark) { state.mark = mark; repaint = true; }
    if (value !== undefined) { state.target = value; if (instant) { state.value = value; state.vel = 0; } }
    if (repaint) paintFace();
  }
  function meterAngle(v) { const lo = state.mode === 'even' ? 60 : LO, hi = state.mode === 'even' ? 100 : HI; return SW - (Math.max(lo - 2, Math.min(hi + 2, v)) - lo) / (hi - lo) * SW * 2; }
  let backlight = 1, backTo = 1;
  function setBacklight(v) { backTo = v; }
  function update(dt, time) {
    updateTubes(dt, time);
    // A damped spring: the needle has weight.
    const k = 34, c = 6.2;
    for (let left = dt; left > 0; left -= 1 / 120) { const h = Math.min(left, 1 / 120); state.vel += ((state.target - state.value) * k - state.vel * c) * h; state.value += state.vel * h; }
    state.kick *= Math.exp(-dt * 12);
    const a = meterAngle(state.value) + state.kick * .006 * Math.sin(time * 50);
    nGroup.rotation.z = a; nShadow.rotation.z = a;
    backlight += (backTo - backlight) * Math.min(1, dt * 2.4);
    const b = backlight;
    faceM.material.color.setRGB(b, b * (.94 + .06 * b), b * (.82 + .18 * b));
    lampGlow.material.opacity = .4 + .25 * b;
  }
  function pointsMeter(pad = .16) { const v = []; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([x, y]) => v.push(root.localToWorld(new THREE.Vector3(x * (mw / 2 + pad), my + y * (mh / 2 + pad), mz)))); return v; }
  function pointsTubes() { const v = []; [startX - .25, -startX + .25].forEach(x => [topY - .04, topY + 1.22].forEach(y => [tz - .2, tz + .2].forEach(z => v.push(root.localToWorld(new THREE.Vector3(x, y, z)))))); return v; }
  function pointsAll() { const v = []; [-W / 2, W / 2].forEach(x => [0, H + 1.4].forEach(y => [-D / 2, D / 2].forEach(z => v.push(root.localToWorld(new THREE.Vector3(x, y, z)))))); return v; }
  paintFace();
  return { root, setVisible: v => { root.visible = v; }, setTubes, setMeter, setBacklight, update, repaint: zero, pointsMeter, pointsTubes, pointsAll, kick: v => { state.kick = v; }, setBreath: v => { breath = v; }, tubes, tubeCenter: () => root.localToWorld(new THREE.Vector3(0, topY + .55, tz)) };
}

// ─────────── Metronome ───────────
export function createMetronome({ tier, tex }) {
  const root = new THREE.Group();
  const H = 3.3, RB = 1.18, RT = .36, slope = Math.atan((RB - RT) / Math.SQRT2 / 1 * Math.SQRT2 / H);
  const walnut = new THREE.MeshPhysicalMaterial({ ...tex.walnutRed, color: 0xffffff, clearcoat: 1, clearcoatRoughness: .12, envMapIntensity: .95, normalScale: new THREE.Vector2(.35, .35) });
  const flat = g => { const n = g.toNonIndexed(); n.computeVertexNormals(); return n; };
  const shell = new THREE.Mesh(flat(new THREE.CylinderGeometry(RT * Math.SQRT2, RB * Math.SQRT2, H, 4, 1).rotateY(Math.PI / 4)), walnut);
  shell.position.y = H / 2 + .26; shell.castShadow = true; shell.receiveShadow = true; root.add(shell);
  const plinth = new THREE.Mesh(new RoundedBoxGeometry(RB * 2 + .36, .26, RB * 2 + .36, 3, .035), walnut); plinth.position.y = .13; plinth.castShadow = true; plinth.receiveShadow = true; root.add(plinth);
  const brass = new THREE.MeshStandardMaterial({ color: 0xd9a84e, metalness: 1, roughness: .24, envMapIntensity: 1.6 });
  const trim = new THREE.Mesh(new RoundedBoxGeometry(RB * 2 + .1, .035, RB * 2 + .1, 2, .012), brass); trim.position.y = .275; root.add(trim);
  const cap = new THREE.Mesh(flat(new THREE.CylinderGeometry(.08 * Math.SQRT2, RT * Math.SQRT2 + .02, .22, 4, 1).rotateY(Math.PI / 4)), walnut); cap.position.y = H + .37; root.add(cap);
  const fin = new THREE.Mesh(lathe([[0, 0], [.09, 0], [.1, .03], [.05, .07], [.06, .12], [0, .17]], 18), brass); fin.position.y = H + .46; root.add(fin);
  // Front face, in its own tilted frame.
  const th = Math.atan2(RB - RT, H);
  const front = new THREE.Group();
  const midR = (RB + RT) / 2 + .012;
  front.position.set(0, H / 2 + .26, midR); front.rotation.x = -th; root.add(front);
  const L = H / Math.cos(th);
  const trap = (b, t, h, inset = 0) => { const s = new THREE.Shape(); s.moveTo(-b / 2, -h / 2); s.lineTo(b / 2, -h / 2); s.lineTo(t / 2, h / 2); s.lineTo(-t / 2, h / 2); s.closePath(); return s; };
  const recessH = L * .84;
  const velvet = new THREE.Mesh(new THREE.ShapeGeometry(trap(RB * 1.5, RT * 1.7, recessH)), new THREE.MeshStandardMaterial({ color: 0x0a0604, roughness: .95 })); velvet.position.set(0, .05, .002); velvet.receiveShadow = true; front.add(velvet);
  // Brass door trim.
  const tr = new THREE.Shape(); tr.moveTo(-RB * .8, -recessH * .52); tr.lineTo(RB * .8, -recessH * .52); tr.lineTo(RT * .96, recessH * .52); tr.lineTo(-RT * .96, recessH * .52); tr.closePath();
  const ho = new THREE.Path(); ho.moveTo(-RB * .75, -recessH * .5); ho.lineTo(-RT * .85, recessH * .5); ho.lineTo(RT * .85, recessH * .5); ho.lineTo(RB * .75, -recessH * .5); ho.closePath(); tr.holes.push(ho);
  const trimG = new THREE.Mesh(new THREE.ExtrudeGeometry(tr, { depth: .02, bevelEnabled: true, bevelThickness: .006, bevelSize: .006, bevelSegments: 2 }), brass); trimG.position.set(0, .05, .001); front.add(trimG);
  // Scale plate, engraved.
  const sc = T.textCanvas(256, 1536, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#a87a30'); gr.addColorStop(.5, '#e7c578'); gr.addColorStop(1, '#a87a30');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(40,20,5,.92)'; g.strokeStyle = 'rgba(40,20,5,.92)'; g.textBaseline = 'middle'; g.font = `700 50px ${FONT}`;
    for (let v = 40; v <= 208; v += 8) { const y = 1460 - (208 - v) / 168 * 1370; const m = v % 24 === 0; g.lineWidth = m ? 5 : 2.5; g.beginPath(); g.moveTo(w * .42, y); g.lineTo(w * (m ? .3 : .36), y); g.moveTo(w * .58, y); g.lineTo(w * (m ? .7 : .64), y); g.stroke(); if (m) { g.textAlign = 'center'; g.fillText(v + '', w * .15, y); g.fillText(v + '', w * .85, y); } }
  });
  const plateW = .54, plateH = recessH * .94;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(plateW, plateH), new THREE.MeshStandardMaterial({ map: T.toTex(sc), metalness: .75, roughness: .34, envMapIntensity: 1.1 })); plate.position.set(0, .03, .012); plate.receiveShadow = true; front.add(plate);
  // Pendulum.
  const pend = new THREE.Group(); pend.position.set(0, -recessH * .46, .05); front.add(pend);
  const rod = new THREE.Mesh(new THREE.BoxGeometry(.044, recessH * .92, .012), new THREE.MeshStandardMaterial({ color: 0xece5d8, metalness: 1, roughness: .17, envMapIntensity: 1.8 })); rod.position.y = recessH * .46; rod.castShadow = true; pend.add(rod);
  const wShape = new THREE.Shape(); wShape.moveTo(-.1, -.14); wShape.lineTo(.1, -.14); wShape.lineTo(.17, .14); wShape.lineTo(-.17, .14); wShape.closePath();
  const weight = new THREE.Mesh(new THREE.ExtrudeGeometry(wShape, { depth: .06, bevelEnabled: true, bevelThickness: .016, bevelSize: .014, bevelSegments: 3 }), brass); weight.position.set(0, recessH * .55, .004); weight.castShadow = true; pend.add(weight);
  const hub = new THREE.Mesh(lathe([[0, 0], [.1, 0], [.1, .02], [.05, .05], [0, .05]], 20), brass); hub.rotation.x = Math.PI / 2; hub.position.set(0, 0, .002); pend.add(hub);
  // Beat lamp.
  const jewel = new THREE.Mesh(new THREE.SphereGeometry(.07, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffb454, toneMapped: false })); jewel.position.set(0, .13, RB + .17); jewel.scale.z = .6; root.add(jewel);
  const haloM = HALO();
  const jglow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloM, color: 0xffa040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); jglow.scale.setScalar(1.1); jglow.position.copy(jewel.position); root.add(jglow);
  // Winding key.
  const keyG = new THREE.Group(); keyG.position.set(RB - .2, 1.1, 0); keyG.rotation.z = -Math.PI / 2;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .34, 12), brass); shaft.position.y = .17; keyG.add(shaft);
  const wing = new THREE.Mesh(new RoundedBoxGeometry(.44, .05, .15, 2, .02), brass); wing.position.y = .34; keyG.add(wing);
  root.add(keyG);
  const s = { bpm: 90, phase: 0, swing: .42, quiet: 0, quietTo: 0, flash: 0 };
  function setBpm(b) { s.bpm = b; weight.position.y = recessH * (.18 + (b - 40) / 168 * .7); }
  function setPhase(beats) { s.phase = beats; }
  function beat(strong) { s.flash = strong ? 1 : .7; }
  function update(dt) {
    s.quiet += (s.quietTo - s.quiet) * Math.min(1, dt * 3.2);
    s.flash = Math.max(0, s.flash - dt * 3.2);
    const a = Math.sin(Math.PI * s.phase) * s.swing * (1 - s.quiet);
    pend.rotation.z = a;
    const q = 1 - s.quiet * .86;
    jglow.material.opacity = (.14 + s.flash * .9) * q;
    jewel.material.color.setRGB((.55 + s.flash * .45) * q + .03, (.22 + s.flash * .38) * q + .01, (.04 + s.flash * .1) * q);
  }
  function points() { const v = []; [-1.5, 1.5].forEach(x => [0, H + .62].forEach(y => [-.4, 1.6].forEach(z => v.push(root.localToWorld(new THREE.Vector3(x, y, z)))))); return v; }
  setBpm(90);
  return { root, setBpm, setPhase, beat, setQuiet: v => { s.quietTo = v; }, setSwing: v => { s.swing = v; }, update, points, state: s };
}

// ─────────── Pedals (Setlist) ───────────
const PEDAL_LOOK = {
  ramp: { col: 0x1d3a5e, txt: 'RAMP UP', ink: '#d9e6f5' },
  exercise: { col: 0x6d1d1a, txt: 'EXERCISE', ink: '#f7e6cf' },
  metronome: { col: 0xc9b58f, txt: 'METRONOME', ink: '#2a1a0c' },
  jam: { col: 0x1f4a33, txt: 'JAM', ink: '#e0f0e2' },
};
export function createPedals({ tier, tex }) {
  const root = new THREE.Group();
  const plate = new THREE.Mesh(new RoundedBoxGeometry(11.2, .14, 3.5, 3, .05), new THREE.MeshStandardMaterial({ ...tex.brushedDark, metalness: 1, roughness: 1, envMapIntensity: .8 }));
  plate.position.y = .07; plate.receiveShadow = true; plate.castShadow = true; root.add(plate);
  const nickel = new THREE.MeshStandardMaterial({ color: 0xece5d8, metalness: 1, roughness: .18, envMapIntensity: 1.6 });
  const swProfile = lathe([[0, 0], [.2, 0], [.2, .05], [.14, .07], [.11, .2], [.15, .24], [.15, .28], [.12, .31], [0, .32]], 26);
  const nutG = new THREE.CylinderGeometry(.21, .21, .022, 6);
  const knobG = lathe([[0, 0], [.135, 0], [.135, .02], [.115, .03], [.1, .14], [.085, .17], [0, .175]], 24);
  const knobM = new THREE.MeshPhysicalMaterial({ color: 0x16110e, roughness: .3, clearcoat: 1, clearcoatRoughness: .15 });
  const haloM = HALO();
  const W = 1.9, Dp = 2.75, H = .55;
  const pool = {};
  function make(kind) {
    const look = PEDAL_LOOK[kind], g = new THREE.Group();
    const shell = new THREE.Mesh(new RoundedBoxGeometry(W, H, Dp, 5, .1), new THREE.MeshPhysicalMaterial({ color: look.col, metalness: .25, roughness: .3, clearcoat: 1, clearcoatRoughness: .12, envMapIntensity: 1.3 }));
    shell.position.y = H / 2; shell.castShadow = true; shell.receiveShadow = true; g.add(shell);
    const sw = new THREE.Mesh(swProfile, nickel); sw.position.set(0, H, .72); sw.castShadow = true; g.add(sw);
    const nut = new THREE.Mesh(nutG, nickel); nut.position.set(0, H + .012, .72); g.add(nut);
    [-.52, 0, .52].forEach((x, i) => { const k = new THREE.Mesh(knobG, knobM); k.position.set(x, H, -.92); k.castShadow = true; k.rotation.y = i * 1.3; const l = new THREE.Mesh(new THREE.BoxGeometry(.016, .012, .09), new THREE.MeshBasicMaterial({ color: 0xf2e8d6, toneMapped: false })); l.position.set(0, .18, .05); k.add(l); g.add(k); });
    const led = new THREE.Mesh(new THREE.SphereGeometry(.05, 14, 10), new THREE.MeshBasicMaterial({ color: 0x3a0d05, toneMapped: false })); led.position.set(0, H + .012, -.46); g.add(led);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloM, color: 0xffa040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false })); glow.scale.setScalar(.8); glow.position.set(0, H + .05, -.46); g.add(glow);
    const c = T.textCanvas(512, 200, (x, w, h) => { x.fillStyle = look.ink; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `700 ${look.txt.length > 8 ? 84 : 104}px ${FONT}`; x.letterSpacing = '6px'; x.fillText(look.txt, w / 2, h / 2); });
    const dec = new THREE.Mesh(new THREE.PlaneGeometry(1.5, .586).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: T.toTex(c), transparent: true, depthWrite: false, toneMapped: false })); dec.position.set(0, H + .003, .1); g.add(dec);
    return { g, kind, sw, led, glow, ledV: 0, ledTo: 0, slot: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1, press: 0 };
  }
  const items = [];
  const slotX = (i, n) => (i - (n - 1) / 2) * (W + .42);
  function setItems(kinds, { snap = false } = {}) {
    // Keep existing objects by identity order: kinds is a list of {key,kind}.
    const n = kinds.length, seen = new Set();
    kinds.forEach((it, i) => {
      seen.add(it.key);
      let p = pool[it.key];
      if (!p) { p = make(it.kind); pool[it.key] = p; p.g.position.set(slotX(i, n), .14, 5.2); root.add(p.g); p.new = true; }
      p.g.visible = true;
      const target = new THREE.Vector3(slotX(i, n), .14, 0);
      if (snap) { p.g.position.copy(target); p.t = 1; } else if (!p.to.equals(target) || p.new) { p.from.copy(p.g.position); p.to.copy(target); p.t = 0; }
      p.to.copy(target); p.new = false; p.index = i;
    });
    Object.keys(pool).forEach(k => { if (!seen.has(k)) { const p = pool[k]; p.from.copy(p.g.position); p.to.set(p.g.position.x, .14, 5.2); p.t = 0; p.leaving = true; } else pool[k].leaving = false; });
  }
  function setActive(key) { Object.keys(pool).forEach(k => { pool[k].ledTo = k === key ? 1 : 0; }); }
  function stomp(key) { const p = pool[key]; if (p) { p.press = 1; p.ledTo = 1; } }
  const col = new THREE.Color(), lit = new THREE.Color(0xffa63a), off = new THREE.Color(0x3a0d05);
  function update(dt) {
    Object.values(pool).forEach(p => {
      if (p.t < 1) {
        p.t = Math.min(1, p.t + dt / .55);
        const e = p.t < .5 ? 4 * p.t * p.t * p.t : 1 - Math.pow(-2 * p.t + 2, 3) / 2;
        p.g.position.lerpVectors(p.from, p.to, e);
        p.g.position.y = .14 + Math.sin(Math.PI * p.t) * .9; // Lifted, and set back down.
        p.g.rotation.z = Math.sin(Math.PI * p.t) * (p.to.x - p.from.x) * -.05;
        if (p.t >= 1 && p.leaving) p.g.visible = false;
      }
      p.press = Math.max(0, p.press - dt * 3.2);
      p.sw.position.y = .55 - p.press * .06;
      p.ledV += (p.ledTo - p.ledV) * Math.min(1, dt * 8);
      p.led.material.color.copy(off).lerp(lit, p.ledV);
      p.glow.material.opacity = p.ledV * .85; p.glow.visible = p.ledV > .01;
    });
  }
  function points() { const v = []; [-5.7, 5.7].forEach(x => [0, .9].forEach(y => [-1.76, 1.76].forEach(z => v.push(root.localToWorld(new THREE.Vector3(x, y, z)))))); return v; }
  function pointsFor(n) { const hw = (n * (W + .42)) / 2 + .1, v = []; [-hw, hw].forEach(x => [0, .9].forEach(y => [-1.6, 1.6].forEach(z => v.push(root.localToWorld(new THREE.Vector3(x, y, z)))))); return v; }
  return { root, setItems, setActive, stomp, update, points, pointsFor };
}

// ─────────── Clean tempo chart: one wound string over machined saddles ───────────
export function createChart({ tier, tex }) {
  const root = new THREE.Group();
  const N = 8, WD = 8.4, HMAX = 3.4, LO = 70, HI = 95;
  const xOf = i => -WD / 2 + i * WD / (N - 1);
  const yOf = v => .3 + (v - LO) / (HI - LO) * HMAX;
  const plank = new THREE.Mesh(new RoundedBoxGeometry(WD + 1.2, .3, 1.5, 3, .05), new THREE.MeshPhysicalMaterial({ ...tex.walnut, color: 0xffffff, clearcoat: .6, clearcoatRoughness: .25 }));
  plank.position.y = .15; plank.castShadow = true; plank.receiveShadow = true; root.add(plank);
  const backing = new THREE.Mesh(new THREE.BoxGeometry(WD + 1.2, HMAX + .9, .06), new THREE.MeshStandardMaterial({ ...tex.brushedDark, metalness: .9, roughness: 1, envMapIntensity: .55 })); backing.position.set(0, (HMAX + .9) / 2 + .15, -.58); backing.receiveShadow = true; root.add(backing);
  const grid = new THREE.MeshBasicMaterial({ color: 0xb09a80, toneMapped: false, transparent: true, opacity: .55 });
  [70, 80, 90].forEach(v => { const m = new THREE.Mesh(new THREE.BoxGeometry(WD + .4, .014, .002), grid); m.position.set(0, .3 + yOf(v), -.54); root.add(m); });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd8a650, metalness: 1, roughness: .22, envMapIntensity: 1.5 });
  const nickel = new THREE.MeshStandardMaterial({ color: 0xe6dfd0, metalness: 1, roughness: .2, envMapIntensity: 1.6 });
  const postG = new THREE.CylinderGeometry(.075, .085, 1, 22);
  const footG = lathe([[0, 0], [.24, 0], [.24, .03], [.16, .05], [.1, .1], [0, .1]], 26);
  const sadG = lathe([[0, 0], [.14, 0], [.14, .03], [.09, .09], [.03, .13], [0, .13]], 22);
  const posts = [];
  for (let i = 0; i < N; i++) {
    const g = new THREE.Group(); g.position.set(xOf(i), .3, .1); root.add(g);
    const foot = new THREE.Mesh(footG, nickel); foot.castShadow = true; g.add(foot);
    const post = new THREE.Mesh(postG, i === N - 1 ? brass : nickel); post.castShadow = true; g.add(post);
    const sad = new THREE.Mesh(sadG, i === N - 1 ? brass : nickel); sad.castShadow = true; g.add(sad);
    posts.push({ g, post, sad, h: .02, to: .02, delay: 0, v: 0 });
  }
  // The string: one mesh per span, rescaled as the saddles rise.
  const strMat = new THREE.MeshStandardMaterial({ color: 0xffc27a, metalness: 1, roughness: .28, envMapIntensity: 1.8, normalMap: tex.wind, normalScale: new THREE.Vector2(1, 1), emissive: 0xff8f28, emissiveIntensity: .22 });
  const segG = new THREE.CylinderGeometry(.026, .026, 1, 10, 1).rotateZ(Math.PI / 2);
  const spans = [];
  for (let i = 0; i < N - 1; i++) { const m = new THREE.Mesh(segG, strMat); m.castShadow = true; root.add(m); spans.push(m); }
  const haloM = HALO();
  const endGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloM, color: 0xffa040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); endGlow.scale.setScalar(1.5); root.add(endGlow);
  const endBall = new THREE.Mesh(new THREE.SphereGeometry(.07, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb454, toneMapped: false })); root.add(endBall);
  let vals = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  function layout() {
    for (let i = 0; i < N; i++) { const p = posts[i]; p.post.scale.y = Math.max(.001, p.h); p.post.position.y = p.h / 2; p.sad.position.y = p.h - .02; }
    for (let i = 0; i < N - 1; i++) {
      a.set(xOf(i), .3 + posts[i].h + .12, .1); b.set(xOf(i + 1), .3 + posts[i + 1].h + .12, .1);
      const m = spans[i]; m.position.copy(a).add(b).multiplyScalar(.5);
      const len = a.distanceTo(b); m.scale.set(len, 1, 1); m.rotation.z = Math.atan2(b.y - a.y, b.x - a.x);
    }
    const e = posts[N - 1]; endGlow.position.set(xOf(N - 1), .3 + e.h + .12, .16); endBall.position.copy(endGlow.position);
  }
  function setValues(v, { stagger = .1, instant = false } = {}) {
    vals = v;
    v.forEach((val, i) => { const p = posts[i]; p.to = yOf(val) - .3 + .3; p.delay = instant ? 0 : i * stagger; if (instant) p.h = p.to; else p.h = .02; });
    layout();
  }
  function update(dt, time) {
    let moved = false;
    posts.forEach(p => { if (p.delay > 0) { p.delay -= dt; return; } const nh = p.h + (p.to - p.h) * Math.min(1, dt * 4.6); if (Math.abs(nh - p.h) > 1e-4) moved = true; p.h = nh; });
    if (moved) layout();
    const rise = posts[N - 1].h / Math.max(.01, posts[N - 1].to);
    endGlow.material.opacity = Math.max(0, (rise - .7) / .3) * (.72 + Math.sin(time * 1.8) * .1);
  }
  function pointOf(i) { return root.localToWorld(new THREE.Vector3(xOf(i), .3 + yOf(vals[i] ?? LO) - .3 + .3 + .12, .1)); }
  function footOf(i) { return root.localToWorld(new THREE.Vector3(xOf(i), 0, .7)); }
  function gridPoint(v) { return root.localToWorld(new THREE.Vector3(-WD / 2 - .55, .3 + yOf(v), -.54)); }
  function points() { const v = []; [-WD / 2 - .6, WD / 2 + .6].forEach(x => [0, HMAX + 1].forEach(y => [-.6, .6].forEach(z => v.push(root.localToWorld(new THREE.Vector3(x, y, z)))))); return v; }
  return { root, setValues, update, pointOf, footOf, gridPoint, points };
}
