import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { TabStrip } from "./TabStrip";
import type { TabResult } from "./TabStrip";

const BAR = 3840;
const lick = [5, 7, 8, 7, 5, 3, 5, 3, 5, 7, 8, 10, 8, 7, 5, 7].map((fret, i) => ({
  string: i < 8 ? 1 : 2,
  fret,
  tick: i * 480,
  dur: 480,
}));

let rect: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // happy-dom measures nothing: give the view a width so the notes draw.
  rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: 1300, bottom: 320, width: 1300, height: 320, toJSON: () => ({}),
  } as DOMRect);
});
afterEach(() => rect.mockRestore());

const notesIn = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>(".tabstrip-note")];
const transformX = (container: HTMLElement) => {
  const t = container.querySelector<HTMLElement>(".tabstrip-strip")!.style.transform;
  return Number(/translate3d\((-?[\d.]+)px/.exec(t)?.[1]);
};

describe("TabStrip", () => {
  it("names the pattern for a screen reader", () => {
    render(<TabStrip notes={lick} barTicks={BAR} patternBars={2} position={0} playing={false} mode="preview" />);
    const strip = screen.getByRole("img");
    expect(strip.getAttribute("aria-label")).toBe(
      "Tab: e5 e7 e8 e7 e5 e3 e5 e3 | B5 B7 B8 B10 B8 B7 B5 B7",
    );
  });

  it("previews one pass with every note numbered in order, no cursor", () => {
    const { container } = render(
      <TabStrip notes={lick} barTicks={BAR} patternBars={2} takeBars={10} position={0} playing={false} mode="preview" />,
    );
    expect(notesIn(container)).toHaveLength(16);
    const badges = [...container.querySelectorAll(".tabstrip-order")].map((b) => b.textContent);
    expect(badges).toEqual(Array.from({ length: 16 }, (_u, i) => String(i + 1)));
    expect(container.querySelector(".tabstrip-cursor")).toBeNull();
  });

  it("follows: the strip is offset so the position sits under the column", () => {
    const { container, rerender } = render(
      <TabStrip notes={lick} barTicks={BAR} patternBars={2} takeBars={10} position={0} playing={false} mode="follow" />,
    );
    const cursor = container.querySelector<HTMLElement>(".tabstrip-cursor")!;
    const cursorX = parseFloat(cursor.style.left);
    expect(cursorX).toBe(390);
    expect(transformX(container)).toBeCloseTo(390, 0);
    rerender(
      <TabStrip notes={lick} barTicks={BAR} patternBars={2} takeBars={10} position={BAR} playing={false} mode="follow" />,
    );
    // A bar is (1300 - 390) / 2 px wide.
    expect(transformX(container)).toBeCloseTo(390 - 455, 0);
  });

  it("emphasises the current note and dims the next bar", () => {
    const { container } = render(
      <TabStrip notes={lick} barTicks={BAR} patternBars={2} takeBars={10} position={3 * 480 + 10} playing={false} mode="follow" />,
    );
    const current = container.querySelectorAll<HTMLElement>(".tabstrip-note[data-current]");
    expect(current).toHaveLength(1);
    expect(current[0].dataset.id).toBe("3");
    const rel = (bar: number) => container.querySelector<HTMLElement>(`.tabstrip-bar[data-bar="${bar}"]`)?.dataset.rel;
    expect(rel(0)).toBe("now");
    expect(rel(1)).toBe("next");
  });

  it("repeats the pattern past its own length, ids running on", () => {
    const { container } = render(
      <TabStrip notes={lick} barTicks={BAR} patternBars={2} takeBars={10} position={5 * BAR} playing={false} mode="follow" />,
    );
    const ids = notesIn(container).map((n) => Number(n.dataset.id));
    expect(ids).toContain(5 * 8); // bar 5's first note: pass 2, index 8
    const first = container.querySelector<HTMLElement>('.tabstrip-note[data-id="40"]')!;
    expect(first.textContent).toBe("5");
    expect(container.querySelector<HTMLElement>('.tabstrip-bar[data-bar="5"]')?.dataset.rel).toBe("now");
    // And never past the Take's end.
    expect(Math.max(...ids)).toBeLessThan(10 * 8);
  });

  it("colours played notes by their result", () => {
    const results = new Map<number, TabResult>([
      [0, "good"],
      [1, "early"],
      [2, "late"],
      [3, "miss"],
    ]);
    const { container, rerender } = render(
      <TabStrip notes={lick} barTicks={BAR} patternBars={2} position={2000} playing={false} mode="follow" results={results} />,
    );
    const state = (id: number) => container.querySelector<HTMLElement>(`.tabstrip-note[data-id="${id}"]`)?.dataset.result;
    expect([0, 1, 2, 3, 4].map(state)).toEqual(["good", "early", "late", "miss", undefined]);
    rerender(
      <TabStrip notes={lick} barTicks={BAR} patternBars={2} position={2000} playing={false} mode="follow" results={new Map()} />,
    );
    expect(state(0)).toBeUndefined();
  });

  it("moves on animation frames without re-rendering React", () => {
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    const caf = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    let tick = 100;
    const position = () => tick;
    const { container } = render(
      <TabStrip notes={lick} barTicks={BAR} patternBars={2} takeBars={10} position={position} playing mode="follow" />,
    );
    const before = container.querySelector(".tabstrip-note");
    const step = (now: number) => act(() => frames.shift()?.(now));
    step(16);
    const x0 = transformX(container);
    tick = 400;
    step(32);
    const x1 = transformX(container);
    expect(x1).toBeLessThan(x0);
    expect(x0 - x1).toBeCloseTo(300 * (910 / (2 * BAR)), 0);
    // Same nodes: the frame wrote a transform, it did not redraw the strip.
    expect(container.querySelector(".tabstrip-note")).toBe(before);
    raf.mockRestore();
    caf.mockRestore();
  });

  it("steps note to note under prefers-reduced-motion", () => {
    const mm = vi.spyOn(window, "matchMedia").mockImplementation(
      (q: string) =>
        ({
          matches: q.includes("reduce"),
          media: q,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    const { container, rerender } = render(
      <TabStrip notes={lick} barTicks={BAR} patternBars={2} position={490} playing={false} mode="follow" />,
    );
    const at480 = transformX(container);
    rerender(<TabStrip notes={lick} barTicks={BAR} patternBars={2} position={560} playing={false} mode="follow" />);
    expect(transformX(container)).toBe(at480);
    expect(container.querySelector(".tabstrip")!.hasAttribute("data-reduced")).toBe(true);
    mm.mockRestore();
  });
});
