// One continuous world: a luthier's bench in a warm, dark studio. Screens move the camera; they never cut.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as T from './tex.js';
import { createGuitar } from './guitar.js';
import { createAmp, createMetronome, createPedals, createChart } from './objects.js';

const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const AMP_POS = V(2.6, 0, -4.7), METRO_POS = V(12.2, 0, -4.2), PEDAL_POS = V(3, 0, 6.6), CHART_POS = V(-16, 0, -3), NECK2_POS = V(0, .62, 15), GUITAR_Y = .62;

class DofPass extends Pass {
  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uFocus: { value: 6 }, uRange: { value: 1 }, uFall: { value: 4 }, uMax: { value: 10 }, uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: .1 }, uFar: { value: 120 } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: `#include <packing>
        varying vec2 vUv; uniform sampler2D tDiffuse,tDepth; uniform float uFocus,uRange,uFall,uMax,uNear,uFar; uniform vec2 uRes;
        float cocAt(vec2 uv){ float d=texture2D(tDepth,uv).x; float z=-perspectiveDepthToViewZ(d,uNear,uFar); return clamp((abs(z-uFocus)-uRange)/uFall,0.,1.)*uMax; }
        void main(){ vec4 base=texture2D(tDiffuse,vUv); float c=cocAt(vUv); if(uMax<.1){gl_FragColor=base;return;}
          vec3 s=base.rgb; float w=1.; const int N=24; float ga=2.39996;
          float r0=max(c,uMax*.35);
          for(int i=1;i<N;i++){ float fi=float(i); float r=sqrt(fi/float(N))*r0; vec2 o=vec2(cos(fi*ga),sin(fi*ga))*r/uRes; vec2 uv=vUv+o; float sc=cocAt(uv);
            float wt=sc>=r*.85?1.:(c>=r*.85?.65:0.); if(wt>0.){ vec3 col=texture2D(tDiffuse,uv).rgb; col=min(col,vec3(6.)); s+=col*wt; w+=wt; } }
          gl_FragColor=vec4(s/w,base.a); }`,
      depthTest: false, depthWrite: false,
    });
    this.fsq = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms; u.tDiffuse.value = readBuffer.texture; u.tDepth.value = readBuffer.depthTexture;
    u.uRes.value.set(readBuffer.width, readBuffer.height);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.fsq.render(renderer);
  }
}

function pickTier(forced, renderer) {
  if (forced != null) return forced;
  const ua = navigator.userAgent, phone = /Mobi|Android|iPhone|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);
  let gpu = '';
  try { const gl = renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); gpu = e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : ''; } catch { /* no info */ }
  if (/SwiftShader|llvmpipe|Software/i.test(gpu)) return 0;
  if (phone) return /Adreno \(TM\) [3-5]\d\d|Mali-[GT][0-6]\d(?!\d)|PowerVR/i.test(gpu) ? 0 : 1;
  return /Intel.*(HD|UHD)/i.test(gpu) ? 1 : 2;
}

export function createWorld({ canvas, forcedTier = null, reduced = false, snap = false, maxFps = 240, onLost = () => { }, onRestored = () => { } }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false });
  let tier = pickTier(forcedTier, renderer);
  let maxDpr = tier >= 2 ? 2 : tier === 1 ? 2 : 1.6, dprScale = 1, W = innerWidth, H = innerHeight;
  const dpr = () => Math.max(1, Math.min(devicePixelRatio || 1, maxDpr) * dprScale);
  renderer.setPixelRatio(dpr()); renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = tier >= 2; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  T.setAniso(Math.min(renderer.capabilities.getMaxAnisotropy(), tier >= 2 ? 16 : 8));

  const scene = new THREE.Scene(), overlay = new THREE.Scene();
  const bg = new THREE.Color(0x0a0705);
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(26, W / H, .1, 120);

  // Studio lighting for reflections: dark room, long warm softboxes.
  function buildEnv() {
    const s = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(40, 20, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(.02, .014, .01), side: THREE.BackSide })); s.add(room);
    const box = (w, h, x, y, z, col, I, rx = 0, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(I), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m); };
    box(22, 1.6, 0, 9.6, -3, 0xffdcae, 9, Math.PI / 2);       // Long overhead softbox.
    box(16, .7, 0, 9.4, 7, 0xfff1dd, 14, Math.PI / 2);        // Thin front strip: frets and strings glint on this.
    box(1.6, 12, -17, 5, 2, 0xffc48a, 2.6, 0, Math.PI / 2);        // Warm side.
    box(1, 10, 17, 4, -5, 0xb9c9e0, 1.6, 0, Math.PI / 2);    // A little cool rim for separation.
    box(26, 2, 0, 3, -19, 0xff9a4a, .9);                       // Glow on the far wall.
    box(30, 7, 0, 3, 19, 0xffd2a0, 1.1);                        // Big, dim front fill: gives vertical faces something to reflect.
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(s, .025, .1, 60);
    pm.dispose();
    return rt;
  }
  let envRT = buildEnv();
  scene.environment = envRT.texture; scene.environmentIntensity = .62;

  const key = new THREE.SpotLight(0xffe6cc, 2.6, 0, .5, .95, 0);
  key.castShadow = tier >= 2;
  if (key.castShadow) { key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.00025; key.shadow.normalBias = .006; key.shadow.radius = 3; key.shadow.camera.near = 2; key.shadow.camera.far = 30; }
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xffc99a, .9); rim.position.set(6, 5, -8); scene.add(rim);

  // Textures. Sized to the tier, generated once.
  const sz = tier >= 2 ? 1 : tier === 1 ? .75 : .5, S = n => Math.max(128, Math.round(n * sz));
  const tex = {
    rosewood: T.wood({ w: S(2048), h: S(512), dark: '#1e0f0a', mid: '#4a2a1b', light: '#74452a', gf: 15, streak: .62, pores: S(3200), purple: .22, seed: 1, normal: 3 }),
    walnut: T.wood({ w: S(1536), h: S(512), dark: '#1f120b', mid: '#3e2415', light: '#60391f', gf: 8, streak: .5, pores: S(1800), seed: 3, normal: 1.6, rough: [.32, .6] }),
    walnutRed: T.wood({ w: S(1024), h: S(512), dark: '#2a0f08', mid: '#5a2212', light: '#8a3a1c', gf: 6, streak: .44, pores: S(800), seed: 7, normal: .9, rough: [.2, .36] }),
    brushedDark: T.brushed({ w: S(512), h: S(512), base: '#4b433a', spread: 26, rough: [.36, .56] }),
    brushedLight: T.brushed({ w: S(512), h: S(512), base: '#a59b89', spread: 30, rough: [.26, .5] }),
    pearl: T.pearl(tier >= 1 ? 128 : 64),
    wind: T.windings(),
  };
  tex.wind.repeat.set(1, 1);

  // The backdrop: no room, no desk. Dark warm air, a soft pool of light behind the subject, a few strings barely moving.
  const LINES = tier >= 1 ? 7 : 4;
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { uT: { value: 0 }, uPool: { value: new THREE.Vector2(.5, .5) }, uAmt: { value: 1 }, uAsp: { value: 1 }, uMotion: { value: 1 }, uLines: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,1.,1.);}',
    fragmentShader: `varying vec2 vUv; uniform float uT,uAmt,uAsp,uMotion,uLines; uniform vec2 uPool;
      float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
      void main(){ vec2 d=(vUv-uPool)*vec2(min(uAsp,1.6),1.); float r=length(d);
        vec3 base=vec3(.0065,.0042,.0030); vec3 warm=vec3(.060,.030,.014);
        vec3 c=base+warm*uAmt*exp(-r*r*3.6);
        float l=0.;
        for(int i=0;i<${LINES};i++){ float fi=float(i); float y=.1+fi*${(0.8 / Math.max(1, LINES - 1)).toFixed(4)};
          float a=sin(vUv.x*(2.2+fi*.5)+uT*.22*uMotion+fi*1.9)*.022*(.5+.5*sin(uT*.13*uMotion+fi));
          float dy=abs(vUv.y-y-a*sin(3.14159*vUv.x)); l+=smoothstep(.0016,.0,dy);
        }
        c+=vec3(.05,.031,.018)*uLines*l*(.35+.65*exp(-r*r*2.4));
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb+=(h(gl_FragCoord.xy+fract(uT))-.5)/255.;
      }`,
  }));
  backdrop.frustumCulled = false; backdrop.renderOrder = -1000; scene.add(backdrop);

  // The objects.
  const guitar = createGuitar({ tier, tex, overlay }); guitar.root.position.y = GUITAR_Y; scene.add(guitar.root); guitar.root.updateMatrixWorld(true);
  const amp = createAmp({ tier, tex }); amp.root.position.copy(AMP_POS); scene.add(amp.root); amp.root.updateMatrixWorld(true);
  const metro = createMetronome({ tier, tex }); metro.root.position.copy(METRO_POS); scene.add(metro.root); metro.root.updateMatrixWorld(true);
  const pedals = createPedals({ tier, tex }); pedals.root.position.copy(PEDAL_POS); scene.add(pedals.root); pedals.root.updateMatrixWorld(true);
  const chart = createChart({ tier, tex }); chart.root.position.copy(CHART_POS); scene.add(chart.root); chart.root.updateMatrixWorld(true);
  let guitar2 = null;
  // Only the subject of a shot is in the world while it's on screen: nothing clutters the backdrop.
  const ALL = ['guitar', 'neck2', 'amp', 'metro', 'pedals', 'chart'];
  let shownNow = ALL;
  function applyShow(names) {
    shownNow = names;
    guitar.root.visible = names.includes('guitar'); guitar.overlayGroup.visible = names.includes('guitar');
    if (guitar2) { guitar2.root.visible = names.includes('neck2'); guitar2.overlayGroup.visible = names.includes('neck2'); }
    amp.root.visible = names.includes('amp'); metro.root.visible = names.includes('metro'); pedals.root.visible = names.includes('pedals'); chart.root.visible = names.includes('chart');
  }
  function getSecondNeck() {
    if (guitar2) return guitar2;
    const eb = T.wood({ w: S(1536), h: S(384), dark: '#050403', mid: '#120d0a', light: '#241a13', gf: 22, streak: .4, pores: S(1400), seed: 9, normal: 1.6, rough: [.26, .46] });
    guitar2 = createGuitar({ tier, tex: { ...tex, ebony: eb }, wood: 'ebony', overlay }); guitar2.root.position.copy(NECK2_POS); scene.add(guitar2.root); guitar2.root.updateMatrixWorld(true); applyShow(shownNow);
    return guitar2;
  }

  // Post, desktop only and only on calm arrival shots. During a take the frame goes straight to the screen.
  let composer = null, dofPass = null, bloomPass = null;
  function buildPost() {
    if (tier < 2) return;
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(4, 4, THREE.UnsignedIntType) });
    composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(W, H);
    composer.addPass(new RenderPass(scene, camera));
    dofPass = new DofPass(); composer.addPass(dofPass);
    bloomPass = new UnrealBloomPass(new THREE.Vector2(W, H), .3, .32, 1.08); composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }
  buildPost();

  // ─── Camera rig ───
  const R = { pos: V(-1, 3, 4), tgt: V(2, .6, 0), fov: 26, ox: 0, oy: 0, poolX: .5, poolY: .5, poolA: 1, keyPos: V(0, 8, 3), keyTgt: V(2, .6, 0), keyI: 0, keyAngle: .5, rimI: .9, envI: .62, dof: 0, focus: 6, range: 1, fall: 4, bloom: 0, wash: 1.3, fogD: .028 };
  const from = { ...cloneState(R) }, to = { ...cloneState(R) };
  function cloneState(s) { return { pos: s.pos.clone(), tgt: s.tgt.clone(), fov: s.fov, ox: s.ox, oy: s.oy, poolX: s.poolX, poolY: s.poolY, poolA: s.poolA, keyPos: s.keyPos.clone(), keyTgt: s.keyTgt.clone(), keyI: s.keyI, keyAngle: s.keyAngle, rimI: s.rimI, envI: s.envI, dof: s.dof, focus: s.focus, range: s.range, fall: s.fall, bloom: s.bloom, wash: s.wash, fogD: s.fogD }; }
  let pendingShow = null, flight = null, driftA = 0, driftTo = 0, currentSpec = null, keyMul = 1, keyMulTo = 1;
  const solverCam = new THREE.PerspectiveCamera();
  const v3 = V();
  function bbox(cam, pts, w, h) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, bad = false;
    for (const p of pts) { v3.copy(p).project(cam); if (v3.z > 1) bad = true; const x = (v3.x * .5 + .5) * w, y = (-v3.y * .5 + .5) * h; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { x0, y0, x1, y1, bad };
  }
  function solve(spec, w, h, slot) {
    const pts = spec.points(), t = spec.target ? spec.target() : pts.reduce((a, p) => a.add(p), V()).multiplyScalar(1 / pts.length);
    const dir = V(...spec.dir).normalize(), fov = spec.fov ?? 26, fill = spec.fill ?? 1, fillX = spec.fillX ?? fill, fillY = spec.fillY ?? fill;
    const cam = solverCam; cam.fov = fov; cam.aspect = w / h; cam.near = .1; cam.far = 200; cam.clearViewOffset(); cam.updateProjectionMatrix();
    let lo = .4, hi = 150;
    for (let i = 0; i < 26; i++) {
      const d = (lo + hi) / 2; cam.position.copy(t).addScaledVector(dir, d); cam.lookAt(t); cam.updateMatrixWorld(true);
      const b = bbox(cam, pts, w, h), ok = !b.bad && (b.x1 - b.x0) <= slot.width * fillX && (b.y1 - b.y0) <= slot.height * fillY;
      if (ok) hi = d; else lo = d;
    }
    cam.position.copy(t).addScaledVector(dir, hi); cam.lookAt(t); cam.updateMatrixWorld(true);
    const b = bbox(cam, pts, w, h);
    const ax = spec.anchor ? spec.anchor[0] : .5, ay = spec.anchor ? spec.anchor[1] : .5;
    const ox = slot.left + slot.width * ax - (b.x0 + b.x1) / 2, oy = slot.top + slot.height * ay - (b.y0 + b.y1) / 2;
    return { pos: cam.position.clone(), tgt: t.clone(), fov, ox, oy, dist: hi };
  }
  function slotRect(spec) {
    const el = typeof spec.slot === 'function' ? spec.slot() : spec.slot;
    if (el && el.getBoundingClientRect) { const r = el.getBoundingClientRect(); if (r.width > 4 && r.height > 4) return r; }
    return { left: 0, top: 0, width: W, height: H };
  }
  function target(spec) {
    const sl = slotRect(spec), f = solve(spec, W, H, sl), k = spec.key || {}, s = cloneState(R);
    s.poolX = (sl.left + sl.width / 2) / W; s.poolY = 1 - (sl.top + sl.height / 2) / H; s.poolA = spec.pool ?? 1; backdrop.material.uniforms.uLines.value = spec.lines ?? 1;
    s.pos = f.pos; s.tgt = f.tgt; s.fov = f.fov; s.ox = f.ox; s.oy = f.oy;
    const off = V(...(k.offset || [-2.4, 7.4, 3.6]));
    s.keyTgt = k.target ? k.target() : f.tgt.clone();
    s.keyPos = s.keyTgt.clone().add(off);
    s.keyI = k.i ?? 2.6; s.keyAngle = k.angle ?? .42;
    s.rimI = spec.rim ?? .9; s.envI = spec.env ?? .62; s.wash = spec.wash ?? 1.3; s.fogD = spec.fog ?? .028;
    const P = spec.post || {};
    s.dof = tier >= 2 ? (P.dof ?? 0) : 0; s.bloom = tier >= 2 ? (P.bloom ?? 0) : 0;
    s.focus = P.focus != null ? (typeof P.focus === 'function' ? s.pos.distanceTo(P.focus()) : P.focus) : f.dist; s.range = P.range ?? .6; s.fall = P.fall ?? 3;
    return s;
  }
  function go(spec, { dur = 1.5, lift = 0 } = {}) {
    currentSpec = spec;
    if (spec.numScale) { guitar.setNumberScale(spec.numScale); if (guitar2) guitar2.setNumberScale(spec.numScale); }
    const showNames = spec.show || ALL;
    pendingShow = showNames;
    Object.assign(to, target(spec)); Object.assign(from, cloneState(R));
    driftTo = reduced ? 0 : (spec.drift ?? 0);
    if (reduced || snap || dur <= 0) { Object.assign(R, cloneState(to)); flight = null; applyShow(showNames); return; }
    applyShow([...new Set([...shownNow, ...showNames])]);
    // Long moves rise over whatever is on the bench.
    const dist = from.pos.distanceTo(to.pos);
    flight = { t: 0, dur, lift: dur >= 1 ? Math.max(lift, Math.min(3.4, dist * .2)) : lift };
  }
  function refit() { if (!currentSpec) return; Object.assign(to, target(currentSpec)); if (!flight) Object.assign(R, cloneState(to)); }
  function project(p) {
    const c = solverCam; c.fov = to.fov; c.aspect = W / H; c.clearViewOffset(); c.updateProjectionMatrix(); c.position.copy(to.pos); c.lookAt(to.tgt); c.updateMatrixWorld(true);
    v3.copy(p).project(c);
    return { x: (v3.x * .5 + .5) * W + to.ox, y: (-v3.y * .5 + .5) * H + to.oy };
  }

  // ─── Inset views: cards with a live object in them ───
  let views = [], mainOn = true;
  const viewCam = new THREE.PerspectiveCamera();
  let overlayMain = true;
  function setViews(list, { main = true, overlayInMain = true } = {}) { views = (list || []).map(v => ({ ...v, solved: null })); mainOn = main; overlayMain = overlayInMain; }

  function applyRig(t) {
    camera.position.copy(R.pos);
    if (driftA > .0001) {
      const dx = V().subVectors(R.tgt, R.pos).normalize(), rt = V().crossVectors(dx, camera.up).normalize();
      camera.position.addScaledVector(rt, Math.sin(t * .23) * driftA).addScaledVector(camera.up, Math.sin(t * .17 + 1) * driftA * .5);
    }
    camera.fov = R.fov; camera.aspect = W / H; camera.lookAt(R.tgt);
    camera.setViewOffset(W, H, -R.ox, -R.oy, W, H);
    camera.updateProjectionMatrix();
    key.position.copy(R.keyPos); key.target.position.copy(R.keyTgt); key.target.updateMatrixWorld(); key.intensity = R.keyI * keyMul; key.angle = R.keyAngle;
    rim.intensity = R.rimI * keyMul; scene.environmentIntensity = R.envI * (.35 + .65 * keyMul);
    const bu = backdrop.material.uniforms; bu.uT.value = reduced ? 0 : t; bu.uPool.value.set(R.poolX, R.poolY); bu.uAmt.value = R.poolA * (.4 + .6 * keyMul); bu.uAsp.value = W / H;
  }

  // ─── Loop ───
  let last = performance.now(), lastRender = 0, fps = 30, lost = false, hidden = document.hidden, firstFrame = true;
  let accum = 0, frames = 0, adaptOff = forcedTier != null, stable = 0;
  const clock = { t: 0 };
  function setFps(v) { fps = v; }
  function adapt(ms) {
    if (adaptOff || hidden) return;
    accum += ms; frames++;
    if (frames < 45) return;
    const avg = accum / frames; accum = 0; frames = 0;
    if (avg > 26) {
      if (dprScale > .68) { dprScale = Math.max(.62, dprScale - .14); resize(); }
      else if (composer) { composer = null; bloomPass = dofPass = null; }
      else if (renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; key.castShadow = false; guitar.fakeShadows && (guitar.fakeShadows.visible = true); scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }
    }
  }
  function renderMain() {
    const usePost = composer && mainOn && (R.dof > .05 || R.bloom > .01);
    if (usePost) {
      const u = dofPass.material.uniforms, pr = renderer.getPixelRatio();
      u.uFocus.value = R.focus; u.uRange.value = R.range; u.uFall.value = R.fall; u.uMax.value = R.dof * pr; u.uNear.value = camera.near; u.uFar.value = camera.far;
      dofPass.enabled = R.dof > .05; bloomPass.strength = R.bloom; bloomPass.enabled = R.bloom > .01;
      composer.render();
      if (overlayMain) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(overlay, camera); renderer.autoClear = true; }
    } else {
      renderer.autoClear = true;
      if (mainOn) renderer.render(scene, camera); else { renderer.setClearColor(bg, 1); renderer.clear(); }
      renderer.autoClear = false; renderer.clearDepth(); if (mainOn && overlayMain) renderer.render(overlay, camera); renderer.autoClear = true;
    }
  }
  function renderViews() {
    const rw = renderer.domElement.clientWidth, rh = renderer.domElement.clientHeight;
    renderer.setScissorTest(true);
    renderer.autoClear = false;
    const keep = { p: key.position.clone(), t: key.target.position.clone(), i: key.intensity, a: key.angle, env: scene.environmentIntensity, rim: rim.intensity, show: shownNow };
    const bu = backdrop.material.uniforms, bx = bu.uPool.value.x, by = bu.uPool.value.y, ba = bu.uAmt.value, bs = bu.uAsp.value;
    for (const v of views) {
      if (!v.el || !v.el.isConnected) continue;
      const r = v.el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > rh || r.right < 0 || r.left > rw) continue;
      if (!v.solved || v.w !== r.width || v.h !== r.height) { v.solved = solve(v.spec, r.width, r.height, { left: 0, top: 0, width: r.width, height: r.height }); v.w = r.width; v.h = r.height; }
      const s = v.solved;
      viewCam.fov = s.fov; viewCam.aspect = r.width / r.height; viewCam.near = .1; viewCam.far = 120; viewCam.position.copy(s.pos); viewCam.lookAt(s.tgt);
      viewCam.setViewOffset(r.width, r.height, -s.ox, -s.oy, r.width, r.height); viewCam.updateProjectionMatrix();
      const k = v.spec.key || {}, kt = k.target ? k.target() : s.tgt;
      key.target.position.copy(kt); key.target.updateMatrixWorld(); key.position.copy(kt).add(V(...(k.offset || [-2.4, 7.4, 3.6]))); key.intensity = k.i ?? 2.6; key.angle = k.angle ?? .5; key.shadow.needsUpdate = true; if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
      scene.environmentIntensity = v.spec.env ?? .6; rim.intensity = v.spec.rim ?? .9;
      if (v.spec.show) applyShow(v.spec.show);
      bu.uPool.value.set(.5, .55); bu.uAmt.value = .85; bu.uAsp.value = r.width / r.height; bu.uLines.value = 0;
      const x = r.left, y = rh - r.bottom;
      renderer.setViewport(x, y, r.width, r.height); renderer.setScissor(x, y, r.width, r.height);
      renderer.clear();
      renderer.render(scene, viewCam);
      if (v.spec.overlay) { renderer.clearDepth(); renderer.render(overlay, viewCam); }
    }
    key.position.copy(keep.p); key.target.position.copy(keep.t); key.target.updateMatrixWorld(); key.intensity = keep.i; key.angle = keep.a; scene.environmentIntensity = keep.env; rim.intensity = keep.rim; applyShow(keep.show); bu.uLines.value = currentSpec?.lines ?? 1; bu.uPool.value.set(bx, by); bu.uAmt.value = ba; bu.uAsp.value = bs;
    renderer.setScissorTest(false); renderer.setViewport(0, 0, rw, rh); renderer.autoClear = true;
  }
  function frame(now) {
    const dt = Math.min(.25, (now - last) / 1000); last = now;
    if (hidden || lost) return;
    clock.t += dt;
    const t = clock.t;
    if (flight) {
      flight.t = Math.min(1, flight.t + Math.min(dt, .1) / flight.dur);
      const e = ease(flight.t), l = Math.sin(Math.PI * flight.t) * flight.lift;
      R.pos.lerpVectors(from.pos, to.pos, e); R.pos.y += l;
      R.tgt.lerpVectors(from.tgt, to.tgt, e);
      R.keyPos.lerpVectors(from.keyPos, to.keyPos, e); R.keyTgt.lerpVectors(from.keyTgt, to.keyTgt, e);
      for (const k of ['poolX', 'poolY', 'poolA', 'fov', 'ox', 'oy', 'keyI', 'keyAngle', 'rimI', 'envI', 'dof', 'focus', 'range', 'fall', 'bloom', 'wash', 'fogD']) R[k] = from[k] + (to[k] - from[k]) * e;
      if (flight.t >= 1) { flight = null; if (pendingShow) applyShow(pendingShow); }
    }
    driftA += (driftTo - driftA) * Math.min(1, dt * .8);
    keyMul += (keyMulTo - keyMul) * Math.min(1, dt * 3.2);
    guitar.update(dt); amp.update(dt, t); metro.update(dt); pedals.update(dt); chart.update(dt, t);
    if (guitar2) guitar2.update(dt);
    const wantFps = Math.min(maxFps, flight ? 60 : fps), gap = 1000 / wantFps - 1.5;
    if (now - lastRender < gap) return;
    const ms = now - lastRender; lastRender = now;
    if (wantFps >= 50) adapt(ms); else { accum = 0; frames = 0; }
    applyRig(t);
    renderMain();
    if (views.length) renderViews();
    if (firstFrame) { firstFrame = false; }
    stable++;
  }
  function resize() {
    W = innerWidth; H = innerHeight;
    renderer.setPixelRatio(dpr()); renderer.setSize(W, H, false);
    if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(W, H); }
    views.forEach(v => { v.solved = null; });
    refit();
  }
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; last = performance.now(); });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; onLost(); });
  canvas.addEventListener('webglcontextrestored', () => {
    envRT = buildEnv(); scene.environment = envRT.texture;
    T.clearLabelCache();
    if (composer) { composer = null; buildPost(); }
    lost = false; last = performance.now(); onRestored();
  });

  const positions = { amp: AMP_POS, metro: METRO_POS, pedals: PEDAL_POS, chart: CHART_POS };
  return {
    renderer, scene, camera, overlay, guitar, amp, metro, pedals, chart, getSecondNeck, peekSecondNeck: () => guitar2, tier: () => tier,
    go, refit, project, setViews, frame, resize, setFps,
    setKeyMul: v => { keyMulTo = v; }, flying: () => !!flight, info: () => ({ tier, dpr: renderer.getPixelRatio(), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, post: !!composer }),
    positions,
  };
}
