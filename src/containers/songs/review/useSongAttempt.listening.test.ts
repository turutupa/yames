// Stopping a song nobody was listening to.
//
// The owner, 2026-09-21: "when i hit pause it says 'listening back...' for
// like half a second and then re-renders the tabs". His input was off. The
// hook closed a segment that did not exist, waited out its deadline for an
// event that could not come, and showed a status line for the whole of it —
// and that line, being a paragraph inside the tab's frame, cost the tab a
// line of height twice, so the whole piece was laid out again twice.
//
// The line floats over the frame now (`songs-review.css`), which is the half a
// stylesheet can promise. This is the other half: with nothing listening,
// a stop says nothing and waits for nothing.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSongAttempt } from "./useSongAttempt";
import { clearScoreSchedule, closeOpenSegment } from "../../../ipc";
import type { SongScore } from "../../../songs/types";

vi.mock("../../../ipc", () => ({
  analyzeAttempt: vi.fn(() => Promise.resolve([])),
  clearScoreSchedule: vi.fn(() => Promise.resolve()),
  closeOpenSegment: vi.fn(() => Promise.resolve()),
  onPracticeSegmentEnded: vi.fn(() => Promise.resolve(() => {})),
  saveAttempt: vi.fn(() => Promise.resolve()),
  scoreTimingBands: vi.fn(() => Promise.resolve(null)),
}));

const SCORE: SongScore = {
  schema: 1,
  id: "s1",
  title: "Practice piece",
  artist: "",
  source: { fileName: "p.alphatex", format: "alphatex", trackIndex: 0, trackName: "Guitar" },
  tuning: [64, 59, 55, 50, 45, 40],
  capo: 0,
  ticksPerQuarter: 960,
  tempoMap: [{ tick: 0, bpm: 96 }],
  meterMap: [{ bar: 0, numerator: 4, denominator: 4 }],
  bars: Array.from({ length: 4 }, (_, i) => ({
    index: i,
    startTick: i * 3840,
    lengthTicks: 3840,
    printedBar: i,
  })),
  notes: [],
  sections: [],
};

function mount(listening: boolean) {
  const base = {
    score: SCORE,
    scoreId: "s1",
    range: { startBar: 0, endBar: 3 },
    loop: false,
    tempoPercent: 100,
    bpm: 96,
    listening,
  };
  return renderHook(({ isPlaying }) => useSongAttempt({ ...base, isPlaying }), {
    initialProps: { isPlaying: false },
  });
}

describe("stopping a song with the input off", () => {
  beforeEach(() => {
    vi.mocked(closeOpenSegment).mockClear();
    vi.mocked(clearScoreSchedule).mockClear();
  });

  it("never says it is listening back, and waits for nothing", async () => {
    const hook = mount(false);
    hook.rerender({ isPlaying: true });
    const said: boolean[] = [];
    await act(async () => {
      hook.rerender({ isPlaying: false });
      said.push(hook.result.current.working);
      await Promise.resolve();
      said.push(hook.result.current.working);
    });
    expect(said, "it said it was listening back to a pass nobody heard").toEqual([false, false]);
    expect(hook.result.current.review).toBeNull();
    expect(closeOpenSegment, "it waited on a segment nobody was producing").not.toHaveBeenCalled();
    // The run is still cleared: an attempt is play-to-stop, heard or not.
    expect(clearScoreSchedule).toHaveBeenCalledTimes(1);
  });

  it("still listens back when the input is on", async () => {
    const hook = mount(true);
    hook.rerender({ isPlaying: true });
    await act(async () => {
      hook.rerender({ isPlaying: false });
      await Promise.resolve();
    });
    expect(closeOpenSegment).toHaveBeenCalledTimes(1);
  });
});
