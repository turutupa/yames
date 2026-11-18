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

const notesIn = (container: Element) => [...container.querySelectorAll<SVGGElement>(".tabstrip-note")];
const colX = (container: HTMLElement) => {
  const t = container.querySelector<HTMLElement>(".tabstrip-cursor")!.style.transform;
  return Number(/translate3d\((-?[\d.]+)px/.exec(t)?.[1]);
};
const seg = (container: HTMLElement, rel: string) => container.querySelector<SVGSVGElement>(`.tabstrip-seg[data-rel="${rel}"]`);

describe("TabStrip", () => {
  it("names the pattern for a screen reader", () => {
    render(<TabStrip notes={lick} barTicks={BAR} patternBars={2} position={0} playing={false} mode="preview" />);
    const strip = screen.getByRole("img");
    expect(strip.getAttribute("aria-label")).toBe(
      "Tab: e5 e7 e8 e7 e5 e3 e5 e3 | B5 B7 B8 B10 B8 B7 B5 B7",
    );
  });

  it("previews the whole pattern, every bar numbered, no column", () => {
    const { container } = render(
      <TabStrip notes={lick} barTicks={BAR} patternBars={2} takeBars={10} position={0} playing={false} mode="preview" />,
    );
    expect(notesIn(container)).toHaveLength(16);
    const labels = [...container.querySelectorAll(".tabstrip-label")].map((l) => l.textContent);
    expect(labels).toEqual(["bar 1", "bar 2"]);
    expect(container.querySelector(".tabstrip-cursor")).toBeNull();
    expect(container.querySelector(".tabstrip-note[data-current]")).toBeNull();
  });

  it("marks where it was paused in the overview", () => {
    const { container } = render(
      <TabStrip notes={lick} barTicks={BAR} patternBars={2} position={0} marker={BAR + 2 * 480 + 10} playing={false} mode="preview" />,
    );
    const marked = seg(container, "mark")!;
    expect(marked.querySelector(".tabstrip-label")?.textContent).toBe("paused here · bar 2");
    expect(marked.querySelector<SVGGElement>(".tabstrip-note[data-current]")?.dataset.id).toBe("10");
    expect(marked.querySelector(".tabstrip-mark")).not.toBeNull();
  });

  it("follows: now and next labelled, the column on the current note, the next bar dimmed", () => {
    const { container } = render(
      <TabStrip notes={lick} barTicks={BAR} patternBars={2} takeBars={10} position={3 * 480 + 10} playing={false} mode="follow" />,
    );
    expect(seg(container, "now")!.querySelector(".tabstrip-label")?.textContent).toBe("now · bar 1");
    expect(seg(container, "next")!.querySelector(".tabstrip-label")?.textContent).toBe("next · bar 2");
    const current = container.querySelectorAll<SVGGElement>(".tabstrip-note[data-current]");
    expect(current).toHaveLength(1);
    expect(current[0].dataset.id).toBe("3");
    const x = Number(current[0].querySelector("text")!.getAttribute("x"));
    expect(colX(container)).toBeCloseTo(x, 0);
  });

  it("turns the page at the bar line: the next bar becomes now", () => {
    const { container, rerender } = render(
      <TabStrip notes={lick} barTicks={BAR} patternBars={2} takeBars={10} position={100} playing={false} mode="follow" />,
    );
    expect(seg(container, "now")!.dataset.seg).toBe("0");
    act(() => {
      rerender(
        <TabStrip notes={lick} barTicks={BAR} patternBars={2} takeBars={10} position={BAR + 100} playing={false} mode="follow" />,
      );
    });
    expect(seg(container, "now")!.dataset.seg).toBe("1");
    expect(seg(container, "next")!.dataset.seg).toBe("2");
  });

  it("repeats the pattern past its own length, ids running on, never past the Take", () => {
    const { container } = render(
      <TabStrip notes={lick} barTicks={BAR} patternBars={2} takeBars={10} position={5 * BAR + 10} playing={false} mode="follow" />,
    );
    const now = seg(container, "now")!;
    expect(now.querySelector(".tabstrip-label")?.textContent).toBe("now · bar 2");
    const ids = notesIn(container).map((n) => Number(n.dataset.id));
    expect(ids).toContain(5 * 8);
    expect(container.querySelector('.tabstrip-note[data-id="40"] text')?.textContent).toBe("5");
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
    const state = (id: number) => container.querySelector<SVGGElement>(`.tabstrip-note[data-id="${id}"]`)?.dataset.result;
    expect([0, 1, 2, 3, 4].map(state)).toEqual(["good", "early", "late", "miss", undefined]);
    rerender(
      <TabStrip notes={lick} barTicks={BAR} patternBars={2} position={2000} playing={false} mode="follow" results={new Map()} />,
    );
    expect(state(0)).toBeUndefined();
  });

  it("moves the column on animation frames without redrawing the bar", () => {
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
    const x0 = colX(container);
    tick = 1000;
    step(32);
    const x1 = colX(container);
    expect(x1).toBeGreaterThan(x0);
    expect(container.querySelector(".tabstrip-note")).toBe(before);
    raf.mockRestore();
    caf.mockRestore();
  });
});
