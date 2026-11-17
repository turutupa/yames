/**
 * The 3D stage: one continuous scene (the neck on an abstract backdrop), a
 * camera rig that frames the neck into a DOM slot, quality tiers, the
 * adaptive step-down and context loss.
 *
 * Ported from plans/revamp/concept/mocks-3d-v2/js/world.js, the neck only (no
 * amp, metronome, pedals or chart, no inset views, no post: neck shots go
 * straight to the screen in the mock too). It owns no loop: the stage's
 * scheduler calls `frame(dt)` on demand, and `frame` says whether anything is
 * still moving.
 *
 * This file and everything it imports form the lazy chunk; nothing outside
 * `src/stage3d/` may import it statically.
 */
import * as THREE from "three";
import type { NeckKind, NeckNote } from "../api";
import type { EngineOptions, SlotRect, StageEngine, VisibleView } from "../engineTypes";
import { pickTier, tierSettings, type QualityStep, type Tier } from "../quality";
import { createGuitar, type Guitar } from "./guitar";
import * as T from "./textures";

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const GUITAR_Y = 0.62;
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

type Rig = {
  pos: THREE.Vector3;
  tgt: THREE.Vector3;
  fov: number;
  ox: number;
  oy: number;
  poolX: number;
  poolY: number;
  poolA: number;
  keyPos: THREE.Vector3;
  keyTgt: THREE.Vector3;
  keyI: number;
  keyAngle: number;
  rimI: number;
  envI: number;
};
const SCALARS = ["fov", "ox", "oy", "poolX", "poolY", "poolA", "keyI", "keyAngle", "rimI", "envI"] as const;
const cloneRig = (s: Rig): Rig => ({ ...s, pos: s.pos.clone(), tgt: s.tgt.clone(), keyPos: s.keyPos.clone(), keyTgt: s.keyTgt.clone() });

type Shot = {
  points: () => THREE.Vector3[];
  dir: [number, number, number];
  fov: number;
  numScale: number;
  key: { angle: number; i: number; offset: [number, number, number] };
  rim: number;
  env: number;
  pool: number;
  dur: number;
  lift: number;
};

/** The two shots the stage has, from the mock's `fullNeck` and `neckShot`. */
function shotFor(view: VisibleView, rect: SlotRect, guitar: Guitar): Shot {
  const portrait = rect.height > rect.width * 1.08;
  if (view.kind === "whole") {
    return {
      points: () => guitar.windowPoints(0, 24),
      dir: [0, 1, 0.26],
      fov: 14,
      numScale: portrait ? 2.4 : 1.55,
      key: { angle: 0.62, i: 3.1, offset: [-0.6, 7.4, 2.2] },
      rim: 0.6,
      env: 0.5,
      pool: portrait ? 0.55 : 1.1,
      dur: 1.7,
      lift: 0.4,
    };
  }
  const lo = Math.max(0, Math.min(24, Math.round(Math.min(view.from, view.to))));
  const hi = Math.max(lo + 1, Math.min(24, Math.round(Math.max(view.from, view.to))));
  return {
    points: () => guitar.windowPoints(lo, hi),
    dir: portrait ? [0.95, 1, 0] : [0, 1, 0.34],
    fov: portrait ? 40 : 22,
    numScale: portrait ? 1 : 0.66,
    key: { angle: 0.52, i: 3.0, offset: [-0.9, 7.2, 2.4] },
    rim: 0.6,
    env: 0.46,
    pool: 0.9,
    dur: 1.3,
    lift: 0.3,
  };
}

export async function createEngine(o: EngineOptions): Promise<StageEngine> {
  const { canvas, reduced } = o;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance", stencil: false });
  let gpu = "";
  try {
    const gl = renderer.getContext();
    const e = gl.getExtension("WEBGL_debug_renderer_info");
    gpu = e ? String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)) : "";
  } catch {
    /* no info */
  }
  const tier: Tier = pickTier({
    forced: o.forcedTier,
    userAgent: navigator.userAgent,
    gpu,
    touchPoints: navigator.maxTouchPoints,
    screenMin: Math.min(screen.width, screen.height),
  });
  const settings = tierSettings(tier);
  let dprScale = 1;
  let W = window.innerWidth;
  let H = window.innerHeight;
  const dpr = () => Math.max(1, Math.min(window.devicePixelRatio || 1, settings.maxDpr) * dprScale);
  renderer.setPixelRatio(dpr());
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = settings.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  T.setAniso(Math.min(renderer.capabilities.getMaxAnisotropy(), tier >= 2 ? 16 : 8));

  const scene = new THREE.Scene();
  const overlay = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, W / H, 0.1, 120);

  // Studio lighting for reflections: dark room, long warm softboxes.
  function buildEnv(): THREE.WebGLRenderTarget {
    const s = new THREE.Scene();
    const disposables: Array<{ dispose(): void }> = [];
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
      disposables.push(g, m);
      const x = new THREE.Mesh(g, m);
      s.add(x);
      return x;
    };
    mesh(new THREE.BoxGeometry(40, 20, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.02, 0.014, 0.01), side: THREE.BackSide }));
    const box = (w: number, h: number, x: number, y: number, z: number, col: number, I: number, rx = 0, ry = 0) => {
      const m = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(I), side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
    };
    box(22, 1.6, 0, 9.6, -3, 0xffdcae, 9, Math.PI / 2); // Long overhead softbox.
    box(16, 0.7, 0, 9.4, 7, 0xfff1dd, 14, Math.PI / 2); // Thin front strip: frets and strings glint on this.
    box(1.6, 12, -17, 5, 2, 0xffc48a, 2.6, 0, Math.PI / 2); // Warm side.
    box(1, 10, 17, 4, -5, 0xb9c9e0, 1.6, 0, Math.PI / 2); // A little cool rim for separation.
    box(26, 2, 0, 3, -19, 0xff9a4a, 0.9); // Glow on the far wall.
    box(30, 7, 0, 3, 19, 0xffd2a0, 1.1); // Big, dim front fill.
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(s, 0.025, 0.1, 60);
    pm.dispose();
    disposables.forEach((d) => d.dispose());
    return rt;
  }
  let envRT = buildEnv();
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.62;

  const key = new THREE.SpotLight(0xffe6cc, 2.6, 0, 0.5, 0.95, 0);
  key.castShadow = settings.shadows;
  if (key.castShadow) {
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.00025;
    key.shadow.normalBias = 0.006;
    key.shadow.radius = 3;
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 30;
  }
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xffc99a, 0.9);
  rim.position.set(6, 5, -8);
  scene.add(rim);

  // The fonts the fret numbers and note letters are drawn in. Not worth waiting long for.
  try {
    await Promise.race([
      document.fonts?.load('700 40px "Barlow Condensed"'),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    /* the fallback face is fine */
  }

  // Textures, sized to the tier and computed once. A frame between each keeps the page answering.
  const S = (n: number) => Math.max(128, Math.round(n * settings.textureScale));
  await nextFrame();
  const rosewood = T.wood({ w: S(2048), h: S(512), dark: "#1e0f0a", mid: "#4a2a1b", light: "#74452a", gf: 15, streak: 0.62, pores: S(3200), purple: 0.22, seed: 1, normal: 3 });
  await nextFrame();
  const tex = { rosewood, pearl: T.pearl(tier >= 1 ? 128 : 64), wind: T.windings() };

  // The backdrop: dark warm air, a soft pool of light behind the subject, a few still strings.
  const LINES = tier >= 1 ? 7 : 4;
  const backdropMat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: { uPool: { value: new THREE.Vector2(0.5, 0.5) }, uAmt: { value: 1 }, uAsp: { value: 1 } },
    vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,1.,1.);}",
    fragmentShader: `varying vec2 vUv; uniform float uAmt,uAsp; uniform vec2 uPool;
      float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
      void main(){ vec2 d=(vUv-uPool)*vec2(min(uAsp,1.6),1.); float r=length(d);
        vec3 base=vec3(.0065,.0042,.0030); vec3 warm=vec3(.060,.030,.014);
        vec3 c=base+warm*uAmt*exp(-r*r*3.6);
        float l=0.;
        for(int i=0;i<${LINES};i++){ float fi=float(i); float y=.1+fi*${(0.8 / Math.max(1, LINES - 1)).toFixed(4)};
          float a=sin(vUv.x*(2.2+fi*.5)+fi*1.9)*.022*(.5+.5*sin(fi));
          float dy=abs(vUv.y-y-a*sin(3.14159*vUv.x)); l+=smoothstep(.0016,.0,dy);
        }
        c+=vec3(.05,.031,.018)*l*(.35+.65*exp(-r*r*2.4));
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb+=(h(gl_FragCoord.xy)-.5)/255.;
      }`,
  });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backdropMat);
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -1000;
  scene.add(backdrop);

  const guitar = createGuitar({ tier, tex, overlay });
  guitar.root.position.y = GUITAR_Y;
  scene.add(guitar.root);
  guitar.root.updateMatrixWorld(true);

  // ─── Camera rig ───
  const R: Rig = {
    pos: V(-1, 3, 4),
    tgt: V(2, 0.6, 0),
    fov: 26,
    ox: 0,
    oy: 0,
    poolX: 0.5,
    poolY: 0.5,
    poolA: 1,
    keyPos: V(0, 8, 3),
    keyTgt: V(2, 0.6, 0),
    keyI: 0,
    keyAngle: 0.5,
    rimI: 0.9,
    envI: 0.62,
  };
  let from = cloneRig(R);
  let to = cloneRig(R);
  let flight: { t: number; dur: number; lift: number } | null = null;
  let current: { view: VisibleView; rect: SlotRect } | null = null;
  const solverCam = new THREE.PerspectiveCamera();
  const v3 = V();

  function bbox(cam: THREE.PerspectiveCamera, pts: THREE.Vector3[], w: number, h: number) {
    let x0 = 1e9;
    let y0 = 1e9;
    let x1 = -1e9;
    let y1 = -1e9;
    let bad = false;
    for (const p of pts) {
      v3.copy(p).project(cam);
      if (v3.z > 1) bad = true;
      const x = (v3.x * 0.5 + 0.5) * w;
      const y = (-v3.y * 0.5 + 0.5) * h;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return { x0, y0, x1, y1, bad };
  }

  /** The camera distance at which the points just fill the slot, and the view offset that centres them in it. */
  function solve(shot: Shot, slot: SlotRect) {
    const pts = shot.points();
    const t = pts.reduce((a, p) => a.add(p), V()).multiplyScalar(1 / pts.length);
    const dir = V(...shot.dir).normalize();
    const cam = solverCam;
    cam.fov = shot.fov;
    cam.aspect = W / H;
    cam.near = 0.1;
    cam.far = 200;
    cam.clearViewOffset();
    cam.updateProjectionMatrix();
    let lo = 0.4;
    let hi = 150;
    for (let i = 0; i < 26; i++) {
      const d = (lo + hi) / 2;
      cam.position.copy(t).addScaledVector(dir, d);
      cam.lookAt(t);
      cam.updateMatrixWorld(true);
      const b = bbox(cam, pts, W, H);
      const ok = !b.bad && b.x1 - b.x0 <= slot.width && b.y1 - b.y0 <= slot.height;
      if (ok) hi = d;
      else lo = d;
    }
    cam.position.copy(t).addScaledVector(dir, hi);
    cam.lookAt(t);
    cam.updateMatrixWorld(true);
    const b = bbox(cam, pts, W, H);
    const ox = slot.left + slot.width / 2 - (b.x0 + b.x1) / 2;
    const oy = slot.top + slot.height / 2 - (b.y0 + b.y1) / 2;
    return { pos: cam.position.clone(), tgt: t.clone(), fov: shot.fov, ox, oy };
  }

  function target(shot: Shot, slot: SlotRect): Rig {
    const f = solve(shot, slot);
    const s = cloneRig(R);
    s.poolX = (slot.left + slot.width / 2) / W;
    s.poolY = 1 - (slot.top + slot.height / 2) / H;
    s.poolA = shot.pool;
    s.pos = f.pos;
    s.tgt = f.tgt;
    s.fov = f.fov;
    s.ox = f.ox;
    s.oy = f.oy;
    s.keyTgt = f.tgt.clone();
    s.keyPos = s.keyTgt.clone().add(V(...shot.key.offset));
    s.keyI = shot.key.i;
    s.keyAngle = shot.key.angle;
    s.rimI = shot.rim;
    s.envI = shot.env;
    return s;
  }

  function go(view: VisibleView, rect: SlotRect, instant: boolean) {
    current = { view, rect };
    const shot = shotFor(view, rect, guitar);
    guitar.setNumberScale(shot.numScale);
    to = target(shot, rect);
    from = cloneRig(R);
    if (instant || reduced) {
      Object.assign(R, cloneRig(to));
      flight = null;
      return;
    }
    const dist = from.pos.distanceTo(to.pos);
    if (dist < 1e-4 && Math.abs(from.ox - to.ox) < 0.5 && Math.abs(from.oy - to.oy) < 0.5) {
      Object.assign(R, cloneRig(to));
      flight = null;
      return;
    }
    flight = { t: 0, dur: shot.dur, lift: Math.max(shot.lift, Math.min(3.4, dist * 0.2)) };
  }

  function applyRig() {
    camera.position.copy(R.pos);
    camera.fov = R.fov;
    camera.aspect = W / H;
    camera.lookAt(R.tgt);
    camera.setViewOffset(W, H, -R.ox, -R.oy, W, H);
    camera.updateProjectionMatrix();
    key.position.copy(R.keyPos);
    key.target.position.copy(R.keyTgt);
    key.target.updateMatrixWorld();
    key.intensity = R.keyI;
    key.angle = R.keyAngle;
    rim.intensity = R.rimI;
    scene.environmentIntensity = R.envI;
    const bu = backdropMat.uniforms;
    bu.uPool.value.set(R.poolX, R.poolY);
    bu.uAmt.value = R.poolA;
    bu.uAsp.value = W / H;
  }

  // ─── Context loss ───
  let lost = false;
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    o.onLost();
  };
  const onRestored = () => {
    envRT.dispose();
    envRT = buildEnv();
    scene.environment = envRT.texture;
    lost = false;
    o.onRestored();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  function resize(w: number, h: number) {
    W = Math.max(1, w);
    H = Math.max(1, h);
    renderer.setPixelRatio(dpr());
    renderer.setSize(W, H, false);
    if (current) {
      to = target(shotFor(current.view, current.rect, guitar), current.rect);
      if (!flight) Object.assign(R, cloneRig(to));
    }
  }

  const KINDS: ReadonlySet<string> = new Set(["aim", "tone", "tens", "clash", "box", "dim"]);
  const engine: StageEngine = {
    tier,
    setView: go,
    refit(rect: SlotRect) {
      if (!current) return;
      current = { view: current.view, rect };
      to = target(shotFor(current.view, rect, guitar), rect);
      if (!flight) Object.assign(R, cloneRig(to));
    },
    setNotes(notes: NeckNote[], fade: number) {
      guitar.setNotes(
        notes
          .filter((n) => n.string >= 1 && n.string <= 6 && n.fret >= 0 && n.fret <= 24)
          .map((n) => ({ s: n.string, f: Math.round(n.fret), kind: KINDS.has(n.kind) ? n.kind : "box", t: n.label ?? "" })),
        Math.max(0, fade),
      );
    },
    pluck(s: number, f: number, kind: NeckKind) {
      if (s < 1 || s > 6 || f < 0 || f > 24) return;
      guitar.pluck(s, Math.round(f), kind, { reduce: reduced });
    },
    sweep() {
      if (!reduced) guitar.sweep();
    },
    resize,
    frame(dt: number): boolean {
      if (lost) return false;
      let busy = false;
      if (flight) {
        busy = true;
        flight.t = Math.min(1, flight.t + Math.min(dt, 0.1) / flight.dur);
        const e = ease(flight.t);
        const l = Math.sin(Math.PI * flight.t) * flight.lift;
        R.pos.lerpVectors(from.pos, to.pos, e);
        R.pos.y += l;
        R.tgt.lerpVectors(from.tgt, to.tgt, e);
        R.keyPos.lerpVectors(from.keyPos, to.keyPos, e);
        R.keyTgt.lerpVectors(from.keyTgt, to.keyTgt, e);
        for (const k of SCALARS) R[k] = from[k] + (to[k] - from[k]) * e;
        if (flight.t >= 1) flight = null;
      }
      if (guitar.update(dt)) busy = true;
      applyRig();
      renderer.autoClear = true;
      renderer.render(scene, camera);
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(overlay, camera);
      renderer.autoClear = true;
      return busy;
    },
    lowerQuality(step: QualityStep, scale: number): boolean {
      if (step === "resolution") {
        dprScale = scale;
        resize(W, H);
        return true;
      }
      if (!renderer.shadowMap.enabled) return false;
      renderer.shadowMap.enabled = false;
      key.castShadow = false;
      guitar.addFakeShadows();
      scene.traverse((obj) => {
        const m = (obj as THREE.Mesh).material;
        if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
        else if (m) m.needsUpdate = true;
      });
      return true;
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      const seen = new Set<unknown>();
      const disposeMaterial = (m: THREE.Material) => {
        if (seen.has(m)) return;
        seen.add(m);
        for (const v of Object.values(m)) if (v instanceof THREE.Texture && !seen.has(v)) (seen.add(v), v.dispose());
        m.dispose();
      };
      for (const root of [scene, overlay]) {
        root.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.geometry && !seen.has(mesh.geometry)) {
            seen.add(mesh.geometry);
            mesh.geometry.dispose();
          }
          const m = mesh.material;
          if (Array.isArray(m)) m.forEach(disposeMaterial);
          else if (m) disposeMaterial(m);
        });
      }
      [tex.rosewood.map, tex.rosewood.normalMap, tex.rosewood.roughnessMap, tex.pearl, tex.wind].forEach((t) => t.dispose());
      T.clearCaches();
      envRT.dispose();
      key.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  return engine;
}
