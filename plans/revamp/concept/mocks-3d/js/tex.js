// Procedural textures. Nothing is downloaded: wood, metal, pearl and paint are all computed here.
import * as THREE from 'three';

const P = new Uint8Array(512), R = new Float32Array(256);
(function seed() {
  let s = 1337;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  for (let i = 0; i < 256; i++) R[i] = rnd();
})();
export function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const X = xi & 255, Y = yi & 255;
  const a = R[P[X] + Y & 255], b = R[P[X + 1] + Y & 255], c = R[P[X] + Y + 1 & 255], d = R[P[X + 1] + Y + 1 & 255];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, o = 4) { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * noise(x * f + i * 17.3, y * f + i * 9.1); a *= .5; f *= 2.03; } return s; }
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
let maxAniso = 8;
export const setAniso = a => { maxAniso = a; };
function tex(c, { srgb = true, wrapS = THREE.ClampToEdgeWrapping, wrapT = THREE.ClampToEdgeWrapping } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = wrapS; t.wrapT = wrapT; t.anisotropy = maxAniso;
  return t;
}
function write(w, h, fn) { // fn(x,y,out[4])
  const c = canvas(w, h), g = c.getContext('2d'), d = g.createImageData(w, h), o = [0, 0, 0, 255];
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) { o[3] = 255; fn(x, y, o); d.data[i] = o[0]; d.data[i + 1] = o[1]; d.data[i + 2] = o[2]; d.data[i + 3] = o[3]; }
  g.putImageData(d, 0, 0);
  return c;
}
function normalFrom(H, w, h, strength, wrapX = true) {
  return write(w, h, (x, y, o) => {
    const xl = wrapX ? (x - 1 + w) % w : Math.max(0, x - 1), xr = wrapX ? (x + 1) % w : Math.min(w - 1, x + 1), yu = Math.max(0, y - 1), yd = Math.min(h - 1, y + 1);
    const dx = (H[y * w + xl] - H[y * w + xr]) * strength, dy = (H[yu * w + x] - H[yd * w + x]) * strength;
    const l = Math.hypot(dx, dy, 1);
    o[0] = (dx / l * .5 + .5) * 255; o[1] = (dy / l * .5 + .5) * 255; o[2] = (1 / l * .5 + .5) * 255;
  });
}

// A wood set. Grain runs along U.
export function wood({ w = 2048, h = 512, dark, mid, light, gf = 16, streak = .55, pores = 2600, normal = 3.2, rough = [.42, .7], seed = 0, purple = 0 }) {
  const D = hex(dark), M = hex(mid), L = hex(light);
  const H = new Float32Array(w * h), C = new Float32Array(w * h * 3), Ro = new Float32Array(w * h);
  for (let y = 0, i = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++, i++) {
      const u = x / w;
      const warp = fbm(u * 2.2 + seed, v * 3.2 + seed, 3);
      const s = (v + (warp - .5) * .22) * gf;
      const g = fbm(u * 1.4 + seed * 3, s, 4);
      const fine = noise(u * 34 + seed, v * gf * 9);
      const band = sm(.28, .72, fbm(u * .7, s * .34 + 11, 2));
      const st = Math.pow(sm(.5, .78, fbm(u * 2.6 + 3, s * 2.1 + 5, 3)), 1.6);
      let t = sm(.22, .74, g * .7 + fine * .3);
      t = lerp(t, t * band, .5);
      let r, gr, b;
      if (t < .5) { const k = t * 2; r = lerp(D[0], M[0], k); gr = lerp(D[1], M[1], k); b = lerp(D[2], M[2], k); }
      else { const k = (t - .5) * 2; r = lerp(M[0], L[0], k); gr = lerp(M[1], L[1], k); b = lerp(M[2], L[2], k); }
      const dk = 1 - st * streak;
      r *= dk; gr *= dk; b *= dk;
      if (purple) { const pk = fbm(u * 1.1 + 40, v * 5 + 3, 2) * purple; b *= 1 + pk; r *= 1 - pk * .15; }
      C[i * 3] = r; C[i * 3 + 1] = gr; C[i * 3 + 2] = b;
      H[i] = t * .35 - st * .25;
      Ro[i] = lerp(rough[0], rough[1], clamp(.5 - t * .3 + st * .55));
    }
  }
  // Pores: short, dark, slightly drifting streaks.
  let s = 4242 + seed * 97;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < pores; n++) {
    let x = rnd() * w, y = rnd() * h;
    const len = 12 + rnd() * rnd() * w * .1, wid = rnd() < .2 ? 2 : 1, drift = (rnd() - .5) * .04, dep = .35 + rnd() * .5;
    for (let k = 0; k < len; k++) {
      const xi = Math.floor(x + k + w) % w, yi = Math.floor(y + k * drift);
      if (yi < 0 || yi >= h) break;
      const edge = Math.min(1, Math.min(k, len - k) / 6);
      for (let j = 0; j < wid; j++) {
        const yy = Math.min(h - 1, yi + j), i = yy * w + xi, a = dep * edge;
        C[i * 3] *= 1 - a * .75; C[i * 3 + 1] *= 1 - a * .78; C[i * 3 + 2] *= 1 - a * .8;
        H[i] -= a * .55; Ro[i] = Math.min(1, Ro[i] + a * .3);
      }
    }
  }
  const map = write(w, h, (x, y, o) => { const i = y * w + x; o[0] = C[i * 3]; o[1] = C[i * 3 + 1]; o[2] = C[i * 3 + 2]; });
  const nor = normalFrom(H, w, h, normal);
  const ro = write(w, h, (x, y, o) => { const v = Ro[y * w + x] * 255; o[0] = 0; o[1] = v; o[2] = 0; });
  const W = THREE.MirroredRepeatWrapping;
  return { map: tex(map, { wrapS: W, wrapT: W }), normalMap: tex(nor, { srgb: false, wrapS: W, wrapT: W }), roughnessMap: tex(ro, { srgb: false, wrapS: W, wrapT: W }) };
}

// Brushed metal: horizontal streaks in roughness and normal.
export function brushed({ w = 512, h = 512, base = '#b4ab9b', spread = 34, rough = [.26, .5] }) {
  const C = hex(base), H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const r = noise(3.3, y * .9) * .6 + noise(9.3, y * 2.9) * .4;
    for (let x = 0; x < w; x++) H[y * w + x] = r + noise(x * .012 + y, y * 1.7) * .25;
  }
  const map = write(w, h, (x, y, o) => { const v = 1 + (H[y * w + x] - .55) * spread / 100; o[0] = C[0] * v; o[1] = C[1] * v; o[2] = C[2] * v; });
  const ro = write(w, h, (x, y, o) => { o[0] = 0; o[1] = lerp(rough[0], rough[1], H[y * w + x]) * 255; o[2] = 255; });
  const nor = normalFrom(H, w, h, .5);
  const W = THREE.RepeatWrapping;
  return { map: tex(map, { wrapS: W, wrapT: W }), roughnessMap: tex(ro, { srgb: false, wrapS: W, wrapT: W }), normalMap: tex(nor, { srgb: false, wrapS: W, wrapT: W }) };
}

// Flame maple under a cherry sunburst. UV covers the body's bounding box.
export function flameBurst({ size = 1024, cx = .56, cz = .5 }) {
  const c = write(size, size, (x, y, o) => {
    const u = x / size, v = y / size;
    const warp = fbm(u * 3, v * 2.4, 3);
    const flame = Math.sin((u * 26 + warp * 11 + Math.sin(v * 7 + warp * 3) * 1.6)) * .5 + .5;
    const fine = fbm(u * 18, v * 90, 3);
    const fig = lerp(.58, 1.3, Math.pow(flame, 1.3)) * lerp(.88, 1.1, fine);
    const dx = (u - cx) * 1.12, dz = (v - cz) * 1.05, d = Math.hypot(dx, dz) * 2;
    const a = sm(.5, .86, d), b = sm(.8, 1.08, d);
    const honey = [226, 150, 48], cherry = [122, 30, 14], edge = [20, 7, 5];
    let r = lerp(honey[0], cherry[0], a), g = lerp(honey[1], cherry[1], a), bl = lerp(honey[2], cherry[2], a);
    r = lerp(r, edge[0], b); g = lerp(g, edge[1], b); bl = lerp(bl, edge[2], b);
    o[0] = clamp(r * fig, 0, 255); o[1] = clamp(g * fig, 0, 255); o[2] = clamp(bl * fig, 0, 255);
  });
  return tex(c);
}

// A wound string's ridges. Tiled along the length.
export function windings() {
  const w = 16, h = 4, H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = Math.pow(Math.abs(Math.sin(Math.PI * x / w)), .55);
  const t = tex(normalFrom(H, w, h, 2.4), { srgb: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
  return t;
}

// Mother of pearl.
export function pearl(size = 128) {
  const c = write(size, size, (x, y, o) => {
    const u = x / size, v = y / size, a = fbm(u * 4, v * 4, 4), b = fbm(u * 11 + 5, v * 6 + 2, 3);
    const swirl = Math.sin((a * 9 + b * 3) * 3.1) * .5 + .5;
    o[0] = lerp(206, 248, swirl); o[1] = lerp(214, 240, swirl * b * 1.6); o[2] = lerp(216, 232, 1 - swirl);
  });
  return tex(c, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
}

// Studio wall: dark timber slats.
export function slats({ w = 1024, h = 256, count = 34 }) {
  const H = new Float32Array(w * h);
  const map = write(w, h, (x, y, o) => {
    const p = (x / w) * count, f = p - Math.floor(p), id = Math.floor(p);
    const gap = sm(.0, .1, f) * sm(1, .9, f);
    const tone = .72 + noise(id * 3.1, 2) * .5;
    const gr = .86 + fbm(x * .01 + id * 7, y * .2, 3) * .3;
    H[y * w + x] = gap;
    const v = gap * tone * gr;
    o[0] = 58 * v; o[1] = 36 * v; o[2] = 24 * v;
  });
  const nor = normalFrom(H, w, h, 2.2);
  const W = THREE.RepeatWrapping;
  return { map: tex(map, { wrapS: W, wrapT: W }), normalMap: tex(nor, { srgb: false, wrapS: W, wrapT: W }) };
}

export function radial(stops, size = 256) {
  const c = canvas(size, size), g = c.getContext('2d'), r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => r.addColorStop(o, col));
  g.fillStyle = r; g.fillRect(0, 0, size, size);
  return tex(c);
}

// Soft strip across V: used for fake string shadows and light ribbons.
export function softStrip() {
  const c = canvas(4, 64), g = c.getContext('2d'), r = g.createLinearGradient(0, 0, 0, 64);
  r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(.5, 'rgba(0,0,0,1)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 4, 64);
  return tex(c, { srgb: false });
}

// A note disc: a pool of light under the string.
const NOTE_LOOK = {
  aim: ['#ffdca2', '#ffbc62', '#f59d34', 'rgba(255,232,190,.95)'],
  tone: ['#b4f5cd', '#57e692', '#2fc274', 'rgba(205,255,225,.95)'],
  tens: ['#c0e0ff', '#5aa9ff', '#2a70c4', 'rgba(200,228,255,.95)'],
  clash: ['#ffc2c8', '#ff6474', '#e23c4d', 'rgba(255,215,220,.95)'],
  box: ['#3a2c20', '#281d15', '#1a130d', 'rgba(205,182,150,.55)'],
  dim: ['#1e1711', '#16100b', '#100b08', 'rgba(110,95,80,.55)'],
};
const discCache = new Map();
export function noteDisc(kind) {
  if (discCache.has(kind)) return discCache.get(kind);
  const S = 192, c = canvas(S, S), g = c.getContext('2d'), L = NOTE_LOOK[kind] || NOTE_LOOK.box, m = S / 2;
  const r = g.createRadialGradient(m - S * .1, m - S * .12, S * .02, m, m, S * .46);
  r.addColorStop(0, L[0]); r.addColorStop(.58, L[1]); r.addColorStop(1, L[2]);
  g.fillStyle = r; g.beginPath(); g.arc(m, m, S * .46, 0, 7); g.fill();
  g.strokeStyle = L[3]; g.lineWidth = S * .022; g.beginPath(); g.arc(m, m, S * .46, 0, 7); g.stroke();
  const t = tex(c); t.anisotropy = maxAniso;
  discCache.set(kind, t);
  return t;
}
const labelCache = new Map();
export function noteLabel(text, color) {
  const k = text + color;
  if (labelCache.has(k)) return labelCache.get(k);
  const S = 192, c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${text.length > 1 ? 96 : 118}px "Barlow Condensed","Arial Narrow",system-ui,sans-serif`;
  g.fillText(text, S / 2, S / 2 + 6);
  const t = tex(c);
  labelCache.set(k, t);
  return t;
}
export function clearLabelCache() { labelCache.forEach(t => t.dispose()); labelCache.clear(); }

// Text on a transparent canvas (pedal decals, engraved plates).
export function textCanvas(w, h, draw) { const c = canvas(w, h); draw(c.getContext('2d'), w, h); return c; }
export const toTex = tex;
