/**
 * The metronome, as wireframe geometry.
 *
 * Ported from the geometry the marketing site draws (`docs/site.js`), which is
 * where the look comes from — an engineering illustration in line, no lights,
 * no materials, no depth buffer, so a few hundred lines of projection is the
 * whole job and the app takes on no dependency to get it.
 *
 * Two deliberate departures from the site's version. It is assembled rather
 * than exploded: the site pulls the parts apart to explain a mechanism, and
 * this one sits behind live controls where a diagram would be noise. And there
 * is no second, dashed rod — that one is the coach's drift illustration, and it
 * would be a lie on a screen that is not measuring anything.
 *
 * Units are arbitrary and internally consistent; the case is about 5 tall.
 */

export type Mesh = { pts: [number, number, number][]; edges: [number, number][] };

function box(sx: number, sy: number, sz: number, cx = 0, cy = 0, cz = 0): Mesh {
  const X = sx / 2;
  const Y = sy / 2;
  const Z = sz / 2;
  const pts = (
    [
      [-X, -Y, -Z], [X, -Y, -Z], [X, Y, -Z], [-X, Y, -Z],
      [-X, -Y, Z], [X, -Y, Z], [X, Y, Z], [-X, Y, Z],
    ] as [number, number, number][]
  ).map(([x, y, z]) => [x + cx, y + cy, z + cz] as [number, number, number]);
  return {
    pts,
    edges: [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ],
  };
}

/** Four-sided frustum: the classic Maelzel case. */
function frustum(topR: number, botR: number, height: number, cy = 0): Mesh {
  const pts: [number, number, number][] = [];
  const edges: [number, number][] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    pts.push([Math.cos(a) * botR, cy - height / 2, Math.sin(a) * botR]);
    pts.push([Math.cos(a) * topR, cy + height / 2, Math.sin(a) * topR]);
  }
  for (let i = 0; i < 4; i++) {
    const b0 = i * 2;
    const t0 = i * 2 + 1;
    const b1 = ((i + 1) % 4) * 2;
    const t1 = ((i + 1) % 4) * 2 + 1;
    edges.push([b0, t0], [b0, b1], [t0, t1]);
  }
  return { pts, edges };
}

/** A toothed wheel, drawn front and back with the rim joined. */
function gear(
  teeth: number, r: number, toothH: number, thick: number,
  cx = 0, cy = 0, cz = 0,
): Mesh {
  const pts: [number, number, number][] = [];
  const edges: [number, number][] = [];
  const ring: [number, number][] = [];
  for (let i = 0; i < teeth; i++) {
    const s = (Math.PI * 2) / teeth;
    const a0 = i * s;
    const a1 = a0 + s * 0.32;
    const a2 = a0 + s * 0.5;
    const a3 = a0 + s * 0.82;
    ring.push(
      [Math.cos(a0) * r, Math.sin(a0) * r],
      [Math.cos(a1) * (r + toothH), Math.sin(a1) * (r + toothH)],
      [Math.cos(a2) * (r + toothH), Math.sin(a2) * (r + toothH)],
      [Math.cos(a3) * r, Math.sin(a3) * r],
    );
  }
  const n = ring.length;
  for (const [x, y] of ring) pts.push([x + cx, y + cy, cz - thick / 2]);
  for (const [x, y] of ring) pts.push([x + cx, y + cy, cz + thick / 2]);
  for (let i = 0; i < n; i++) {
    edges.push([i, (i + 1) % n], [n + i, n + ((i + 1) % n)]);
    if (i % 4 === 1 || i % 4 === 2) edges.push([i, n + i]);
  }
  const hubStart = pts.length;
  const HUB = 14;
  const hr = r * 0.2;
  for (let i = 0; i < HUB; i++) {
    const a = (i / HUB) * Math.PI * 2;
    pts.push([Math.cos(a) * hr + cx, Math.sin(a) * hr + cy, cz - thick / 2]);
  }
  for (let i = 0; i < HUB; i++) edges.push([hubStart + i, hubStart + ((i + 1) % HUB)]);
  return { pts, edges };
}

export function merge(...parts: Mesh[]): Mesh {
  const pts: [number, number, number][] = [];
  const edges: [number, number][] = [];
  for (const p of parts) {
    const base = pts.length;
    pts.push(...p.pts);
    for (const [a, b] of p.edges) edges.push([base + a, base + b]);
  }
  return { pts, edges };
}

/* ── The assembly ─────────────────────────────────────────────────────── */

/** The case: plinth, chamfer, ribs following the taper, and the aperture the
 *  rod shows through. Flat frusta read as an empty box. */
const CASE: Mesh = (() => {
  const parts: Mesh[] = [frustum(1.05, 2.15, 5.2), frustum(1.02, 1.05, 0.22, 2.7)];
  parts.push(box(3.5, 0.24, 3.5, 0, -2.72, 0), box(3.1, 0.14, 3.1, 0, -2.92, 0));
  for (let i = 1; i <= 2; i++) {
    const t = i / 3;
    const y = -2.6 + t * 5.2;
    const r = 2.15 + (1.05 - 2.15) * t;
    const ring: Mesh = { pts: [], edges: [] };
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      ring.pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
    for (let k = 0; k < 4; k++) ring.edges.push([k, (k + 1) % 4]);
    parts.push(ring);
  }
  parts.push(box(1.55, 3.5, 0.05, 0, 0.15, 1.42), box(1.25, 3.2, 0.05, 0, 0.15, 1.44));
  return merge(...parts);
})();

/** The graduated plate the weight is set against. */
const PLATE: Mesh = (() => {
  const ticks: Mesh[] = [];
  for (let i = 0; i < 15; i++) {
    ticks.push(box(i % 3 === 0 ? 0.5 : 0.28, 0.03, 0.04, -0.28, -1.75 + i * 0.25, 0.05));
  }
  return merge(box(1.35, 4.1, 0.06, 0, 0.1, 0), ...ticks);
})();

/** The train: plate and three wheels. */
const MOVEMENT: Mesh = merge(
  box(1.9, 2.4, 0.08, 0, -0.2, 0),
  gear(26, 0.6, 0.1, 0.1, -0.38, 0.3, 0),
  gear(18, 0.42, 0.09, 0.1, 0.5, -0.3, 0),
  gear(13, 0.3, 0.08, 0.1, -0.15, -0.95, 0),
);

/** The escapement — the part that makes the noise. */
const ESCAPEMENT: Mesh = merge(
  gear(20, 0.5, 0.14, 0.09, 0, 0, 0),
  box(1.25, 0.09, 0.09, 0, 0.62, 0),
  box(0.11, 0.34, 0.09, -0.56, 0.45, 0),
  box(0.11, 0.34, 0.09, 0.56, 0.45, 0),
);

/** The bell. */
const BELL: Mesh = (() => {
  const pts: [number, number, number][] = [];
  const edges: [number, number][] = [];
  const N = 16;
  for (let ring = 0; ring < 3; ring++) {
    const phi = (ring / 3) * 0.9;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      pts.push([
        Math.cos(a) * Math.sin(phi + 0.35) * 0.7,
        Math.cos(phi + 0.35) * 0.7,
        Math.sin(a) * Math.sin(phi + 0.35) * 0.7,
      ]);
    }
  }
  for (let ring = 0; ring < 3; ring++) {
    for (let i = 0; i < N; i++) {
      edges.push([ring * N + i, ring * N + ((i + 1) % N)]);
      if (ring < 2 && i % 4 === 0) edges.push([ring * N + i, (ring + 1) * N + i]);
    }
  }
  return { pts, edges };
})();

/** The graduated arc the rod travels across. */
const ARC: Mesh = (() => {
  const pts: [number, number, number][] = [];
  const edges: [number, number][] = [];
  const R = 3.5;
  const SPAN = 0.46;
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 - SPAN + (i / N) * SPAN * 2;
    pts.push([Math.cos(a) * R, Math.sin(a) * R + 3.1, 0]);
    if (i > 0) edges.push([i - 1, i]);
  }
  for (let i = -4; i <= 4; i++) {
    const a = -Math.PI / 2 + (i / 4) * SPAN;
    const major = i % 2 === 0;
    const r0 = R - (major ? 0.3 : 0.16);
    const s = pts.length;
    pts.push([Math.cos(a) * r0, Math.sin(a) * r0 + 3.1, 0], [Math.cos(a) * R, Math.sin(a) * R + 3.1, 0]);
    edges.push([s, s + 1]);
  }
  return { pts, edges };
})();

/**
 * The rod, with its weight at `bobAt` — a fraction of the rod's length from
 * the pivot. Built per frame rather than once, because on a real metronome the
 * weight is what you slide to set the tempo, and a still frame of a fast
 * setting should look fast.
 */
export function rod(bobAt: number): Mesh {
  const LENGTH = 3.7;
  const BASE = 0.75;
  // 0.95 rather than 0.82: the weight uses nearly the whole shaft, so a
  // tempo change is visible without a side-by-side comparison.
  const y = BASE + (bobAt - 0.5) * LENGTH * 0.95;
  return merge(box(0.09, LENGTH, 0.09, 0, BASE, 0), box(0.58, 0.28, 0.2, 0, y, 0));
}

/** Everything that does not move, with where it sits and how bright it is. */
export const STATIC_PARTS: { geo: Mesh; at: [number, number, number]; dim: number }[] = [
  { geo: CASE, at: [0, 0, 0], dim: 0.55 },
  { geo: PLATE, at: [0, 0.1, 1.15], dim: 0.75 },
  { geo: MOVEMENT, at: [0, -0.1, 0.2], dim: 1 },
  { geo: ESCAPEMENT, at: [0, 1.1, 0.2], dim: 1 },
  { geo: ARC, at: [0, 0.1, 0.5], dim: 0.45 },
  { geo: BELL, at: [0, 2.45, -0.35], dim: 0.5 },
];

/** Where the rod hangs, and the point it pivots about. */
export const ROD_AT: [number, number, number] = [0, 0.15, 0.5];
