import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { mockListen } from "../test/mocks";
import { emitEvent } from "../test/parity/store";
import { LiveLevelBars, barsFor, levelWord } from "./LiveLevelBars";

afterEach(cleanup);

const label = (w: string) => `Input level: ${w}`;
const listened = () => mockListen.mock.calls.map(([event]) => event);

describe("the input's live level (owner, 2026-11-18)", () => {
  it("lights nothing under the noise floor, and more bars as the level rises", () => {
    expect(barsFor(0)).toBe(0);
    expect(barsFor(0.005)).toBe(0);
    expect(barsFor(0.02)).toBeGreaterThanOrEqual(1);
    expect(barsFor(0.9)).toBe(4);
    const levels = [0.02, 0.05, 0.1, 0.3, 0.9].map(barsFor);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    expect(levelWord(0)).toBe("silent");
    expect(levelWord(4)).toBe("high");
  });

  it("listens to the existing level and onset events, and draws them without re-rendering", async () => {
    mockListen.mockClear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<LiveLevelBars active label={label} />);
    const el = screen.getByTestId("live-level");
    expect(el.getAttribute("aria-label")).toBe("Input level: silent");
    expect(el.querySelectorAll("i")).toHaveLength(4);
    await act(async () => {});
    expect(listened()).toEqual(expect.arrayContaining(["audio-spectrum", "score-onset", "beat-feedback"]));
    await act(async () => {
      for (let i = 0; i < 12; i++) emitEvent("audio-spectrum", { bands: [], rms: 0.5 });
      vi.advanceTimersByTime(100);
    });
    await vi.waitFor(() => expect(Number(el.dataset.bars)).toBeGreaterThanOrEqual(3));
    expect(el.getAttribute("aria-label")).toMatch(/good|high/);
    act(() => emitEvent("score-onset", { id: 1, pass: 0, state: "hit", deviationMs: 3 }));
    expect(el.hasAttribute("data-pulse")).toBe(true);
    vi.useRealTimers();
  });

  it("off, it listens to nothing and shows no level", async () => {
    mockListen.mockClear();
    render(<LiveLevelBars active={false} label={label} />);
    await act(async () => {});
    expect(listened()).toEqual([]);
    expect(screen.getByTestId("live-level").dataset.bars).toBe("0");
  });
});
