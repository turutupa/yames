import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MetronomeFigure } from "./MetronomeFigure";

/**
 * While the metronome runs, the weight on the rod is painted solid; stopped,
 * the whole figure is line. The look itself is judged by eye (the mockups in
 * `.claude/mockups/pendulum-*`), but the WHEN is a contract: a solid that
 * showed up on a stopped figure would make the sketch heavier all day, and
 * one that did not clear the lines under it would be a glass box. And under
 * reduced motion nothing runs, so nothing is solid.
 *
 * jsdom has no canvas, so the context is a stub that records what was asked
 * of it. `globalCompositeOperation` is a recording property because the
 * clearing pass is only visible as a mode change — the fill calls look the
 * same either way.
 */

function stubContext() {
  const composites: string[] = [];
  let composite = "source-over";
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    lineCap: "",
    lineJoin: "",
    shadowBlur: 0,
    shadowColor: "",
    get globalCompositeOperation() {
      return composite;
    },
    set globalCompositeOperation(v: string) {
      composite = v;
      composites.push(v);
    },
    composites,
  };
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never;
  HTMLElement.prototype.getBoundingClientRect = vi.fn(
    () => ({ width: 400, height: 500, top: 0, left: 0, right: 400, bottom: 500, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
  );
  return ctx;
}

function prefersReducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches, addEventListener() {}, removeEventListener() {} })),
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  prefersReducedMotion(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the solid weight", () => {
  it("is painted while the metronome runs, over lines cleared from under it", () => {
    const ctx = stubContext();
    render(<MetronomeFigure bpm={120} isPlaying={true} currentBeat={null} />);
    // The first frame is drawn synchronously on mount.
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.composites).toContain("destination-out");
    // ...and the mode is put back, or the next frame's lines would erase.
    expect(ctx.globalCompositeOperation).toBe("source-over");
  });

  it("is not painted while stopped: a stopped figure is all line", () => {
    const ctx = stubContext();
    render(<MetronomeFigure bpm={120} isPlaying={false} currentBeat={null} />);
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.composites).not.toContain("destination-out");
  });

  it("is not painted under reduced motion, where nothing runs", () => {
    prefersReducedMotion(true);
    const ctx = stubContext();
    render(<MetronomeFigure bpm={120} isPlaying={true} currentBeat={null} />);
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.fill).not.toHaveBeenCalled();
  });
});
