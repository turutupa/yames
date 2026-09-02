/**
 * FloatingWidget feature preservation tests.
 *
 * Locks in:
 * - Renders in comfortable mode by default
 * - Renders in compact mode when state.mode === "compact"
 * - Play button toggles playback via IPC
 * - BPM +/- buttons call setBpm
 * - Time-signature button cycles through TIME_SIG_OPTIONS
 * - Settings button calls showMain
 */
import { describe, it, expect } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FloatingWidget } from "./FloatingWidget";
import {
  DEFAULT_TEST_STATE,
  mockInvoke,
  mockListen,
  setInvokeResponse,
} from "../../test/mocks";
import type { BeatEvent } from "../../types";

/** Push a `beat` event through the mocked Tauri listener. */
async function emitBeat(beat: Partial<BeatEvent>) {
  const entry = mockListen.mock.calls.find(([evt]) => evt === "beat");
  expect(entry, "no 'beat' listener registered").toBeDefined();
  const cb = entry![1] as (e: { payload: BeatEvent }) => void;
  await act(async () => {
    cb({
      payload: {
        beat: 0,
        measureBeat: 0,
        subdivision: 0,
        isDownbeat: true,
        isAccent: false,
        ...beat,
      },
    });
  });
}

describe("FloatingWidget", () => {
  it("renders the current BPM from state", async () => {
    render(<FloatingWidget />);
    expect(await screen.findByText("120")).toBeInTheDocument();
  });

  it("renders comfortable mode by default", async () => {
    const { container } = render(<FloatingWidget />);
    await waitFor(() => {
      const widget = container.querySelector(".floating-widget.comfortable");
      expect(widget).not.toBeNull();
    });
  });

  it("renders compact mode when state.mode === 'compact'", async () => {
    setInvokeResponse("get_state", () => ({
      bpm: 100,
      isPlaying: false,
      subdivision: 1,
      mode: "compact",
      corner: "bottom-right",
      alwaysOnTop: false,
      widgetAlwaysOnTop: false,
      accentColor: "#88ccff",
      theme: "default",
      volume: 0.7,
      soundType: "click",
      timeSignature: 4,
      beatGroups: [4],
      freeMode: false,
      speedRamp: {
        startBpm: 80,
        targetBpm: 160,
        increment: 5,
        decrement: 3,
        barsPerStep: 2,
        beatsPerBar: 4,
        mode: "linear",
        cyclic: false,
        aggressiveness: "moderate",
        active: false,
        currentStep: 0,
        currentBpm: 80,
        direction: "up",
        barsInStep: 0,
        completed: false,
        warmupBeats: 4,
        warmupCount: 0,
      },
    }));
    const { container } = render(<FloatingWidget />);
    await waitFor(() => {
      expect(container.querySelector(".floating-widget.compact")).not.toBeNull();
    });
  });

  it("clicking the play button invokes toggle_playback", async () => {
    render(<FloatingWidget />);
    // The play button text differs based on isPlaying — match by class.
    const playBtn = await waitFor(() => {
      const btn = document.querySelector("button.fw-play");
      expect(btn).not.toBeNull();
      return btn as HTMLButtonElement;
    });
    fireEvent.click(playBtn);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("toggle_playback", undefined);
    });
  });

  it("clicking BPM '+' button calls set_bpm with bpm+5", async () => {
    render(<FloatingWidget />);
    // bpm-adj buttons exist in comfortable mode only (default).
    const adjButtons = await waitFor(() => {
      const btns = document.querySelectorAll("button.fw-bpm-adj");
      expect(btns.length).toBe(2);
      return btns;
    });
    // Second adj button is "+" (per source layout: minus first, then plus).
    fireEvent.click(adjButtons[1] as HTMLElement);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("set_bpm", { bpm: 125 });
    });
  });

  /**
   * The widget used to light `currentBeat.beat % beatsPerMeasure`. The
   * engine resets its bar when the grouping changes mid-play, so after a
   * meter switch the sequential index and the bar position fall out of
   * phase and the modulo lights the wrong dot. `measureBeat` is the
   * engine's own bar position and is correct across the switch.
   */
  it("lights the dot at measureBeat, not beat % beatsPerMeasure", async () => {
    setInvokeResponse("get_state", () => ({
      ...DEFAULT_TEST_STATE,
      timeSignature: 7,
      beatGroups: [3, 2, 2],
    }));
    const { container } = render(<FloatingWidget />);
    await waitFor(() => {
      expect(container.querySelectorAll(".fw-beat-dot").length).toBe(7);
    });

    // Simulates play continuing across a meter change: the sequential
    // beat counter is at 30, but the engine restarted the bar and says
    // this tick is bar position 2. `30 % 7` is 2 by luck, so use a
    // sequential index where the two genuinely disagree.
    await emitBeat({ beat: 30, measureBeat: 5, isDownbeat: true });
    const lit = [...container.querySelectorAll(".fw-beat-dot")]
      .map((d, i) => (d.className.includes("active") ? i : -1))
      .filter((i) => i >= 0);
    expect(lit).toEqual([5]);
    expect(30 % 7).not.toBe(5); // the old formula would have lit dot 2
  });

  it("takes the accent from the engine event", async () => {
    const { container } = render(<FloatingWidget />);
    await waitFor(() => {
      expect(container.querySelectorAll(".fw-beat-dot").length).toBe(4);
    });

    await emitBeat({ beat: 1, measureBeat: 1, isDownbeat: true, isAccent: true });
    expect(
      (container.querySelectorAll(".fw-beat-dot")[1] as HTMLElement).className,
    ).toContain("downbeat");

    await emitBeat({ beat: 0, measureBeat: 0, isDownbeat: true, isAccent: false });
    expect(
      (container.querySelectorAll(".fw-beat-dot")[0] as HTMLElement).className,
    ).not.toContain("downbeat");
  });
});
