/**
 * The neck: rosewood board, nickel frets, pearl dots, wound strings that
 * really move, quiet fret numbers, and notes that light the wood.
 *
 * Ported from plans/revamp/concept/mocks-3d-v2/js/guitar.js, the parts the
 * stage needs (no Steps, no arc, no second neck). `update(dt)` returns true
 * while anything on the neck is still moving, which is what lets the stage
 * render on demand and then stop.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { NeckKind } from "../api";
import * as T from "./textures";

export const L = 6.5;
const NW = 1.3;
const RAD = 4.2;
export const fretX = (n: number) => L * (1 - Math.pow(2, -n / 12));
// Markers sit just behind the fret wire, where the finger goes, which leaves the inlay clear.
export const NOTE_R = 0.05;
export const noteX = (f: number) => (f <= 0 ? -0.07 : fretX(f) - NOTE_R - 0.021);
const INLAY_FRETS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];
const DOUBLE = (f: number) => f === 12 || f === 24;
// The taper, nut to the 24th fret. A real neck goes about 43 mm to 56 mm (0.77),
// but seen whole on a wide, short stage that reads as a wedge with the nut end
// pinched. The board runs 0.46 to 0.545 (0.84; about 0.87 on screen, nut piece to
// end bar) and the strings keep the same margin to its edges all the way up.
const span = (x: number) => (0.375 + (0.11 * x) / L) * NW;
export const strZ = (s: number, x: number) => ((s - 3.5) * span(x)) / 5;
export const XEND = fretX(24) + 0.14;
export const boardW = (x: number) => (0.46 + ((0.545 - 0.46) * Math.max(0, x)) / XEND) * NW;
const crown = (z: number) => (-z * z) / (2 * RAD);
const strH = (x: number) => 0.05 + (0.018 * x) / L;
const GAUGE = [0.0034, 0.0043, 0.0056, 0.0074, 0.0092, 0.0112];

export const COLORS: Record<NeckKind, number> = {
  aim: 0xffb454,
  tone: 0x4ee08a,
  tens: 0x5aa9ff,
  clash: 0xff5d6c,
  box: 0xffe2bd,
  dim: 0x7d6a55,
  now: 0xffb454,
  next: 0xffb454,
};
const LETTER: Record<NeckKind, string> = {
  aim: "#201507",
  tone: "#07190f",
  tens: "#06162a",
  clash: "#2a0509",
  box: "#e6dac8",
  dim: "#8a7a68",
  now: "#201507",
  next: "#ffc978",
};
/** NOW is drawn larger than the rest, so the eye lands on it first. */
const NOTE_SCALE: Partial<Record<NeckKind, number>> = { now: 1.45, next: 1.15 };

type Arrays = { p: number[]; n: number[]; uv: number[]; c: number[]; i: number[] };
const arrays = (): Arrays => ({ p: [], n: [], uv: [], c: [], i: [] });
function toGeo(a: Arrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(a.p, 3));
  if (a.uv.length) g.setAttribute("uv", new THREE.Float32BufferAttribute(a.uv, 2));
  if (a.c.length) g.setAttribute("color", new THREE.Float32BufferAttribute(a.c, 3));
  if (a.i.length) g.setIndex(a.i);
  if (a.n.length) g.setAttribute("normal", new THREE.Float32BufferAttribute(a.n, 3));
  else g.computeVertexNormals();
  return g;
}

function boardGeometry(tile: number) {
  const xs = [-0.012];
  for (let f = 1; f <= 24; f++) {
    const x = fretX(f);
    xs.push(x - 0.03, x - 0.012, x + 0.012, x + 0.03);
  }
  xs.push(XEND);
  const cols = 14;
  const a = arrays();
  xs.forEach((x) => {
    const W = boardW(x);
    let ao = 1;
    for (let f = 1; f <= 24; f++) {
      const d = Math.abs(x - fretX(f));
      if (d < 0.013) ao = 0.34;
      else if (d < 0.031) ao = Math.min(ao, 0.78);
    }
    for (let c = 0; c <= cols; c++) {
      const k = c / cols;
      const z = (k - 0.5) * W;
      a.p.push(x, crown(z), z);
      a.uv.push(x / tile, k * 0.96 + 0.02);
      const edge = 0.72 + 0.28 * Math.min(1, Math.min(k, 1 - k) * 8);
      const v = ao * edge;
      a.c.push(v, v, v);
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

function bindingGeometry() {
  const a = arrays();
  [-1, 1].forEach((side) => {
    const base = a.p.length / 3;
    const w = 0.004;
    [-0.012, XEND].forEach((x) => {
      const W = boardW(x) / 2;
      const z = side * W;
      const y = crown(z);
      a.p.push(x, y + 0.0015, z - side * 0.004, x, y, z + side * w, x, y - 0.068, z + side * w);
    });
    const tri = side > 0 ? [0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5] : [0, 1, 3, 1, 4, 3, 1, 2, 4, 2, 5, 4];
    tri.forEach((t) => a.i.push(base + t));
  });
  const e = boardW(XEND) / 2;
  a.p.push(XEND, 0, e, XEND, 0, -e, XEND, -0.07, -e, XEND, -0.07, e);
  const b = a.p.length / 3 - 4;
  a.i.push(b, b + 2, b + 1, b, b + 3, b + 2);
  return toGeo(a);
}

function neckBackGeometry() {
  const a = arrays();
  const seg = 12;
  [-0.03, 2, XEND].forEach((x) => {
    const W = boardW(x) / 2 + 0.012;
    const d = 0.27 + (0.05 * x) / L;
    for (let i = 0; i <= seg; i++) {
      const t = (Math.PI * i) / seg;
      a.p.push(x, -0.065 - Math.sin(t) * d, Math.cos(t) * W);
      a.uv.push(x * 0.7, i / seg);
    }
  });
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < seg; i++) {
      const p = r * (seg + 1) + i;
      const q = p + seg + 1;
      a.i.push(p, q, p + 1, p + 1, q, q + 1);
    }
  }
  return toGeo(a);
}

function fretsGeometry(colsIn: number, rad: number) {
  const a = arrays();
  const hw = 0.0145;
  const h = 0.0165;
  const edge = [0, 0.004, 0.009, 0.015, 0.022];
  const ks = [...edge];
  for (let i = 1; i < colsIn - 9; i++) ks.push(0.022 + (0.956 * i) / (colsIn - 9));
  ks.push(...edge.slice().reverse().map((e) => 1 - e));
  const cols = ks.length - 1;
  for (let f = 1; f <= 24; f++) {
    const x = fretX(f);
    const W = boardW(x) + 0.004;
    const base = a.p.length / 3;
    for (let c = 0; c <= cols; c++) {
      const k = ks[c];
      const z = (k - 0.5) * W;
      const e = Math.min(1, (Math.min(k, 1 - k) * W) / 0.016);
      const sc = Math.sqrt(Math.max(0.015, 1 - (1 - e) * (1 - e)));
      for (let r = 0; r <= rad; r++) {
        const t = (Math.PI * r) / rad;
        a.p.push(x + Math.cos(t) * hw * sc, crown(z) - 0.001 + Math.sin(t) * h * sc, z);
      }
    }
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rad; r++) {
        const i = base + c * (rad + 1) + r;
        const j = i + rad + 1;
        a.i.push(i, i + 1, j, j, i + 1, j + 1);
      }
    }
  }
  return toGeo(a);
}

function stringGeometry(s: number, segs: number, rad: number, wound: boolean) {
  const a = arrays();
  const aT: number[] = [];
  const r0 = GAUGE[s - 1];
  const pitch = wound ? 0.0062 : 1;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = t * XEND;
    const z = strZ(s, x);
    const y = crown(z) + strH(x);
    for (let j = 0; j <= rad; j++) {
      const th = (j / rad) * Math.PI * 2;
      a.p.push(x, y + Math.sin(th) * r0, z + Math.cos(th) * r0);
      a.n.push(0, Math.sin(th), Math.cos(th));
      a.uv.push(x / pitch + (j / rad) * 0.9, j / rad);
      aT.push(t);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < rad; j++) {
      const p = i * (rad + 1) + j;
      const q = p + rad + 1;
      a.i.push(p, q, p + 1, p + 1, q, q + 1);
    }
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
      a.n.push(0, 1, 0);
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

function vibrate(material: THREE.MeshStandardMaterial, u: StringUniforms) {
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\nattribute float aT; uniform float uF,uA,uPh; varying float vS; varying float vT;`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float sp=(aT-uF)/(1.-uF); vT=aT; vS=sp;
        if(sp>0.){ float e=sin(3.14159*sp); transformed.z+=uA*(e*cos(uPh)+.35*sin(6.28318*sp)*cos(uPh*1.7+1.)); transformed.y+=uA*.35*e*sin(uPh*.9); }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform vec3 uGC; uniform float uG,uP,uPA; varying float vS; varying float vT;`)
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        if(vS>0.){ float dd=vS-uP; totalEmissiveRadiance+=uGC*(uG*(.25+.75*abs(sin(3.14159*vS*2.)))+uPA*exp(-dd*dd*90.)*2.4); }`,
      );
  };
  material.customProgramCacheKey = () => "yames-string";
}

const RIB_VERT = `attribute float aT; attribute float aV; uniform float uF,uA,uW; varying float vS,vV,vE;
void main(){ float sp=(aT-uF)/(1.-uF); vS=sp; vV=aV; float e=sp>0.?sin(3.14159*sp):0.; vE=e;
 vec3 p=position; p.z+=aV*(uW+uA*(.2+1.25*e)); gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`;
const RIB_FRAG = `uniform vec3 uGC; uniform float uG,uP,uPA; varying float vS,vV,vE;
void main(){ if(vS<0.) discard; float a=exp(-vV*vV*3.2)-.04; float dd=vS-uP; float wave=.22+.78*vE;
 float k=uG*wave*.55+uPA*exp(-dd*dd*70.)*.9; gl_FragColor=vec4(uGC*k*max(a,0.),1.);
 #include <colorspace_fragment>
}`;

type GString = {
  s: number;
  mesh: THREE.Mesh;
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

export type WoodTextures = { rosewood: T.WoodSet; pearl: THREE.Texture; wind: THREE.Texture };

export function createGuitar({ tier, tex, overlay }: { tier: number; tex: WoodTextures; overlay: THREE.Scene }) {
  const root = new THREE.Group();
  const tile = 1.9;

  // Board.
  const boardMat = new THREE.MeshPhysicalMaterial({
    ...tex.rosewood,
    color: 0xffffff,
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    normalScale: new THREE.Vector2(0.6, 0.6),
    envMapIntensity: 0.75,
    clearcoat: 0.12,
    clearcoatRoughness: 0.42,
  });
  const board = new THREE.Mesh(boardGeometry(tile), boardMat);
  board.receiveShadow = true;
  root.add(board);
  const edgeMat = new THREE.MeshPhysicalMaterial({ color: 0x3b2115, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3, side: THREE.DoubleSide });
  const binding = new THREE.Mesh(bindingGeometry(), edgeMat);
  binding.castShadow = true;
  root.add(binding);
  const backMat = new THREE.MeshPhysicalMaterial({ color: 0x5e3a20, roughness: 0.46, clearcoat: 0.55, clearcoatRoughness: 0.3 });
  const back = new THREE.Mesh(neckBackGeometry(), backMat);
  back.castShadow = true;
  root.add(back);

  // Nickel frets.
  const fretMat = new THREE.MeshStandardMaterial({ color: 0xeeeae2, metalness: 1, roughness: 0.22, envMapIntensity: 1.45 });
  const frets = new THREE.Mesh(fretsGeometry(tier >= 1 ? 22 : 12, tier >= 1 ? 7 : 5), fretMat);
  frets.castShadow = true;
  frets.receiveShadow = true;
  root.add(frets);

  // Bone nut.
  const nut = new THREE.Mesh(
    new RoundedBoxGeometry(0.05, 0.092, boardW(0) + 0.022, 2, 0.012),
    new THREE.MeshPhysicalMaterial({ color: 0xf2e9d4, roughness: 0.38, clearcoat: 0.4, emissive: 0xf2e9d4, emissiveIntensity: 0.12 }),
  );
  nut.position.set(-0.024, 0.01, 0);
  nut.castShadow = true;
  root.add(nut);

  // The strings stop on a clean nickel bar at the end of the neck.
  const endBar = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.082, boardW(XEND) + 0.02, 2, 0.014), fretMat);
  endBar.position.set(XEND - 0.012, 0.012, 0);
  endBar.castShadow = true;
  root.add(endBar);

  // Pearl inlays, and the side dots a player actually looks at.
  const pearlMat =
    tier >= 1
      ? new THREE.MeshPhysicalMaterial({
          map: tex.pearl,
          color: 0xd9d2c4,
          roughness: 0.3,
          clearcoat: 1,
          clearcoatRoughness: 0.1,
          iridescence: 0.8,
          iridescenceIOR: 1.5,
          iridescenceThicknessRange: [180, 520],
          envMapIntensity: 1.5,
          emissive: 0xe8e0d0,
          emissiveIntensity: 0.1,
          emissiveMap: tex.pearl,
        })
      : new THREE.MeshStandardMaterial({
          map: tex.pearl,
          color: 0xd9d2c4,
          roughness: 0.32,
          envMapIntensity: 1.4,
          emissive: 0xe8e0d0,
          emissiveIntensity: 0.18,
          emissiveMap: tex.pearl,
        });
  const inlayGeo = new THREE.CircleGeometry(0.042, 32).rotateX(-Math.PI / 2);
  const sideGeo = new THREE.CircleGeometry(0.017, 16);
  INLAY_FRETS.forEach((f) => {
    const x = (fretX(f - 1) + fretX(f)) / 2;
    const place = (z: number) => {
      const m = new THREE.Mesh(inlayGeo, pearlMat);
      m.position.set(x, crown(z) + 0.0012, z);
      m.receiveShadow = true;
      root.add(m);
    };
    if (DOUBLE(f)) {
      place(-0.112);
      place(0.112);
    } else place(0);
    const hw = boardW(x) / 2 + 0.0048;
    (DOUBLE(f) ? [-0.024, 0.024] : [0]).forEach((dx) =>
      [1, -1].forEach((side) => {
        const d = new THREE.Mesh(sideGeo, pearlMat);
        d.position.set(x + dx, crown(hw) - 0.03, side * hw);
        if (side < 0) d.rotation.y = Math.PI;
        root.add(d);
      }),
    );
  });

  // Strings.
  const strings: GString[] = [];
  const segs = tier >= 2 ? 150 : tier === 1 ? 110 : 80;
  const radial = tier >= 2 ? 9 : 6;
  for (let s = 1; s <= 6; s++) {
    const w = s >= 4;
    const u: StringUniforms = {
      uF: { value: 0 },
      uA: { value: 0 },
      uPh: { value: s * 1.7 },
      uGC: { value: new THREE.Color(COLORS.aim) },
      uG: { value: 0 },
      uP: { value: 0 },
      uPA: { value: 0 },
      uW: { value: 0.006 + s * 0.0012 },
    };
    const mat = new THREE.MeshStandardMaterial({
      color: w ? 0xcdbb98 : 0xefeae0,
      metalness: 1,
      roughness: w ? 0.32 : 0.18,
      envMapIntensity: 1.5,
      normalMap: w ? tex.wind : null,
      normalScale: new THREE.Vector2(0.55, 0.55),
    });
    vibrate(mat, u);
    const mesh = new THREE.Mesh(stringGeometry(s, segs, radial, w), mat);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    root.add(mesh);
    const rib = new THREE.Mesh(
      ribbonGeometry(s, segs >> 1),
      new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: RIB_VERT,
        fragmentShader: RIB_FRAG,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    rib.visible = false;
    rib.frustumCulled = false;
    root.add(rib);
    strings.push({ s, mesh, rib, u, amp: 0, glow: 0, pulse: 0, pulseA: 0, hz: 22 + (6 - s) * 3.2, ph: 0 });
  }

  // Painted string shadows for tiers with no shadow map.
  let fakeShadows: THREE.Mesh | null = null;
  const addFakeShadows = () => {
    if (fakeShadows) {
      fakeShadows.visible = true;
      return;
    }
    const a = arrays();
    for (let s = 1; s <= 6; s++) {
      const b = a.p.length / 3;
      const wd = 0.012 + GAUGE[s - 1];
      [0, XEND].forEach((x) => {
        const z = strZ(s, x) + 0.012;
        const y = crown(z) + 0.0022;
        a.p.push(x, y, z - wd, x, y, z + wd);
        a.uv.push(0, 0, 0, 1);
        a.n.push(0, 1, 0, 0, 1, 0);
      });
      a.i.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    fakeShadows = new THREE.Mesh(
      toGeo(a),
      new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: T.softStrip(), transparent: true, opacity: 0.62, depthWrite: false, toneMapped: false }),
    );
    root.add(fakeShadows);
  };
  if (tier < 2) addFakeShadows();

  // Notes. Markers draw in the overlay scene, above the strings, so a wound string never crosses a letter.
  const discGeo = new THREE.CircleGeometry(NOTE_R, 40).rotateX(-Math.PI / 2);
  const haloGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const haloTex = T.radial([
    [0, "rgba(255,255,255,1)"],
    [0.22, "rgba(255,255,255,.42)"],
    [0.55, "rgba(255,255,255,.09)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  const pool: Note[] = [];
  const active = new Map<string, Note>();
  const overlayGroup = new THREE.Group();
  overlay.add(overlayGroup);
  function makeNote(): Note {
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false }));
    const halo = new THREE.Mesh(
      haloGeo,
      new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    disc.renderOrder = 2;
    halo.renderOrder = 1;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
    label.scale.setScalar(0.118);
    label.renderOrder = 4;
    root.add(halo);
    overlayGroup.add(disc, label);
    return { disc, halo, label, o: 0, to: 0, fade: 0.25, flash: 0, kind: null, text: "" };
  }
  function placeNote(n: Note, d: GuitarNote) {
    const x = noteX(d.f);
    const z = strZ(d.s, x);
    const y = crown(z);
    const top = y + strH(x) + 0.012;
    n.disc.position.set(x, top, z);
    n.halo.position.set(x, y + 0.0028, z);
    n.label.position.set(x, top, z);
  }
  function styleNote(n: Note, d: GuitarNote) {
    if (n.kind !== d.kind) {
      n.kind = d.kind;
      n.disc.material.map = T.noteDisc(d.kind);
      n.disc.material.needsUpdate = true;
      n.halo.material.color.set(COLORS[d.kind] ?? COLORS.box);
      const hs = d.kind === "box" || d.kind === "dim" || d.kind === "next" ? 0.001 : d.kind === "now" ? 0.5 : 0.36;
      n.halo.scale.setScalar(hs);
      const sc = NOTE_SCALE[d.kind] ?? 1;
      n.disc.scale.setScalar(sc);
      n.label.scale.setScalar(0.118 * sc);
      n.text = "\u0000";
    }
    if (n.text !== d.t) {
      n.text = d.t;
      n.label.material.map = d.t ? T.noteLabel(d.t, LETTER[d.kind] ?? LETTER.box) : null;
      n.label.material.needsUpdate = true;
    }
  }
  function setNotes(list: GuitarNote[], fade = 0.25) {
    const keep = new Set<string>();
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
      }
      styleNote(n, d);
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
      const isDim = n.kind === "box" || n.kind === "dim" || n.kind === "next";
      const rest = n.kind === "now" ? 0.5 : 0.36;
      n.halo.material.opacity = (isDim ? 0 : v * (n.kind === "now" ? 0.5 : 0.32)) + n.flash * 0.7;
      n.halo.visible = n.halo.material.opacity > 0.004;
      if (n.flash > 0) n.halo.scale.setScalar(rest + (1 - n.flash) * 0.2);
      else if (!isDim) n.halo.scale.setScalar(rest);
      if (n.o <= 0 && n.to === 0) {
        n.disc.visible = n.halo.visible = n.label.visible = false;
        active.delete(k);
        pool.push(n);
      }
    });
    return busy;
  }

  // Quiet fret numbers along the low-E edge, centred on the real fret spaces.
  const NUM_Z = (x: number) => boardW(x) / 2 + 0.092;
  const numSprites: THREE.Sprite[] = [];
  for (let f = 1; f <= 24; f++) {
    const x = (fretX(f - 1) + fretX(f)) / 2;
    const marked = INLAY_FRETS.includes(f);
    if (!marked && f > 12) continue; // Up where the frets get tight, only the marked ones.
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: T.noteLabel(String(f), "#efe0c6"), transparent: true, opacity: marked ? 0.86 : 0.46, depthTest: false, depthWrite: false, toneMapped: false }),
    );
    sp.position.set(x, 0.001, NUM_Z(x));
    sp.userData.base = marked ? 0.104 : 0.086;
    sp.scale.setScalar(sp.userData.base);
    sp.renderOrder = 1;
    overlayGroup.add(sp);
    numSprites.push(sp);
  }

  // The note's light: a real point light, so frets near a note catch its colour.
  const noteLight = new THREE.PointLight(0xffffff, 0, 1.1, 1.8);
  noteLight.position.set(0, 0.18, 0);
  root.add(noteLight);
  let lightI = 0;

  // Transient flashes on the wood, for notes with no resting disc.
  const flashes = Array.from({ length: 8 }, () => {
    const m = new THREE.Mesh(
      haloGeo,
      new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    m.visible = false;
    m.renderOrder = 1;
    root.add(m);
    return { m, v: 0 };
  });
  let fi = 0;

  function pluck(s: number, f: number, kind: NeckKind, { amp = 0.0075, reduce = false } = {}) {
    const st = strings[s - 1];
    if (!st) return;
    const col = COLORS[kind] ?? COLORS.aim;
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
    F.v = 0.85;
    F.m.visible = true;
    F.m.scale.setScalar(0.55);
    noteLight.color.set(col);
    noteLight.position.set(x, 0.2, strZ(s, x));
    lightI = 1;
  }

  // A sweep of warm light that runs along the frets: arrivals and results.
  let sweepT = -1;
  let sweepDur = 1;
  let sweepPow = 1;
  const sweepA = -0.2;
  const sweepB = 5.2;
  const sweepLight = new THREE.PointLight(0xffd9a8, 0, 3.2, 1.5);
  root.add(sweepLight);
  function sweep({ dur = 2.2, power = 2.6 } = {}) {
    sweepT = 0;
    sweepDur = dur;
    sweepPow = power;
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
    const a = lo <= 1 ? -0.13 : fretX(lo - 1);
    const b = hi >= 24 ? XEND + 0.02 : fretX(hi);
    const out: THREE.Vector3[] = [];
    [a, b].forEach((x) => {
      const W = boardW(x) / 2;
      [-W, W + 0.15].forEach((z) => {
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
    lightI *= Math.exp(-dt * 3.4);
    if (lightI < 0.01) lightI = 0;
    else busy = true;
    if (sweepT >= 0) {
      busy = true;
      sweepT += dt / sweepDur;
      const e = sweepT;
      const x = sweepA + (sweepB - sweepA) * e;
      const env = Math.sin(Math.PI * Math.min(1, e));
      sweepLight.position.set(x, 0.34, 0);
      sweepLight.intensity = sweepPow * env;
      if (sweepT >= 1) {
        sweepT = -1;
        sweepLight.intensity = 0;
      }
    }
    noteLight.intensity = lightI * 0.55;
    flashes.forEach((F) => {
      if (F.v > 0) {
        busy = true;
        F.v = Math.max(0, F.v - dt * 2.1);
        F.m.material.opacity = F.v;
        F.m.scale.setScalar(0.55 + (0.85 - F.v) * 0.3);
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
    pluck,
    sweep,
    windowPoints,
    notePoint,
    update,
    addFakeShadows,
    setNumberScale: (k: number) => numSprites.forEach((sp) => sp.scale.setScalar(sp.userData.base * k)),
  };
}

export type Guitar = ReturnType<typeof createGuitar>;
