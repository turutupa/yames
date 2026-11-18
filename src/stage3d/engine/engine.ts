/**
 * The 3D stage: one continuous scene (the neck on the theme's own backdrop), a
 * camera rig that frames the neck into a DOM slot, quality tiers, the
 * adaptive step-down and context loss.
 *
 * Art direction "A, graphic" (2026-11-17): everything is unlit and flat, in
 * the theme's colours (`../neckTheme.ts`). No lights, no environment map, no
 * shadow map, no tone mapping, no textures to compute at load. The canvas is
 * transparent: the page behind it (`.neck-stage`, the theme's `--bg-primary`)
 * shows through, and the backdrop shader only adds the soft accent pool.
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
import { framingFor } from "../framing";
import { pickTier, tierSettings, type QualityStep, type Tier } from "../quality";
import { neckPalette, type NeckPalette } from "../neckTheme";
import { NOTE_R, OPEN_K, createGuitar, type Guitar } from "./guitar";
import * as T from "./textures";
import { cloneRig, createRigFlight, type Rig } from "./rig";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const GUITAR_Y = 0.62;


type Shot = {
  points: () => THREE.Vector3[];
  dir: [number, number, number];
  fov: number;
  numScale: number;
  pool: number;
  dur: number;
  lift: number;
};

/** The two shots the stage has, from the mock's `fullNeck` and `neckShot`; the angles live in `framing.ts`. */
function shotFor(view: VisibleView, rect: SlotRect, guitar: Guitar): Shot {
  const f = framingFor(view, rect);
  if (view.kind === "whole") {
    return {
      points: () => guitar.windowPoints(0, 24),
      dir: f.dir,
      fov: f.fov,
      numScale: f.numScale,
      pool: f.pool,
      dur: 1.7,
      lift: 0.4,
    };
  }
  const lo = Math.max(0, Math.min(24, Math.round(Math.min(view.from, view.to))));
  const hi = Math.max(lo + 1, Math.min(24, Math.round(Math.max(view.from, view.to))));
  return {
    points: () => guitar.windowPoints(lo, hi),
    dir: f.dir,
    fov: f.fov,
    numScale: f.numScale,
    pool: f.pool,
    dur: 1.3,
    lift: 0.3,
  };
}

export async function createEngine(o: EngineOptions): Promise<StageEngine> {
  const { canvas, reduced } = o;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance", stencil: false });
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
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  const overlay = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, W / H, 0.1, 120);
  let palette: NeckPalette = neckPalette();

  // The fonts the fret numbers and note letters are drawn in. Not worth waiting long for.
  try {
    await Promise.race([
      Promise.all([document.fonts?.load(`700 40px ${palette.numFont}`), document.fonts?.load(`500 40px ${palette.numFont}`)]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    /* the fallback face is fine */
  }

  // The backdrop: only the soft pool of accent behind the subject, over the
  // transparent canvas (the page's own background is the rest). Premultiplied.
  const backdropMat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    transparent: true,
    premultipliedAlpha: true,
    blending: THREE.NormalBlending,
    uniforms: {
      uPool: { value: new THREE.Vector2(0.5, 0.5) },
      uAmt: { value: 1 },
      uAsp: { value: 1 },
      uCol: { value: new THREE.Color(palette.accent) },
      uA: { value: palette.poolA },
    },
    vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,1.,1.);}",
    fragmentShader: `varying vec2 vUv; uniform float uAmt,uAsp,uA; uniform vec2 uPool; uniform vec3 uCol;
      float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
      void main(){ vec2 d=(vUv-uPool)*vec2(min(uAsp,1.6),1.); float r=length(d);
        // Dithered: a pool this faint bands into rings at 8 bits without it.
        float a=clamp(uA*min(uAmt,1.2)*exp(-r*r*3.6)+(h(gl_FragCoord.xy)-.5)/255.,0.,1.);
        gl_FragColor=vec4(uCol,1.);
        #include <colorspace_fragment>
        gl_FragColor=vec4(gl_FragColor.rgb*a,a);
      }`,
  });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backdropMat);
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -1000;
  scene.add(backdrop);

  const guitar = createGuitar({ tier, overlay, palette });
  guitar.root.position.y = GUITAR_Y;
  scene.add(guitar.root);
  guitar.root.updateMatrixWorld(true);

  // ─── Camera rig ───
  const rig = createRigFlight({
    pos: V(-1, 3, 4),
    tgt: V(2, 0.6, 0),
    fov: 26,
    ox: 0,
    oy: 0,
    poolX: 0.5,
    poolY: 0.5,
    poolA: 1,
  });
  // What the camera draws: the flight's path plus its arc (see ./rig.ts).
  const R = rig.shown;
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
    return s;
  }

  function go(view: VisibleView, rect: SlotRect, instant: boolean) {
    current = { view, rect };
    const shot = shotFor(view, rect, guitar);
    guitar.setNumberScale(shot.numScale);
    rig.fly(target(shot, rect), shot.dur, shot.lift, instant || reduced);
  }

  function applyRig() {
    camera.position.copy(R.pos);
    camera.fov = R.fov;
    camera.aspect = W / H;
    camera.lookAt(R.tgt);
    camera.setViewOffset(W, H, -R.ox, -R.oy, W, H);
    camera.updateProjectionMatrix();
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
      rig.retarget(target(shotFor(current.view, current.rect, guitar), current.rect));
    }
  }

  // Compile the programs off the main thread where the driver can (KHR_parallel_shader_compile), so the
  // first frame does not stall the page. One frame per scene, the overlay included.
  try {
    applyRig();
    await renderer.compileAsync(scene, camera);
    await renderer.compileAsync(overlay, camera);
  } catch {
    /* compiled on first use instead */
  }

  const KINDS: ReadonlySet<string> = new Set(["aim", "tone", "tens", "clash", "box", "dim", "now", "next"]);
  const projCam = new THREE.PerspectiveCamera();
  const pv = V();
  const engine: StageEngine = {
    tier,
    setView: go,
    refit(rect: SlotRect) {
      if (!current) return;
      current = { view: current.view, rect };
      rig.retarget(target(shotFor(current.view, rect, guitar), rect));
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
    project(s: number, f: number) {
      if (s < 1 || s > 6 || f < 0 || f > 24) return null;
      // Through the rig the camera is going to, so an overlay placed now is
      // where the note will be when a flight lands.
      const at0 = rig.to;
      projCam.position.copy(at0.pos);
      projCam.fov = at0.fov;
      projCam.aspect = W / H;
      projCam.near = camera.near;
      projCam.far = camera.far;
      projCam.lookAt(at0.tgt);
      projCam.setViewOffset(W, H, -at0.ox, -at0.oy, W, H);
      projCam.updateProjectionMatrix();
      projCam.updateMatrixWorld(true);
      const at = guitar.notePoint(s, Math.round(f));
      pv.copy(at).project(projCam);
      if (pv.z > 1) return null;
      const x = (pv.x * 0.5 + 0.5) * W;
      const y = (-pv.y * 0.5 + 0.5) * H;
      // The marker's radius on screen: one radius along the string axis, projected.
      pv.copy(at).add(V(0, 0, NOTE_R * (f <= 0 ? OPEN_K : 1))).project(projCam);
      const r = Math.hypot((pv.x * 0.5 + 0.5) * W - x, (-pv.y * 0.5 + 0.5) * H - y);
      return { x, y, r };
    },
    resize,
    setPalette(p: NeckPalette) {
      palette = p;
      backdropMat.uniforms.uCol.value.set(p.accent);
      backdropMat.uniforms.uA.value = p.poolA;
      guitar.setPalette(p);
    },
    frame(dt: number): boolean {
      if (lost) return false;
      let busy = false;
      if (rig.step(dt)) busy = true;
      if (guitar.update(dt)) busy = true;
      applyRig();
      // A clipped view draws inside its slot only (acceptance P1-2). The canvas
      // still clears whole, so nothing is left behind outside it.
      const clip = current && current.view.kind === "zoom" && current.view.clip ? current.rect : null;
      if (clip) {
        renderer.setScissorTest(false);
        renderer.clear();
        renderer.setScissor(clip.left, H - clip.top - clip.height, clip.width, clip.height);
        renderer.setScissorTest(true);
      } else renderer.setScissorTest(false);
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
      // The flat neck has no shadow map to give up: nothing left to lower.
      return false;
    },
    probe(frames: number): number[] {
      const gl = renderer.getContext();
      const px = new Uint8Array(4);
      const out: number[] = [];
      for (let i = 0; i < frames; i++) {
        const t0 = performance.now();
        engine.frame(0);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        out.push(performance.now() - t0);
      }
      return out;
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
      T.clearCaches();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  return engine;
}
