/**
 * The neck, as a UI surface (art direction "A, graphic", 2026-11-17): a flat
 * board in the theme's colours, crisp fret bars, strings as solid lines that
 * get heavier toward low E (the wound ones tinted toward the accent), flat
 * inlay dots, bold fret numbers with an accent dot under the marker frets,
 * and one soft shadow under the board on a dark theme. Everything is unlit
 * (`MeshBasicMaterial`, not tone-mapped), so the theme's colours land exactly;
 * there is no texture, no light and no shadow map. A theme change is
 * `setPalette`: colours only, nothing is rebuilt.
 *
 * The geometry (fret spacing, the taper, string heights, where a marker sits)
 * is the realistic neck's, unchanged, so framing and placement are too.
 * `update(dt)` returns true while anything on the neck is still moving, which
 * is what lets the stage render on demand and then stop.
 */
import * as THREE from "three";
import type { NeckKind } from "../api";
import { noteLook, type NeckPalette } from "../neckTheme";
import * as T from "./textures";

export const L = 6.5;
const NW = 1.3;
const RAD = 4.2;
export const fretX = (n: number) => L * (1 - Math.pow(2, -n / 12));
// Markers sit just behind the fret wire, where the finger goes, which leaves the inlay clear.
export const NOTE_R = 0.05;
/**
 * An open string is a small "0" token just left of the nut, the way tab apps
 * draw it (acceptance 2, P1-3): two thirds of a fretted marker, close enough
 * to the nut that it reads as "this string, no fret" rather than as a note
 * drawn on the headstock. Even NOW's larger token clears the nut.
 */
export const OPEN_K = 0.66;
export const noteX = (f: number) => (f <= 0 ? -(NOTE_R * 1.45 * OPEN_K + 0.008) : fretX(f) - NOTE_R - 0.021);
/** Where the board starts: a short stub before the nut, just room for the open strings' tokens. */
export const HEAD = -0.115;
const INLAY_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
const DOUBLE = (f: number) => f === 12 || f === 24;
// The taper, nut to the 24th fret. A real neck goes about 43 mm to 56 mm (0.77);
// mock A is "unrealistically horizontal, more symbolic" (acceptance P1-3), so
// the board and the strings barely widen: 0.525 to 0.555 (0.95), the strings
// 0.4 to 0.44, and they keep a margin to the edges wide enough that NOW's
// larger disc on an outer string stays on the board (0.08 each side).
const span = (x: number) => (0.4 + (0.04 * x) / L) * NW;
export const strZ = (s: number, x: number) => ((s - 3.5) * span(x)) / 5;
export const XEND = fretX(24) + 0.14;
export const boardW = (x: number) => (0.525 + ((0.555 - 0.525) * Math.max(0, x)) / XEND) * NW;
const crown = (z: number) => (-z * z) / (2 * RAD);
const strH = (x: number) => 0.05 + (0.018 * x) / L;
/** Each string's drawn width, high e to low E: the mock's 2.2 to 6.6 px at the practice zoom. */
const STR_W = [0.0042, 0.0054, 0.007, 0.0088, 0.0108, 0.0128];
const WOUND = (s: number) => s >= 4;
/** A fret bar's width (the mock's 3.5 px at the practice zoom), the nut's, and the edge hairline's. */
const FRET_W = 0.0072;
const NUT_W = 0.017;
const EDGE_W = 0.0032;
/** The inlay dots' radius. */
const INLAY_R = 0.026;

/** NOW is drawn larger than the rest, so the eye lands on it first. */
const NOTE_SCALE: Partial<Record<NeckKind, number>> = { now: 1.45, next: 1.15 };

type Arrays = { p: number[]; c: number[]; i: number[] };
const arrays = (): Arrays => ({ p: [], c: [], i: [] });
function toGeo(a: Arrays, colorSize = 0): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(a.p, 3));
  if (colorSize) g.setAttribute("color", new THREE.Float32BufferAttribute(a.c, colorSize));
  if (a.i.length) g.setIndex(a.i);
  return g;
}

/** The board's top: the crowned surface, nut to the end of the board. */
function boardGeometry() {
  const xs = [HEAD, -0.012];
  for (let f = 1; f <= 24; f++) xs.push(fretX(f));
  xs.push(XEND);
  const cols = 10;
  const a = arrays();
  xs.forEach((x) => {
    const W = boardW(x);
    for (let c = 0; c <= cols; c++) {
      const z = (c / cols - 0.5) * W;
      a.p.push(x, crown(z), z);
    }
  });
  for (let r = 0; r < xs.length - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * (cols + 1) + c;
      const j = i + cols + 1;
      a.i.push(i, i + 1, j, j, i + 1, j + 1);
    }
  }
  return toGeo(a);
}

/** A flat bar across the board at `x`, `w` wide, lying on the crown. */
function barAcross(a: Arrays, x: number, w: number, lift: number) {
  const cols = 8;
  const W = boardW(x);
  const base = a.p.length / 3;
  for (let c = 0; c <= cols; c++) {
    const z = (c / cols - 0.5) * W;
    const y = crown(z) + lift;
    a.p.push(x - w / 2, y, z, x + w / 2, y, z);
  }
  for (let c = 0; c < cols; c++) {
    const i = base + c * 2;
    a.i.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);
  }
}

/** All 24 fret bars, merged. */
function fretsGeometry() {
  const a = arrays();
  for (let f = 1; f <= 24; f++) barAcross(a, fretX(f), FRET_W, 0.0016);
  return toGeo(a);
}

/** The board's two long edges, as hairlines just inside them. */
function edgeGeometry() {
  const a = arrays();
  const xs = [HEAD, XEND / 2, XEND];
  [-1, 1].forEach((side) => {
    const base = a.p.length / 3;
    xs.forEach((x) => {
      const z = side * (boardW(x) / 2 - EDGE_W / 2);
      const y = crown(z) + 0.0024;
      a.p.push(x, y, z - EDGE_W / 2, x, y, z + EDGE_W / 2);
    });
    for (let k = 0; k < xs.length - 1; k++) {
      const i = base + k * 2;
      a.i.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);
    }
  });
  return toGeo(a);
}

/**
 * The one soft shadow under the board (dark themes): a quad grid whose
 * vertex alpha falls off smoothly over `blur` past the board's outline,
 * pushed a little toward the low-E side, the way a light from above-front
 * would throw it. Painted, not a shadow map.
 */
function shadowGeometry() {
  const blur = 0.075;
  const drop = 0.028;
  const x0 = HEAD;
  const x1 = XEND;
  const steps = [-1, -0.6, -0.25, 0.25, 0.6, 1];
  const fall = (d: number) => {
    // d: distance inside the outline (negative outside), in units of blur.
    const t = Math.max(0, Math.min(1, (d + 1) / 2));
    return t * t * (3 - 2 * t);
  };
  const xs = [...steps.map((k) => x0 + k * blur), ...steps.map((k) => x1 + k * blur)];
  const a = arrays();
  const zk = [...steps.map((k) => ({ side: -1, k })), ...steps.map((k) => ({ side: 1, k }))];
  xs.forEach((x) => {
    const W = boardW(Math.max(0, Math.min(XEND, x))) / 2;
    const ax = fall(Math.min(x - x0, x1 - x) / blur);
    zk.forEach(({ side, k }) => {
      const z = side * W + k * blur + drop;
      const az = fall(Math.min(z - drop + W, W - (z - drop)) / blur);
      a.p.push(x, -0.03, z);
      a.c.push(0, 0, 0, ax * az);
    });
  });
  const n = zk.length;
  for (let r = 0; r < xs.length - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const i = r * n + c;
      const j = i + n;
      a.i.push(i, i + 1, j, j, i + 1, j + 1);
    }
  }
  return toGeo(a, 4);
}

/** A string: a flat ribbon `w` wide, facing up, nut to the end of the board. */
function stringGeometry(s: number, segs: number, w: number) {
  const a = arrays();
  const aT: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = t * XEND;
    const z = strZ(s, x);
    const y = crown(z) + strH(x);
    a.p.push(x, y, z - w / 2, x, y, z + w / 2);
    aT.push(t, t);
  }
  for (let i = 0; i < segs; i++) {
    const p = i * 2;
    a.i.push(p, p + 1, p + 2, p + 2, p + 1, p + 3);
  }
  const g = toGeo(a);
  g.setAttribute("aT", new THREE.Float32BufferAttribute(aT, 1));
  return g;
}

function ribbonGeometry(s: number, segs: number) {
  const a = arrays();
  const aT: number[] = [];
  const aV: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = t * XEND;
    const z = strZ(s, x);
    const y = crown(z) + strH(x) - 0.006;
    [-1, 1].forEach((v) => {
      a.p.push(x, y, z);
      aT.push(t);
      aV.push(v);
    });
  }
  for (let i = 0; i < segs; i++) {
    const p = i * 2;
    a.i.push(p, p + 2, p + 1, p + 1, p + 2, p + 3);
  }
  const g = toGeo(a);
  g.setAttribute("aT", new THREE.Float32BufferAttribute(aT, 1));
  g.setAttribute("aV", new THREE.Float32BufferAttribute(aV, 1));
  g.computeBoundingSphere();
  g.boundingSphere!.radius = 6;
  return g;
}

type StringUniforms = {
  uF: { value: number };
  uA: { value: number };
  uPh: { value: number };
  uGC: { value: THREE.Color };
  uG: { value: number };
  uP: { value: number };
  uPA: { value: number };
  uW: { value: number };
};

/** A plucked string moves, and takes the note's colour where the pulse runs along it. */
function vibrate(material: THREE.MeshBasicMaterial, u: StringUniforms) {
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\nattribute float aT; uniform float uF,uA,uPh; varying float vS;`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float sp=(aT-uF)/(1.-uF); vS=sp;
        if(sp>0.){ float e=sin(3.14159*sp); transformed.z+=uA*(e*cos(uPh)+.35*sin(6.28318*sp)*cos(uPh*1.7+1.)); transformed.y+=uA*.35*e*sin(uPh*.9); }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform vec3 uGC; uniform float uG,uP,uPA; varying float vS;`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        if(vS>0.){ float dd=vS-uP; float k=uG*(.25+.75*abs(sin(3.14159*vS*2.)))*.7+uPA*exp(-dd*dd*90.); diffuseColor.rgb=mix(diffuseColor.rgb,uGC,clamp(k,0.,1.)); }`,
      );
  };
  material.customProgramCacheKey = () => "yames-string-flat";
}

// The glow beside a ringing string: the note's colour, blended normally so it
// shows on a light board as well as a dark one.
const RIB_VERT = `attribute float aT; attribute float aV; uniform float uF,uA,uW; varying float vS,vV,vE;
void main(){ float sp=(aT-uF)/(1.-uF); vS=sp; vV=aV; float e=sp>0.?sin(3.14159*sp):0.; vE=e;
 vec3 p=position; p.z+=aV*(uW+uA*(.2+1.25*e)); gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`;
const RIB_FRAG = `uniform vec3 uGC; uniform float uG,uP,uPA; varying float vS,vV,vE;
void main(){ if(vS<0.) discard; float a=exp(-vV*vV*3.2)-.04; float dd=vS-uP; float wave=.22+.78*vE;
 float k=uG*wave*.35+uPA*exp(-dd*dd*70.)*.6; gl_FragColor=vec4(uGC,clamp(k*max(a,0.),0.,1.));
 #include <colorspace_fragment>
}`;

type GString = {
  s: number;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  rib: THREE.Mesh;
  u: StringUniforms;
  amp: number;
  glow: number;
  pulse: number;
  pulseA: number;
  hz: number;
  ph: number;
};

type Note = {
  disc: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  halo: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  label: THREE.Sprite;
  o: number;
  to: number;
  fade: number;
  flash: number;
  kind: NeckKind | null;
  text: string;
};

export type GuitarNote = { s: number; f: number; kind: NeckKind; t: string };

const flat = (color: string, extra: THREE.MeshBasicMaterialParameters = {}) =>
  new THREE.MeshBasicMaterial({ color, toneMapped: false, side: THREE.DoubleSide, ...extra });

export function createGuitar({ tier, overlay, palette }: { tier: number; overlay: THREE.Scene; palette: NeckPalette }) {
  const root = new THREE.Group();
  let P = palette;

  // The shadow, under everything.
  const shadowMat = flat("#000000", { vertexColors: true, transparent: true, depthWrite: false, opacity: P.shadowA });
  const shadow = new THREE.Mesh(shadowGeometry(), shadowMat);
  shadow.renderOrder = -10;
  shadow.visible = P.shadowA > 0;
  root.add(shadow);

  // Board, its edges, the frets and the nut.
  const boardMat = flat(P.board, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  root.add(new THREE.Mesh(boardGeometry(), boardMat));
  const edgeMat = flat(P.edge);
  root.add(new THREE.Mesh(edgeGeometry(), edgeMat));
  const fretMat = flat(P.fret);
  root.add(new THREE.Mesh(fretsGeometry(), fretMat));
  const nutMat = flat(P.nut);
  const nutA = arrays();
  barAcross(nutA, -0.012 + NUT_W / 2, NUT_W, 0.0026);
  root.add(new THREE.Mesh(toGeo(nutA), nutMat));

  // Flat inlay dots.
  const inlayMat = flat(P.inlay);
  const inlayGeo = new THREE.CircleGeometry(INLAY_R, 32).rotateX(-Math.PI / 2);
  INLAY_FRETS.forEach((f) => {
    const x = (fretX(f - 1) + fretX(f)) / 2;
    const place = (z: number) => {
      const m = new THREE.Mesh(inlayGeo, inlayMat);
      m.position.set(x, crown(z) + 0.0012, z);
      root.add(m);
    };
    if (DOUBLE(f)) {
      place(-0.112);
      place(0.112);
    } else place(0);
  });

  // Strings: solid ribbons, heavier toward low E, the wound three tinted toward the accent.
  const strings: GString[] = [];
  const segs = tier >= 2 ? 150 : tier === 1 ? 110 : 80;
  for (let s = 1; s <= 6; s++) {
    const u: StringUniforms = {
      uF: { value: 0 },
      uA: { value: 0 },
      uPh: { value: s * 1.7 },
      uGC: { value: new THREE.Color(P.accent) },
      uG: { value: 0 },
      uP: { value: 0 },
      uPA: { value: 0 },
      uW: { value: 0.006 + s * 0.0012 },
    };
    const mat = flat(WOUND(s) ? P.wound : P.string);
    vibrate(mat, u);
    const mesh = new THREE.Mesh(stringGeometry(s, segs, STR_W[s - 1]), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    root.add(mesh);
    const rib = new THREE.Mesh(
      ribbonGeometry(s, segs >> 1),
      new THREE.ShaderMaterial({ uniforms: u, vertexShader: RIB_VERT, fragmentShader: RIB_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    rib.visible = false;
    rib.frustumCulled = false;
    rib.renderOrder = 2;
    root.add(rib);
    strings.push({ s, mesh, rib, u, amp: 0, glow: 0, pulse: 0, pulseA: 0, hz: 22 + (6 - s) * 3.2, ph: 0 });
  }

  // Notes. Markers draw in the overlay scene, above the strings, so a wound string never crosses a letter.
  const discGeo = new THREE.CircleGeometry(NOTE_R, 40).rotateX(-Math.PI / 2);
  const haloGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const haloTex = T.radial([
    [0, "rgba(255,255,255,1)"],
    [0.5, "rgba(255,255,255,.5)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  const pool: Note[] = [];
  const active = new Map<string, Note>();
  const overlayGroup = new THREE.Group();
  overlay.add(overlayGroup);
  function makeNote(): Note {
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false }));
    const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    disc.renderOrder = 2;
    halo.renderOrder = 3;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
    label.scale.setScalar(0.118);
    label.renderOrder = 4;
    root.add(halo);
    overlayGroup.add(disc, label);
    return { disc, halo, label, o: 0, to: 0, fade: 0.25, flash: 0, kind: null, text: "" };
  }
  /** Places shared by a note on the next string up, this setNotes: staggered so neither hides the other. */
  let crowded = new Set<string>();
  function placeNote(n: Note, d: GuitarNote) {
    // Two markers on one fret, neighbouring strings: the lower string's sits a
    // marker's width toward the nut (UX audit SES-7: "2 hides under 1").
    const x = noteX(d.f) - (crowded.has(d.s + ":" + d.f) ? NOTE_R * 1.7 : 0);
    const z = strZ(d.s, x);
    const y = crown(z);
    const top = y + strH(x) + 0.012;
    n.disc.position.set(x, top, z);
    n.halo.position.set(x, y + 0.0028, z);
    n.label.position.set(x, top, z);
  }
  const GLOW_SCALE = 0.36;
  /** Paint a note for its kind and text in the current palette. `force` repaints after a theme change. */
  function styleNote(n: Note, kind: NeckKind, text: string, force = false) {
    if (force || n.kind !== kind) {
      const open = n.disc.position.x < 0;
      n.kind = kind;
      const look = noteLook(kind, P);
      n.disc.material.map = T.noteDisc(look);
      n.disc.material.needsUpdate = true;
      n.halo.material.color.set(look.fill);
      const sc = (NOTE_SCALE[kind] ?? 1) * (open ? OPEN_K : 1);
      n.disc.scale.setScalar(sc);
      n.label.scale.setScalar(0.118 * sc);
      n.text = "\u0000";
    }
    if (n.text !== text) {
      n.text = text;
      n.label.material.map = text ? T.noteLabel(text, noteLook(kind, P).ink) : null;
      n.label.material.needsUpdate = true;
    }
  }
  function setNotes(list: GuitarNote[], fade = 0.25) {
    const keep = new Set<string>();
    const at = new Set(list.map((d) => d.s + ":" + d.f));
    const next = new Set<string>();
    for (const d of list) if (d.f > 0 && at.has(d.s - 1 + ":" + d.f) && (d.s % 2 === 0 || !at.has(d.s - 2 + ":" + d.f))) next.add(d.s + ":" + d.f);
    const moved = [...next].some((k) => !crowded.has(k)) || [...crowded].some((k) => !next.has(k));
    crowded = next;
    list.forEach((d) => {
      const k = d.s + ":" + d.f;
      keep.add(k);
      let n = active.get(k);
      if (!n) {
        n = pool.pop() ?? makeNote();
        n.kind = null;
        active.set(k, n);
        placeNote(n, d);
        n.o = fade ? 0 : 1;
      } else if (moved) placeNote(n, d);
      styleNote(n, d.kind, d.t);
      n.to = 1;
      n.fade = fade;
    });
    active.forEach((n, k) => {
      if (!keep.has(k)) {
        n.to = 0;
        n.fade = fade;
      }
    });
  }
  function updateNotes(dt: number): boolean {
    let busy = false;
    active.forEach((n, k) => {
      const rate = n.fade ? dt / n.fade : 1;
      n.o = n.o < n.to ? Math.min(n.to, n.o + rate) : Math.max(n.to, n.o - rate);
      n.flash = Math.max(0, n.flash - dt * 2.4);
      if (n.o !== n.to || n.flash > 0) busy = true;
      const v = n.o;
      n.disc.material.opacity = v;
      n.label.material.opacity = v;
      n.disc.visible = v > 0.004;
      n.label.visible = v > 0.004 && !!n.text;
      const glow = n.kind === "now";
      n.halo.material.opacity = (glow ? v * P.glowA : 0) + n.flash * 0.6;
      n.halo.visible = n.halo.material.opacity > 0.004;
      n.halo.scale.setScalar(GLOW_SCALE + (n.flash > 0 ? (1 - n.flash) * 0.12 : 0));
      if (n.o <= 0 && n.to === 0) {
        n.disc.visible = n.halo.visible = n.label.visible = false;
        active.delete(k);
        pool.push(n);
      }
    });
    return busy;
  }

  // Fret numbers along the low-E edge, centred on the fret spaces: the marker frets bold in the
  // ink with an accent dot under them, the others quiet.
  const NUM_Z = (x: number) => boardW(x) / 2 + 0.092;
  const numSprites: Array<{ sp: THREE.Sprite; f: number; marked: boolean }> = [];
  const numberMap = (f: number, marked: boolean) =>
    marked ? T.noteLabel(String(f), P.num, 700, P.accent) : T.noteLabel(String(f), P.numFaint, 500);
  for (let f = 1; f <= 24; f++) {
    const x = (fretX(f - 1) + fretX(f)) / 2;
    const marked = INLAY_FRETS.includes(f);
    if (!marked && f > 12) continue; // Up where the frets get tight, only the marked ones.
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: numberMap(f, marked), transparent: true, opacity: marked ? 1 : 0.8, depthTest: false, depthWrite: false, toneMapped: false }),
    );
    sp.position.set(x, 0.001, NUM_Z(x));
    sp.userData.base = marked ? 0.122 : 0.084;
    sp.scale.setScalar(sp.userData.base);
    sp.renderOrder = 1;
    overlayGroup.add(sp);
    numSprites.push({ sp, f, marked });
  }

  // Transient flashes on the board, for notes with no resting disc.
  const flashes = Array.from({ length: 8 }, () => {
    const m = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    m.visible = false;
    m.renderOrder = 1;
    root.add(m);
    return { m, v: 0 };
  });
  let fi = 0;

  const kindColor = (kind: NeckKind) => noteLook(kind, P).fill;

  function pluck(s: number, f: number, kind: NeckKind, { amp = 0.0075, reduce = false } = {}) {
    const st = strings[s - 1];
    if (!st) return;
    const col = kindColor(kind);
    const x = noteX(f);
    st.u.uF.value = f > 0 ? fretX(f) / XEND : 0;
    st.amp = reduce ? 0 : Math.max(st.amp, amp);
    st.glow = Math.min(1.1, st.glow + 1);
    st.pulse = 0;
    st.pulseA = 1;
    st.u.uGC.value.set(col);
    st.rib.visible = true;
    const n = active.get(s + ":" + f);
    if (n) n.flash = 1;
    const F = flashes[fi++ % flashes.length];
    const z = strZ(s, x);
    F.m.position.set(x, crown(z) + 0.003, z);
    F.m.material.color.set(col);
    F.v = 0.6;
    F.m.visible = true;
    F.m.scale.setScalar(0.3);
  }

  // A soft band of the accent that runs along the frets: arrivals and results.
  let sweepT = -1;
  let sweepDur = 1;
  let sweepPow = 1;
  const sweepA = -0.2;
  const sweepB = 5.2;
  const sweepMesh = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ map: haloTex, color: P.accent, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  sweepMesh.scale.set(0.9, 1, 1.1);
  sweepMesh.visible = false;
  sweepMesh.renderOrder = 0;
  root.add(sweepMesh);
  function sweep({ dur = 2.2, power = 2.6 } = {}) {
    sweepT = 0;
    sweepDur = dur;
    sweepPow = power;
  }

  /** Recolour everything for a new theme. Nothing is rebuilt. */
  function setPalette(p: NeckPalette) {
    P = p;
    shadow.visible = P.shadowA > 0;
    shadowMat.opacity = P.shadowA;
    boardMat.color.set(P.board);
    edgeMat.color.set(P.edge);
    fretMat.color.set(P.fret);
    nutMat.color.set(P.nut);
    inlayMat.color.set(P.inlay);
    strings.forEach((st) => st.mesh.material.color.set(WOUND(st.s) ? P.wound : P.string));
    sweepMesh.material.color.set(P.accent);
    numSprites.forEach(({ sp, f, marked }) => {
      sp.material.map = numberMap(f, marked);
      sp.material.needsUpdate = true;
    });
    active.forEach((n) => {
      if (n.kind) styleNote(n, n.kind, n.text, true);
    });
  }

  /** Where a place's marker sits, in world space (for `project`). */
  function notePoint(s: number, f: number): THREE.Vector3 {
    const x = noteX(f);
    const z = strZ(s, x);
    const p = new THREE.Vector3(x, crown(z) + strH(x) + 0.012, z);
    return root.localToWorld(p);
  }

  // Point list to frame a stretch of the neck. The low-E side leaves room for the fret numbers.
  const tmp = new THREE.Vector3();
  function windowPoints(lo: number, hi: number): THREE.Vector3[] {
    const a = lo <= 1 ? HEAD - 0.02 : fretX(lo - 1);
    const b = hi >= 24 ? XEND + 0.02 : fretX(hi);
    const out: THREE.Vector3[] = [];
    [a, b].forEach((x) => {
      const W = boardW(x) / 2;
      [-W - 0.02, W + 0.15].forEach((z) => {
        tmp.set(x, 0, z);
        out.push(root.localToWorld(tmp.clone()));
      });
    });
    return out;
  }

  /** Advance by dt seconds. True while anything is still moving. */
  function update(dt: number): boolean {
    let busy = false;
    overlayGroup.position.copy(root.position);
    strings.forEach((st) => {
      st.amp *= Math.exp(-dt * 2.6);
      st.glow *= Math.exp(-dt * 3.1);
      st.pulseA *= Math.exp(-dt * 3.4);
      if (st.amp < 0.00004) st.amp = 0;
      if (st.glow < 0.012) st.glow = 0;
      if (st.pulseA < 0.012) st.pulseA = 0;
      if (st.amp || st.glow || st.pulseA) busy = true;
      st.pulse += dt * 1.25;
      st.ph += dt * st.hz * 6.283;
      const u = st.u;
      u.uA.value = st.amp;
      u.uPh.value = st.ph % 62.83;
      u.uG.value = st.glow;
      u.uP.value = st.pulse;
      u.uPA.value = st.pulseA;
      st.rib.visible = st.glow > 0 || st.pulseA > 0;
    });
    if (sweepT >= 0) {
      busy = true;
      sweepT += dt / sweepDur;
      const e = sweepT;
      const x = sweepA + (sweepB - sweepA) * e;
      const env = Math.sin(Math.PI * Math.min(1, e));
      sweepMesh.position.set(x, 0.003, 0);
      sweepMesh.material.opacity = Math.min(P.dark ? 0.2 : 0.1, 0.08 * sweepPow * env);
      sweepMesh.visible = true;
      if (sweepT >= 1) {
        sweepT = -1;
        sweepMesh.visible = false;
      }
    }
    flashes.forEach((F) => {
      if (F.v > 0) {
        busy = true;
        F.v = Math.max(0, F.v - dt * 1.8);
        F.m.material.opacity = F.v;
        F.m.scale.setScalar(0.3 + (0.6 - F.v) * 0.25);
        if (F.v === 0) F.m.visible = false;
      }
    });
    if (updateNotes(dt)) busy = true;
    return busy;
  }

  return {
    root,
    overlayGroup,
    setNotes,
    setPalette,
    pluck,
    sweep,
    windowPoints,
    notePoint,
    update,
    setNumberScale: (k: number) => numSprites.forEach(({ sp }) => sp.scale.setScalar(sp.userData.base * k)),
  };
}

export type Guitar = ReturnType<typeof createGuitar>;
