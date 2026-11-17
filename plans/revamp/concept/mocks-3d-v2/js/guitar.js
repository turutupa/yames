// The guitar: rosewood board, nickel frets, wound strings that really move, and notes that light the wood.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './tex.js';
import { STEP_FRETS } from './music.js';

export const L = 6.5;
const NW = 1.3, R = 4.2;
export const fretX = n => L * (1 - Math.pow(2, -n / 12));
// Markers sit just behind the fret wire, where the finger goes. That leaves the inlay at the centre of the space clear.
const NOTE_R = .05;
export const noteX = f => f <= 0 ? -.07 : fretX(f) - NOTE_R - .021;
const INLAY_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
const DOUBLE = f => f === 12 || f === 24;
const span = x => (.36 + .16 * x / L) * NW;
export const strZ = (s, x) => (s - 3.5) * span(x) / 5;
const XEND = fretX(24) + .14;
const boardW = x => (.43 + (.565 - .43) * Math.max(0, x) / XEND) * NW;
const crown = z => -z * z / (2 * R);
const strH = x => .05 + .018 * x / L;
const GAUGE = [.0034, .0043, .0056, .0074, .0092, .0112];

const COLORS = { aim: 0xffb454, tone: 0x4ee08a, tens: 0x5aa9ff, clash: 0xff5d6c, box: 0xffe2bd, dim: 0x7d6a55, white: 0xffffff };
const LETTER = { aim: '#201507', tone: '#07190f', tens: '#06162a', clash: '#2a0509', box: '#e6dac8', dim: '#8a7a68' };

function arrays() { return { p: [], n: [], uv: [], c: [], i: [] }; }
function toGeo(a) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a.p, 3));
  if (a.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
  if (a.c.length) g.setAttribute('color', new THREE.Float32BufferAttribute(a.c, 3));
  if (a.i.length) g.setIndex(a.i);
  if (a.n.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(a.n, 3)); else g.computeVertexNormals();
  return g;
}

function boardGeometry(tile) {
  const xs = [-.012];
  for (let f = 1; f <= 24; f++) { const x = fretX(f); xs.push(x - .03, x - .012, x + .012, x + .03); }
  xs.push(XEND);
  const cols = 14, a = arrays();
  xs.forEach(x => {
    const W = boardW(x);
    let ao = 1;
    for (let f = 1; f <= 24; f++) { const d = Math.abs(x - fretX(f)); if (d < .013) ao = .34; else if (d < .031) ao = Math.min(ao, .78); }
    for (let c = 0; c <= cols; c++) {
      const k = c / cols, z = (k - .5) * W;
      a.p.push(x, crown(z), z);
      a.uv.push(x / tile, k * .96 + .02);
      const edge = .72 + .28 * Math.min(1, Math.min(k, 1 - k) * 8);
      const v = ao * edge;
      a.c.push(v, v, v);
    }
  });
  for (let r = 0; r < xs.length - 1; r++) for (let c = 0; c < cols; c++) {
    const i = r * (cols + 1) + c, j = i + cols + 1;
    a.i.push(i, i + 1, j, j, i + 1, j + 1);
  }
  return toGeo(a);
}

function bindingGeometry() {
  const a = arrays();
  [-1, 1].forEach(side => {
    const base = a.p.length / 3, w = .004;
    [-.012, XEND].forEach(x => {
      const W = boardW(x) / 2, z = side * W, y = crown(z);
      // Inner top, outer top, outer bottom.
      a.p.push(x, y + .0015, z - side * .004, x, y, z + side * w, x, y - .068, z + side * w);
    });
    const tri = side > 0 ? [0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5] : [0, 1, 3, 1, 4, 3, 1, 2, 4, 2, 5, 4];
    tri.forEach(t => a.i.push(base + t));
  });
  a.p.push(XEND, 0, boardW(XEND) / 2, XEND, 0, -boardW(XEND) / 2, XEND, -.07, -boardW(XEND) / 2, XEND, -.07, boardW(XEND) / 2);
  const b = a.p.length / 3 - 4; a.i.push(b, b + 2, b + 1, b, b + 3, b + 2);
  return toGeo(a);
}

function neckBackGeometry() {
  const a = arrays(), seg = 12;
  [-.03, 2, XEND].forEach((x, r) => {
    const W = boardW(x) / 2 + .012, d = .27 + .05 * x / L;
    for (let i = 0; i <= seg; i++) {
      const t = Math.PI * i / seg, z = Math.cos(t) * W, y = -.065 - Math.sin(t) * d;
      a.p.push(x, y, z); a.uv.push(x * .7, i / seg);
    }
  });
  for (let r = 0; r < 2; r++) for (let i = 0; i < seg; i++) { const p = r * (seg + 1) + i, q = p + seg + 1; a.i.push(p, q, p + 1, p + 1, q, q + 1); }
  return toGeo(a);
}

function fretsGeometry(cols, rad) {
  const a = arrays();
  const hw = .0145, h = .0165;
  const edge = [0, .004, .009, .015, .022], ks = [...edge];
  for (let i = 1; i < cols - 9; i++) ks.push(.022 + (.956 * i) / (cols - 9));
  ks.push(...edge.slice().reverse().map(e => 1 - e));
  cols = ks.length - 1;
  for (let f = 1; f <= 24; f++) {
    const x = fretX(f), W = boardW(x) + .004, base = a.p.length / 3;
    for (let c = 0; c <= cols; c++) {
      const k = ks[c], z = (k - .5) * W, e = Math.min(1, Math.min(k, 1 - k) * W / .016), sc = Math.sqrt(Math.max(.015, 1 - (1 - e) * (1 - e)));
      for (let r = 0; r <= rad; r++) {
        const t = Math.PI * r / rad;
        a.p.push(x + Math.cos(t) * hw * sc, crown(z) - .001 + Math.sin(t) * h * sc, z);
      }
    }
    for (let c = 0; c < cols; c++) for (let r = 0; r < rad; r++) {
      const i = base + c * (rad + 1) + r, j = i + rad + 1;
      a.i.push(i, i + 1, j, j, i + 1, j + 1);
    }
  }
  return toGeo(a);
}

function stringGeometry(s, segs, rad, wound) {
  const a = arrays(), aT = [], r0 = GAUGE[s - 1];
  const pitch = wound ? .0062 : 1;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, x = t * XEND, z = strZ(s, x), y = crown(z) + strH(x);
    for (let j = 0; j <= rad; j++) {
      const th = j / rad * Math.PI * 2;
      a.p.push(x, y + Math.sin(th) * r0, z + Math.cos(th) * r0);
      a.n.push(0, Math.sin(th), Math.cos(th));
      a.uv.push(x / pitch + j / rad * .9, j / rad);
      aT.push(t);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) {
    const p = i * (rad + 1) + j, q = p + rad + 1;
    a.i.push(p, q, p + 1, p + 1, q, q + 1);
  }
  const g = toGeo(a);
  g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
  return g;
}

function ribbonGeometry(s, segs) {
  const a = arrays(), aT = [], aV = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, x = t * XEND, z = strZ(s, x), y = crown(z) + strH(x) - .006;
    [-1, 1].forEach(v => { a.p.push(x, y, z); a.n.push(0, 1, 0); aT.push(t); aV.push(v); });
  }
  for (let i = 0; i < segs; i++) { const p = i * 2; a.i.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); }
  const g = toGeo(a);
  g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
  g.setAttribute('aV', new THREE.Float32BufferAttribute(aV, 1));
  g.computeBoundingSphere();
  g.boundingSphere.radius = 6;
  return g;
}

function vibrate(material, u) {
  material.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aT; uniform float uF,uA,uPh; varying float vS; varying float vT;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float sp=(aT-uF)/(1.-uF); vT=aT; vS=sp;
        if(sp>0.){ float e=sin(3.14159*sp); transformed.z+=uA*(e*cos(uPh)+.35*sin(6.28318*sp)*cos(uPh*1.7+1.)); transformed.y+=uA*.35*e*sin(uPh*.9); }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uGC; uniform float uG,uP,uPA; varying float vS; varying float vT;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if(vS>0.){ float dd=vS-uP; totalEmissiveRadiance+=uGC*(uG*(.25+.75*abs(sin(3.14159*vS*2.)))+uPA*exp(-dd*dd*90.)*2.4); }`);
  };
  material.customProgramCacheKey = () => 'yames-string';
}

const RIB_VERT = `attribute float aT; attribute float aV; uniform float uF,uA,uW; varying float vS,vV,vE;
void main(){ float sp=(aT-uF)/(1.-uF); vS=sp; vV=aV; float e=sp>0.?sin(3.14159*sp):0.; vE=e;
 vec3 p=position; p.z+=aV*(uW+uA*(.2+1.25*e)); gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`;
const RIB_FRAG = `uniform vec3 uGC; uniform float uG,uP,uPA; varying float vS,vV,vE;
void main(){ if(vS<0.) discard; float a=exp(-vV*vV*3.2)-.04; float dd=vS-uP; float wave=.22+.78*vE;
 float k=uG*wave*.55+uPA*exp(-dd*dd*70.)*.9; gl_FragColor=vec4(uGC*k*max(a,0.),1.);
 #include <colorspace_fragment>
}`;

export function createGuitar({ tier, env, tex, wood = 'rosewood', overlay }) {
  const root = new THREE.Group();
  const size = tier >= 2 ? 1 : tier === 1 ? .75 : .5;
  const tile = 1.9;

  // Board.
  const boardMat = new THREE.MeshPhysicalMaterial({
    ...tex[wood], color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0,
    normalScale: new THREE.Vector2(.6, .6), envMapIntensity: .75,
    clearcoat: wood === 'ebony' ? .35 : .12, clearcoatRoughness: .42,
  });
  const board = new THREE.Mesh(boardGeometry(tile), boardMat);
  board.receiveShadow = true; root.add(board);
  const edgeMat = new THREE.MeshPhysicalMaterial({ color: wood === 'ebony' ? 0x120d0a : 0x3b2115, roughness: .42, clearcoat: .5, clearcoatRoughness: .3, side: THREE.DoubleSide });
  const binding = new THREE.Mesh(bindingGeometry(), edgeMat); binding.castShadow = true; root.add(binding);
  const backMat = new THREE.MeshPhysicalMaterial({ color: 0x5e3a20, roughness: .46, clearcoat: .55, clearcoatRoughness: .3 });
  const back = new THREE.Mesh(neckBackGeometry(), backMat); back.castShadow = true; root.add(back);

  // Nickel frets.
  const fretMat = new THREE.MeshStandardMaterial({ color: 0xeeeae2, metalness: 1, roughness: .22, envMapIntensity: 1.45 });
  const frets = new THREE.Mesh(fretsGeometry(tier >= 1 ? 22 : 12, tier >= 1 ? 7 : 5), fretMat);
  frets.castShadow = true; frets.receiveShadow = true; root.add(frets);

  // Bone nut.
  const nut = new THREE.Mesh(new RoundedBoxGeometry(.05, .092, boardW(0) + .022, 2, .012), new THREE.MeshPhysicalMaterial({ color: 0xf2e9d4, roughness: .38, clearcoat: .4, emissive: 0xf2e9d4, emissiveIntensity: .12 }));
  nut.position.set(-.024, .01, 0); nut.castShadow = true; root.add(nut);

  // The strings stop on a clean nickel bar at the end of the neck.
  const endBar = new THREE.Mesh(new RoundedBoxGeometry(.05, .082, boardW(XEND) + .02, 2, .014), fretMat); endBar.position.set(XEND - .012, .012, 0); endBar.castShadow = true; root.add(endBar);

  // Pearl inlays.
  const pearlMat = tier >= 1
    ? new THREE.MeshPhysicalMaterial({ map: tex.pearl, color: 0xd9d2c4, roughness: .3, clearcoat: 1, clearcoatRoughness: .1, iridescence: .8, iridescenceIOR: 1.5, iridescenceThicknessRange: [180, 520], envMapIntensity: 1.5, emissive: 0xe8e0d0, emissiveIntensity: .1, emissiveMap: tex.pearl })
    : new THREE.MeshStandardMaterial({ map: tex.pearl, color: 0xd9d2c4, roughness: .32, envMapIntensity: 1.4, emissive: 0xe8e0d0, emissiveIntensity: .18, emissiveMap: tex.pearl });
  const blockShape = (w, h) => { const s = new THREE.Shape(), r = .008; s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2); return s; };
  const blocks = false; // Dots on every neck: the owner reads position from them.
  const inlayGeo = (f) => {
    const gap = fretX(f) - fretX(f - 1);
    if (blocks) { const g = new THREE.ShapeGeometry(blockShape(gap * .46, boardW(fretX(f)) * .62)); g.rotateX(-Math.PI / 2); return g; }
    const g = new THREE.CircleGeometry(.042, 32); g.rotateX(-Math.PI / 2); return g;
  };
  const inlays = new THREE.Group(); root.add(inlays);
  // Side dots: the markers a player actually looks at, on the edge of the neck.
  const sideGeo = new THREE.CircleGeometry(.017, 16);
  INLAY_FRETS.forEach(f => {
    const x = (fretX(f - 1) + fretX(f)) / 2;
    const place = z => { const m = new THREE.Mesh(inlayGeo(f), pearlMat); m.position.set(x, crown(z) + .0012, z); m.receiveShadow = true; inlays.add(m); };
    if (DOUBLE(f) && !blocks) { place(-.112); place(.112); } else place(0);
    const hw = boardW(x) / 2 + .0048, sy = -.03;
    (DOUBLE(f) ? [-.024, .024] : [0]).forEach(dx => [1, -1].forEach(side => {
      const d = new THREE.Mesh(sideGeo, pearlMat); d.position.set(x + dx, crown(hw) + sy, side * hw); if (side < 0) d.rotation.y = Math.PI; root.add(d);
    }));
  });

  // Strings.
  const wn = tex.wind, strings = [];
  const segs = tier >= 2 ? 150 : tier === 1 ? 110 : 80, radial = tier >= 2 ? 9 : 6;
  for (let s = 1; s <= 6; s++) {
    const w = s >= 4;
    const u = { uF: { value: 0 }, uA: { value: 0 }, uPh: { value: Math.random() * 6 }, uGC: { value: new THREE.Color(COLORS.aim) }, uG: { value: 0 }, uP: { value: 0 }, uPA: { value: 0 }, uW: { value: .006 + s * .0012 } };
    const mat = new THREE.MeshStandardMaterial({ color: w ? 0xcdbb98 : 0xefeae0, metalness: 1, roughness: w ? .32 : .18, envMapIntensity: 1.5, normalMap: w ? wn : null, normalScale: new THREE.Vector2(.55, .55) });
    vibrate(mat, u);
    const mesh = new THREE.Mesh(stringGeometry(s, segs, radial, w), mat);
    mesh.castShadow = true; mesh.frustumCulled = false; root.add(mesh);
    const rib = new THREE.Mesh(ribbonGeometry(s, segs >> 1), new THREE.ShaderMaterial({ uniforms: u, vertexShader: RIB_VERT, fragmentShader: RIB_FRAG, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    rib.visible = false; rib.frustumCulled = false; root.add(rib);
    strings.push({ s, mesh, rib, u, amp: 0, glow: 0, pulse: 0, pulseA: 0, hz: 22 + (6 - s) * 3.2, ph: 0, breath: 0 });
  }

  // Soft shadow lines for tiers with no shadow map.
  let fakeShadows = null;
  if (tier < 2) {
    const a = arrays();
    for (let s = 1; s <= 6; s++) {
      const b = a.p.length / 3, wd = .012 + GAUGE[s - 1];
      [0, XEND].forEach(x => {
        const z = strZ(s, x) + .012, y = crown(z) + .0022;
        a.p.push(x, y, z - wd, x, y, z + wd); a.uv.push(0, 0, 0, 1); a.n.push(0, 1, 0, 0, 1, 0);
      });
      a.i.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    const strip = T.softStrip();
    fakeShadows = new THREE.Mesh(toGeo(a), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: strip, transparent: true, opacity: .62, depthWrite: false, toneMapped: false }));
    root.add(fakeShadows);
  }

  // Notes.
  const discGeo = new THREE.CircleGeometry(NOTE_R, 40); discGeo.rotateX(-Math.PI / 2);
  const haloGeo = new THREE.PlaneGeometry(1, 1); haloGeo.rotateX(-Math.PI / 2);
  const haloTex = T.radial([[0, 'rgba(255,255,255,1)'], [.22, 'rgba(255,255,255,.42)'], [.55, 'rgba(255,255,255,.09)'], [1, 'rgba(255,255,255,0)']]);
  const pool = [], active = new Map();
  // Markers draw above the strings, so a wound string never crosses a letter.
  const overlayGroup = new THREE.Group(); if (overlay) overlay.add(overlayGroup);
  function makeNote() {
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false }));
    const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    disc.renderOrder = 2; halo.renderOrder = 1;
    const ring = new THREE.Mesh(new THREE.RingGeometry(NOTE_R * 1.22, NOTE_R * 1.42, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false }));
    ring.renderOrder = 3;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
    label.scale.setScalar(.118); label.renderOrder = 4;
    root.add(halo);
    overlayGroup.add(disc, ring, label);
    return { disc, halo, ring, label, o: 0, to: 0, flash: 0, kind: null, s: 0, f: 0, ringOn: false };
  }
  function placeNote(n, d) {
    const x = noteX(d.f), z = strZ(d.s, x), y = crown(z);
    const top = y + strH(x) + .012;
    n.disc.position.set(x, top, z); n.halo.position.set(x, y + .0028, z); n.ring.position.set(x, top, z); n.label.position.set(x, top, z);
    n.s = d.s; n.f = d.f;
  }
  function styleNote(n, d) {
    if (n.kind !== d.kind) {
      n.kind = d.kind;
      n.disc.material.map = T.noteDisc(d.kind); n.disc.material.needsUpdate = true;
      n.halo.material.color.set(COLORS[d.kind] ?? COLORS.box);
      const hs = d.kind === 'box' || d.kind === 'dim' ? 0 : .36;
      n.halo.scale.setScalar(hs || .001);
    }
    n.label.material.map = T.noteLabel(d.t || '', LETTER[d.kind] || LETTER.box); n.label.material.needsUpdate = true;
    n.ringOn = !!d.ring;
    n.baseOpacity = d.opacity ?? 1;
  }
  function setNotes(list, { fade = .25 } = {}) {
    const keep = new Set();
    list.forEach(d => {
      const k = d.s + ':' + d.f; keep.add(k);
      let n = active.get(k);
      if (!n) { n = pool.pop() || makeNote(); n.kind = null; active.set(k, n); placeNote(n, d); n.o = fade ? 0 : 1; }
      styleNote(n, d); n.to = 1; n.fade = fade;
    });
    active.forEach((n, k) => { if (!keep.has(k)) { n.to = 0; n.fade = fade; } });
  }
  function updateNotes(dt) {
    active.forEach((n, k) => {
      const rate = n.fade ? dt / n.fade : 1;
      n.o = n.o < n.to ? Math.min(n.to, n.o + rate) : Math.max(n.to, n.o - rate);
      n.flash = Math.max(0, n.flash - dt * 2.4);
      const v = n.o * (n.baseOpacity ?? 1);
      n.disc.material.opacity = v; n.label.material.opacity = v;
      n.disc.visible = n.label.visible = v > .004;
      const isDim = n.kind === 'box' || n.kind === 'dim';
      n.halo.material.opacity = (isDim ? 0 : v * (.32 + globals.breath * .12)) + n.flash * .7;
      n.halo.visible = n.halo.material.opacity > .004;
      if (n.flash > 0) n.halo.scale.setScalar(.36 + (1 - n.flash) * .2); else if (!isDim) n.halo.scale.setScalar(.36);
      n.ring.material.opacity = n.ringOn ? v : 0; n.ring.visible = n.ringOn && v > .01;
      if (n.o <= 0 && n.to === 0) { n.disc.visible = n.halo.visible = n.label.visible = n.ring.visible = false; active.delete(k); pool.push(n); }
    });
  }
  const globals = { breath: 0 };
  // Quiet fret numbers along the low-E edge, centred on the real fret spaces.
  const NUM_Z = x => boardW(x) / 2 + .092;
  const numbers = new THREE.Group(); overlayGroup.add(numbers);
  const numSprites = [];
  for (let f = 1; f <= 24; f++) {
    const x = (fretX(f - 1) + fretX(f)) / 2, marked = INLAY_FRETS.includes(f);
    if (!marked && f > 12) continue; // Up where the frets get tight, only the marked ones.
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.noteLabel(String(f), '#efe0c6'), transparent: true, opacity: marked ? .86 : .46, depthTest: false, depthWrite: false, toneMapped: false }));
    sp.position.set(x, .001, NUM_Z(x)); sp.userData.base = marked ? .104 : .086; sp.scale.setScalar(sp.userData.base); sp.renderOrder = 1; numbers.add(sp); numSprites.push(sp);
  }

  // The note's light: a real point light, so frets near a note catch its colour.
  const noteLight = new THREE.PointLight(0xffffff, 0, 1.1, 1.8);
  noteLight.position.set(0, .18, 0); root.add(noteLight);
  let lightI = 0;

  // Transient flashes on the wood, for notes with no resting disc.
  const flashes = Array.from({ length: 8 }, () => {
    const m = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    m.visible = false; m.renderOrder = 1; root.add(m); return { m, v: 0 };
  });
  let fi = 0;
  function pluck(s, f, kind = 'aim', { amp = .009, light = 1, glow = 1, flash = 1, reduce = false } = {}) {
    const st = strings[s - 1], col = COLORS[kind] ?? COLORS.aim, x = noteX(f);
    st.u.uF.value = f > 0 ? fretX(f) / XEND : 0;
    st.amp = reduce ? 0 : Math.max(st.amp, amp); st.glow = Math.min(1.1, st.glow + glow); st.pulse = 0; st.pulseA = glow;
    st.u.uGC.value.set(col);
    st.rib.visible = true;
    const k = s + ':' + f, n = active.get(k);
    if (n) n.flash = Math.max(n.flash, flash);
    if (flash > 0) {
      const F = flashes[fi++ % flashes.length], z = strZ(s, x);
      F.m.position.set(x, crown(z) + .003, z); F.m.material.color.set(col); F.v = flash * .85; F.m.visible = true; F.m.scale.setScalar(.55);
    }
    if (light > 0) { noteLight.color.set(col); noteLight.position.set(x, .2, strZ(s, x)); lightI = light; }
  }
  function strum(kind = 'aim', stagger = .05, amp = .012) {
    return strings.map((st, i) => setTimeout(() => pluck(st.s, 0, kind, { amp, light: 0, glow: .55, flash: 0 }), i * stagger * 1000));
  }

  // A sweep of warm light that runs along the frets: used for arrivals and results.
  let sweepT = -1, sweepDur = 1, sweepCol = 0xffd9a8, sweepPow = 1, sweepA = 0, sweepB = L;
  const sweepLight = tier >= 1 ? new THREE.PointLight(0xffd9a8, 0, 3.2, 1.5) : noteLight;
  if (sweepLight !== noteLight) root.add(sweepLight);
  function sweep({ dur = 1.5, color = 0xffd9a8, power = 3.4, from = -.2, to = 5.2 } = {}) { sweepT = 0; sweepDur = dur; sweepCol = color; sweepPow = power; sweepA = from; sweepB = to; }

  // Steps, as inlays along the neck.
  const stepGroup = new THREE.Group(); stepGroup.visible = false; root.add(stepGroup);
  const stepGlow = [];
  const stepPearl = pearlMat.clone(), stepHalo = haloTex;
  STEP_FRETS.forEach((f) => {
    const x = (fretX(f - 1) + fretX(f)) / 2;
    const geo = blocks ? new THREE.ShapeGeometry(blockShape((fretX(f) - fretX(f - 1)) * .5, boardW(x) * .66)).rotateX(-Math.PI / 2) : DOUBLE(f) ? mergeGeometries([new THREE.CircleGeometry(.05, 32).rotateX(-Math.PI / 2).translate(0, 0, -.11), new THREE.CircleGeometry(.05, 32).rotateX(-Math.PI / 2).translate(0, 0, .11)]) : new THREE.CircleGeometry(.056, 40).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, stepPearl.clone()); m.position.set(x, .0015, 0);
    const lit = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: COLORS.aim, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })); lit.position.set(x, .0025, 0); lit.renderOrder = 2;
    const h = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ map: stepHalo, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); h.position.set(x, .002, 0); h.scale.setScalar(.72); h.renderOrder = 1;
    stepGroup.add(m, lit, h);
    stepGlow.push({ m, lit, h, x, state: 'later', o: 0, t: 0 });
  });
  function setSteps(states) { // array of 'done'|'cur'|'' or null to hide
    if (!states) { stepGroup.visible = false; inlays.visible = true; return; }
    stepGroup.visible = true; inlays.visible = false;
    states.forEach((st, i) => { const g = stepGlow[i]; g.state = st; g.delay = i * .09; g.t0 = 0; g.lit.material.color.set(st === 'done' ? COLORS.tone : COLORS.aim); g.h.material.color.set(st === 'done' ? COLORS.tone : COLORS.aim); });
    stepsClock = 0;
  }
  let stepsClock = 0;
  const stepPos = i => new THREE.Vector3(stepGlow[i].x, .002, 0).applyMatrix4(root.matrixWorld);

  // Arc from a wrong note to the right one (Coach "show me").
  let arc = null;
  function setArc(s, f1, f2) {
    if (arc) { root.remove(arc); arc.geometry.dispose(); arc = null; }
    if (s == null) return;
    const x1 = noteX(f1), x2 = noteX(f2), z = strZ(s, x1) - .058, y = strH(x1) + .004;
    const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x1, y, z), new THREE.Vector3((x1 + x2) / 2, y + .12, z - .028), new THREE.Vector3(x2, y, z));
    arc = new THREE.Mesh(new THREE.TubeGeometry(c, 24, .0052, 6), new THREE.MeshBasicMaterial({ color: COLORS.aim, toneMapped: false }));
    arc.renderOrder = 3; root.add(arc);
  }

  // Point list to frame a stretch of the neck.
  const tmp = new THREE.Vector3();
  function windowPoints(lo, hi, grow = 0) {
    const a = lo <= 1 ? -.13 : fretX(lo - 1), b = hi >= 24 ? XEND + .02 : fretX(hi), out = [];
    // The low-E side leaves room for the fret numbers.
    [a, b].forEach(x => { const W = boardW(x) / 2 + grow; [-W, W + .15].forEach(z => { tmp.set(x, 0, z); out.push(root.localToWorld(tmp.clone())); }); });
    return out;
  }
  function pointAt(s, f) { const x = noteX(f); return root.localToWorld(new THREE.Vector3(x, strH(x), strZ(s, x))); }

  function update(dt) {
    overlayGroup.position.copy(root.position);
    strings.forEach(st => {
      st.amp *= Math.exp(-dt * 2.6); st.glow *= Math.exp(-dt * 3.1); st.pulseA *= Math.exp(-dt * 3.4);
      st.pulse += dt * 1.25; st.ph += dt * st.hz * 6.283;
      const a = st.amp + st.breath, u = st.u;
      u.uA.value = a; u.uPh.value = st.ph % 62.83; u.uG.value = st.glow; u.uP.value = st.pulse; u.uPA.value = st.pulseA;
      st.rib.visible = st.glow > .012 || st.pulseA > .012;
    });
    lightI *= Math.exp(-dt * 3.4);
    if (sweepT >= 0) {
      sweepT += dt / sweepDur;
      const e = sweepT, x = sweepA + (sweepB - sweepA) * e, env = Math.sin(Math.PI * Math.min(1, e));
      sweepLight.position.set(x, .34, 0); sweepLight.color.set(sweepCol); sweepLight.intensity = sweepPow * env;
      if (sweepT >= 1) { sweepT = -1; sweepLight.intensity = 0; }
    } else if (sweepLight !== noteLight) sweepLight.intensity = 0;
    if (sweepLight !== noteLight || sweepT < 0) noteLight.intensity = lightI * .55;
    flashes.forEach(F => { if (F.v > 0) { F.v = Math.max(0, F.v - dt * 2.1); F.m.material.opacity = F.v; F.m.scale.setScalar(.55 + (.85 - F.v) * .3); if (F.v === 0) F.m.visible = false; } });
    updateNotes(dt);
    if (stepGroup.visible) {
      stepsClock += dt;
      const b = .78 + Math.sin(stepsClock * 2.4) * .22;
      stepGlow.forEach(g => {
        const on = Math.min(1, Math.max(0, (stepsClock - g.delay) / .4));
        if (g.state === 'cur') { g.lit.material.opacity = on * .96; g.h.material.opacity = on * b * .95; }
        else if (g.state === 'done') { g.lit.material.opacity = on * .9; g.h.material.opacity = on * .5; }
        else { g.lit.material.opacity = 0; g.h.material.opacity = 0; }
      });
    }
  }
  return { root, overlayGroup, strings, setNotes, pluck, strum, sweep, setArc, setSteps, stepPos, windowPoints, pointAt, update, globals, setBreath: v => { strings.forEach((st, i) => { st.breath = v * (.5 + .1 * i); }); }, clearNotes: (fade = .2) => setNotes([], { fade }), fakeShadows, setInlayDim: () => { }, setNumberScale: k => numSprites.forEach(sp => sp.scale.setScalar(sp.userData.base * k)) };
}
