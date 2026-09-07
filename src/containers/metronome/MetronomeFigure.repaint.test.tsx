import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { MetronomeFigure } from "./MetronomeFigure";

/**
 * The figure has to repaint when the theme changes.
 *
 * `rgb()` inside the renderer reads the ink tokens live, so any frame drawn
 * after a theme change is correct — but a STOPPED figure only draws on mount,
 * on a resize, and on a tempo change, and none of those fire when someone
 * picks a new theme. The canvas kept the previous theme's ink until something
 * else happened to ask for a frame. Dark to light left near-white lines on
 * cream and the sketch disappeared; loading straight into the light theme drew
 * it correctly, which is why it survived so long — the bug is only reachable
 * by changing theme with the figure already on screen.
 *
 * jsdom has no canvas implementation, so the context is stubbed and the test
 * counts strokes. That is enough: the question here is whether a frame is
 * ASKED for, not what it contains.
 */

/** Every canvas call the component makes, so a stub can absorb them. */
function stubContext() {
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    closePath: vi.fn(),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    shadowBlur: 0,
    shadowColor: "",
    globalAlpha: 1,
  };
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never;
  // A zero-sized canvas draws nothing, and jsdom reports zero for everything.
  HTMLElement.prototype.getBoundingClientRect = vi.fn(
    () => ({ width: 400, height: 500, top: 0, left: 0, right: 400, bottom: 500, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect,
  );
  return ctx;
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute("data-theme");
});

describe("the figure and the theme", () => {
  it("redraws when the theme writes new ink onto the root", async () => {
    const ctx = stubContext();
    render(<MetronomeFigure bpm={120} isPlaying={false} currentBeat={null} />);
    expect(ctx.stroke.mock.calls.length).toBeGreaterThan(0);

    ctx.stroke.mockClear();
    // What `applyTheme` actually does: set the tokens on the root element.
    await act(async () => {
      document.documentElement.style.setProperty("--text-primary", "#101010");
      document.documentElement.dataset.theme = "manuscript";
      // MutationObserver delivers on a microtask.
      await Promise.resolve();
    });
    expect(
      ctx.stroke.mock.calls.length,
      "a theme change must ask for a fresh frame",
    ).toBeGreaterThan(0);
  });

  it("stops watching when it unmounts", async () => {
    const ctx = stubContext();
    const { unmount } = render(
      <MetronomeFigure bpm={120} isPlaying={false} currentBeat={null} />,
    );
    unmount();
    ctx.stroke.mockClear();
    await act(async () => {
      document.documentElement.style.setProperty("--text-primary", "#202020");
      await Promise.resolve();
    });
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});
