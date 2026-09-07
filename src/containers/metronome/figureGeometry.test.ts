import { describe, it, expect } from "vitest";
import { STATIC_PARTS, rod, ROD_AT } from "./figureGeometry";

/**
 * The figure is redrawn every frame while the metronome plays, and every edge
 * is its own `beginPath`/`stroke` because each one is shaded by its own depth.
 * That makes the edge count the cost, and the cost is being paid on the same
 * main thread as the beat dots and the transport.
 *
 * The audio itself is safe either way — it runs on the Rust side — but a
 * figure that is scenery has no business making the thing it sits behind
 * stutter. So the count is a budget, and adding a part that doubles it should
 * fail here rather than be discovered as jank on someone's laptop.
 */

const staticEdges = STATIC_PARTS.reduce((n, p) => n + p.geo.edges.length, 0);
const rodEdges = rod(0.6).edges.length;

describe("the figure's geometry", () => {
  it("stays inside its per-frame budget", () => {
    const total = staticEdges + rodEdges;
    // Roughly 1,200 line segments a frame at 60fps. Measured against the
    // marketing site's figure, which draws about the same and holds 60 on a
    // laptop — with an explode animation this one does not have.
    expect(total).toBeLessThan(1400);
    // A floor too: if this collapses, a part has silently stopped being built.
    expect(total).toBeGreaterThan(400);
  });

  it("is all there — every part contributes something", () => {
    for (const part of STATIC_PARTS) {
      expect(part.geo.pts.length, "a part with no points").toBeGreaterThan(0);
      expect(part.geo.edges.length, "a part with no edges").toBeGreaterThan(0);
    }
    expect(STATIC_PARTS).toHaveLength(6);
  });

  it("indexes every edge into a point that exists", () => {
    // `merge` rebases indices, and an off-by-one there draws a line to
    // undefined — which canvas renders as nothing rather than as an error.
    const meshes = [...STATIC_PARTS.map((p) => p.geo), rod(0.5)];
    for (const m of meshes) {
      for (const [a, b] of m.edges) {
        expect(m.pts[a]).toBeDefined();
        expect(m.pts[b]).toBeDefined();
      }
    }
  });

  it("moves the weight along the rod and nothing else", () => {
    // The bob is what you slide to set the tempo, so a still frame of a fast
    // setting looks fast. The rod itself must not change length with it.
    const slow = rod(0.86);
    const fast = rod(0.42);
    expect(slow.pts.length).toBe(fast.pts.length);

    const spanY = (m: ReturnType<typeof rod>) => {
      const ys = m.pts.map((p) => p[1]);
      return Math.max(...ys) - Math.min(...ys);
    };
    // The shaft is the same; only where the weight sits differs.
    expect(Math.abs(spanY(slow) - spanY(fast))).toBeLessThan(1.6);

    const bobY = (m: ReturnType<typeof rod>) => {
      // The weight is the wide box: find the points that are off the shaft.
      const wide = m.pts.filter((p) => Math.abs(p[0]) > 0.1);
      return wide.reduce((s, p) => s + p[1], 0) / wide.length;
    };
    expect(bobY(slow)).toBeGreaterThan(bobY(fast));
  });

  it("hangs the rod where the case can hold it", () => {
    // The pivot sits inside the case's footprint, not out in space.
    expect(Math.abs(ROD_AT[0])).toBeLessThan(1);
    expect(Math.abs(ROD_AT[1])).toBeLessThan(2);
  });
});
