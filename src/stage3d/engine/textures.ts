/**
 * Procedural textures for the neck. Nothing is downloaded: wood, pearl, the
 * string windings and the note discs are computed here, once, at load.
 *
 * Ported from plans/revamp/concept/mocks-3d-v2/js/tex.js (only what the neck
 * uses). Part of the lazy chunk: imported by `engine.ts` only.
 */
import * as THREE from "three";
import type { NeckKind } from "../api";

const P = new Uint8Array(512);
const R = new Float32Array(256);
(function seed() {
  let s = 1337;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  for (let i = 0; i < 256; i++) R[i] = rnd();
})();

function noise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const X = xi & 255;
  const Y = yi & 255;
  const a = R[(P[X] + Y) & 255];
  const b = R[(P[X + 1] + Y) & 255];
  const c = R[(P[X] + Y + 1) & 255];
  const d = R[(P[X + 1] + Y + 1) & 255];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, o = 4): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < o; i++) {
    s += a * noise(x * f + i * 17.3, y * f + i * 9.1);
    a *= 0.5;
    f *= 2.03;
  }
  return s;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const sm = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hex = (h: string) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

let maxAniso = 8;
export const setAniso = (a: number) => {
  maxAniso = a;
};

type TexOpts = { srgb?: boolean; wrapS?: THREE.Wrapping; wrapT?: THREE.Wrapping };
function tex(c: HTMLCanvasElement, { srgb = true, wrapS = THREE.ClampToEdgeWrapping, wrapT = THREE.ClampToEdgeWrapping }: TexOpts = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = wrapS;
  t.wrapT = wrapT;
  t.anisotropy = maxAniso;
  return t;
}

type Px = [number, number, number, number];
function write(w: number, h: number, fn: (x: number, y: number, o: Px) => void): HTMLCanvasElement {
  const c = canvas(w, h);
  const g = c.getContext("2d")!;
  const d = g.createImageData(w, h);
  const o: Px = [0, 0, 0, 255];
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      o[3] = 255;
      fn(x, y, o);
      d.data[i] = o[0];
      d.data[i + 1] = o[1];
      d.data[i + 2] = o[2];
      d.data[i + 3] = o[3];
    }
  }
  g.putImageData(d, 0, 0);
  return c;
}

function normalFrom(H: Float32Array, w: number, h: number, strength: number, wrapX = true) {
  return write(w, h, (x, y, o) => {
    const xl = wrapX ? (x - 1 + w) % w : Math.max(0, x - 1);
    const xr = wrapX ? (x + 1) % w : Math.min(w - 1, x + 1);
    const yu = Math.max(0, y - 1);
    const yd = Math.min(h - 1, y + 1);
    const dx = (H[y * w + xl] - H[y * w + xr]) * strength;
    const dy = (H[yu * w + x] - H[yd * w + x]) * strength;
    const l = Math.hypot(dx, dy, 1);
    o[0] = ((dx / l) * 0.5 + 0.5) * 255;
    o[1] = ((dy / l) * 0.5 + 0.5) * 255;
    o[2] = ((1 / l) * 0.5 + 0.5) * 255;
  });
}

export type WoodSet = { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture };

/**
 * A wood set. Grain runs along U.
 *
 * Computed in slices: `yieldNow` is awaited whenever a slice has run for about
 * 10 ms, so a desktop-sized board does not hold the page for half a second.
 */
export async function wood(o: {
  w: number;
  h: number;
  dark: string;
  mid: string;
  light: string;
  gf?: number;
  streak?: number;
  pores?: number;
  normal?: number;
  rough?: [number, number];
  seed?: number;
  purple?: number;
}, yieldNow: () => Promise<void> = async () => {}): Promise<WoodSet> {
  let t0 = performance.now();
  const slice = async () => {
    if (performance.now() - t0 > 10) {
      await yieldNow();
      t0 = performance.now();
    }
  };
  const { w, h, gf = 16, streak = 0.55, pores = 2600, normal = 3.2, rough = [0.42, 0.7], seed = 0, purple = 0 } = o;
  const D = hex(o.dark);
  const M = hex(o.mid);
  const L = hex(o.light);
  const H = new Float32Array(w * h);
  const C = new Float32Array(w * h * 3);
  const Ro = new Float32Array(w * h);
  for (let y = 0, i = 0; y < h; y++) {
    await slice();
    const v = y / h;
    for (let x = 0; x < w; x++, i++) {
      const u = x / w;
      const warp = fbm(u * 2.2 + seed, v * 3.2 + seed, 3);
      const s = (v + (warp - 0.5) * 0.22) * gf;
      const g = fbm(u * 1.4 + seed * 3, s, 4);
      const fine = noise(u * 34 + seed, v * gf * 9);
      const band = sm(0.28, 0.72, fbm(u * 0.7, s * 0.34 + 11, 2));
      const st = Math.pow(sm(0.5, 0.78, fbm(u * 2.6 + 3, s * 2.1 + 5, 3)), 1.6);
      let t = sm(0.22, 0.74, g * 0.7 + fine * 0.3);
      t = lerp(t, t * band, 0.5);
      let r: number;
      let gr: number;
      let b: number;
      if (t < 0.5) {
        const k = t * 2;
        r = lerp(D[0], M[0], k);
        gr = lerp(D[1], M[1], k);
        b = lerp(D[2], M[2], k);
      } else {
        const k = (t - 0.5) * 2;
        r = lerp(M[0], L[0], k);
        gr = lerp(M[1], L[1], k);
        b = lerp(M[2], L[2], k);
      }
      const dk = 1 - st * streak;
      r *= dk;
      gr *= dk;
      b *= dk;
      if (purple) {
        const pk = fbm(u * 1.1 + 40, v * 5 + 3, 2) * purple;
        b *= 1 + pk;
        r *= 1 - pk * 0.15;
      }
      C[i * 3] = r;
      C[i * 3 + 1] = gr;
      C[i * 3 + 2] = b;
      H[i] = t * 0.35 - st * 0.25;
      Ro[i] = lerp(rough[0], rough[1], clamp(0.5 - t * 0.3 + st * 0.55));
    }
  }
  // Pores: short, dark, slightly drifting streaks.
  let s = 4242 + seed * 97;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < pores; n++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const len = 12 + rnd() * rnd() * w * 0.1;
    const wid = rnd() < 0.2 ? 2 : 1;
    const drift = (rnd() - 0.5) * 0.04;
    const dep = 0.35 + rnd() * 0.5;
    for (let k = 0; k < len; k++) {
      const xi = Math.floor(x + k + w) % w;
      const yi = Math.floor(y + k * drift);
      if (yi < 0 || yi >= h) break;
      const edge = Math.min(1, Math.min(k, len - k) / 6);
      for (let j = 0; j < wid; j++) {
        const yy = Math.min(h - 1, yi + j);
        const i = yy * w + xi;
        const a = dep * edge;
        C[i * 3] *= 1 - a * 0.75;
        C[i * 3 + 1] *= 1 - a * 0.78;
        C[i * 3 + 2] *= 1 - a * 0.8;
        H[i] -= a * 0.55;
        Ro[i] = Math.min(1, Ro[i] + a * 0.3);
      }
    }
  }
  await slice();
  const map = write(w, h, (x, y, px) => {
    const i = y * w + x;
    px[0] = C[i * 3];
    px[1] = C[i * 3 + 1];
    px[2] = C[i * 3 + 2];
  });
  await slice();
  const nor = normalFrom(H, w, h, normal);
  await slice();
  const ro = write(w, h, (x, y, px) => {
    const v = Ro[y * w + x] * 255;
    px[0] = 0;
    px[1] = v;
    px[2] = 0;
  });
  const W = THREE.MirroredRepeatWrapping;
  return {
    map: tex(map, { wrapS: W, wrapT: W }),
    normalMap: tex(nor, { srgb: false, wrapS: W, wrapT: W }),
    roughnessMap: tex(ro, { srgb: false, wrapS: W, wrapT: W }),
  };
}

/** A wound string's ridges. Tiled along the length. */
export function windings(): THREE.Texture {
  const w = 16;
  const h = 4;
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = Math.pow(Math.abs(Math.sin((Math.PI * x) / w)), 0.55);
  return tex(normalFrom(H, w, h, 2.4), { srgb: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
}

/** Mother of pearl. */
export function pearl(size = 128): THREE.Texture {
  const c = write(size, size, (x, y, o) => {
    const u = x / size;
    const v = y / size;
    const a = fbm(u * 4, v * 4, 4);
    const b = fbm(u * 11 + 5, v * 6 + 2, 3);
    const swirl = Math.sin((a * 9 + b * 3) * 3.1) * 0.5 + 0.5;
    o[0] = lerp(206, 248, swirl);
    o[1] = lerp(214, 240, swirl * b * 1.6);
    o[2] = lerp(216, 232, 1 - swirl);
  });
  return tex(c, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
}

export function radial(stops: Array<[number, string]>, size = 256): THREE.Texture {
  const c = canvas(size, size);
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => r.addColorStop(o, col));
  g.fillStyle = r;
  g.fillRect(0, 0, size, size);
  return tex(c);
}

/** Soft strip across V: the painted string shadows on tiers with no shadow map. */
export function softStrip(): THREE.Texture {
  const c = canvas(4, 64);
  const g = c.getContext("2d")!;
  const r = g.createLinearGradient(0, 0, 0, 64);
  r.addColorStop(0, "rgba(0,0,0,0)");
  r.addColorStop(0.5, "rgba(0,0,0,1)");
  r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 4, 64);
  return tex(c, { srgb: false });
}

/** A note disc: a pool of light under the string. */
const NOTE_LOOK: Record<NeckKind, [string, string, string, string]> = {
  aim: ["#ffdca2", "#ffbc62", "#f59d34", "rgba(255,232,190,.95)"],
  tone: ["#b4f5cd", "#57e692", "#2fc274", "rgba(205,255,225,.95)"],
  tens: ["#c0e0ff", "#5aa9ff", "#2a70c4", "rgba(200,228,255,.95)"],
  clash: ["#ffc2c8", "#ff6474", "#e23c4d", "rgba(255,215,220,.95)"],
  box: ["#3a2c20", "#281d15", "#1a130d", "rgba(205,182,150,.55)"],
  dim: ["#1e1711", "#16100b", "#100b08", "rgba(110,95,80,.55)"],
};

const discCache = new Map<string, THREE.Texture>();
export function noteDisc(kind: NeckKind): THREE.Texture {
  const hit = discCache.get(kind);
  if (hit) return hit;
  const S = 192;
  const c = canvas(S, S);
  const g = c.getContext("2d")!;
  const L = NOTE_LOOK[kind] ?? NOTE_LOOK.box;
  const m = S / 2;
  const r = g.createRadialGradient(m - S * 0.1, m - S * 0.12, S * 0.02, m, m, S * 0.46);
  r.addColorStop(0, L[0]);
  r.addColorStop(0.58, L[1]);
  r.addColorStop(1, L[2]);
  g.fillStyle = r;
  g.beginPath();
  g.arc(m, m, S * 0.46, 0, 7);
  g.fill();
  g.strokeStyle = L[3];
  g.lineWidth = S * 0.022;
  g.beginPath();
  g.arc(m, m, S * 0.46, 0, 7);
  g.stroke();
  const t = tex(c);
  discCache.set(kind, t);
  return t;
}

const labelCache = new Map<string, THREE.Texture>();
export function noteLabel(text: string, color: string): THREE.Texture {
  const k = text + "\u0000" + color;
  const hit = labelCache.get(k);
  if (hit) return hit;
  const S = 192;
  const c = canvas(S, S);
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `700 ${text.length > 1 ? 96 : 118}px "Barlow Condensed","Arial Narrow",system-ui,sans-serif`;
  g.fillText(text, S / 2, S / 2 + 6);
  const t = tex(c);
  labelCache.set(k, t);
  return t;
}

/** Drop every cached disc and label (on unmount, and after a lost context). */
export function clearCaches(): void {
  labelCache.forEach((t) => t.dispose());
  labelCache.clear();
  discCache.forEach((t) => t.dispose());
  discCache.clear();
}
