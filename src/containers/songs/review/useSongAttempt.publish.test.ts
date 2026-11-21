// A settled Songs pass tells the coach's bus, once (c5a2, DESIGN 9.2).
//
// `songPassReviewed` goes out when a pass settles with a review, after the
// stop, never while the transport runs; once per pass; and only from Songs:
// a Session runs its Takes through the same hook and publishes its own
// `takeResult`, so it leaves `publishPass` off.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSongAttempt } from "./useSongAttempt";
import { resetCoachBus, subscribe } from "../../../coach/bus";
import type { Delivered } from "../../../coach/bus";
import type { PracticeSegmentEndedPayload } from "../../../ipc";
import type { SongScore } from "../../../songs/types";

const segmentHandlers = new Set<(p: PracticeSegmentEndedPayload) => void>();

vi.mock("../../../ipc", () => ({
  analyzeAttempt: vi.fn(() => Promise.resolve([])),
  clearScoreSchedule: vi.fn(() => Promise.resolve()),
  closeOpenSegment: vi.fn(() => {
    // The engine answers a forced close with the run's last segment, on its
    // own loop's tick: after the stop has started waiting for it.
    setTimeout(() => {
      for (const fn of segmentHandlers) fn(segment());
    }, 0);
    return Promise.resolve();
  }),
  getTakeGrade: vi.fn(() => Promise.resolve(null)),
  getTakeGradeWithNotes: vi.fn(() => Promise.resolve(null)),
  onPracticeSegmentEnded: vi.fn((fn: (p: PracticeSegmentEndedPayload) => void) => {
    segmentHandlers.add(fn);
    return Promise.resolve(() => {
      segmentHandlers.delete(fn);
    });
  }),
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
  bars: Array.from({ length: 4 }, (_, i) => ({ index: i, startTick: i * 3840, lengthTicks: 3840, printedBar: i })),
  notes: [],
  sections: [],
};

function segment(): PracticeSegmentEndedPayload {
  return {
    startMs: 0,
    endMs: 4000,
    score: 80,
    bpm: 96,
    onsetResults: Array.from({ length: 10 }, (_, id) => ({ id, state: "hit" as const, deviationMs: 0, pass: 0 })),
  } as unknown as PracticeSegmentEndedPayload;
}

function mount(publishPass: boolean | undefined) {
  const base = {
    score: SCORE,
    scoreId: "s1",
    range: { startBar: 0, endBar: 3 },
    loop: false,
    tempoPercent: 100,
    bpm: 96,
    listening: true,
    ...(publishPass === undefined ? {} : { publishPass }),
  };
  return renderHook(({ isPlaying }) => useSongAttempt({ ...base, isPlaying }), {
    initialProps: { isPlaying: false },
  });
}

const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 5));
};

let heard: Delivered[] = [];
let unsubscribe: () => void = () => {};

beforeEach(() => {
  resetCoachBus();
  segmentHandlers.clear();
  heard = [];
  unsubscribe = subscribe((e) => heard.push(e));
});
afterEach(() => {
  unsubscribe();
});

async function playAndStop(hook: ReturnType<typeof mount>) {
  await act(async () => {
    hook.rerender({ isPlaying: true });
    await flush();
  });
  const whilePlaying = heard.length;
  await act(async () => {
    hook.rerender({ isPlaying: false });
    await flush();
  });
  // The stop settles when the last segment arrives (or on its deadline).
  await waitFor(() => expect(hook.result.current.review).not.toBeNull(), { timeout: 3000 });
  await act(flush);
  return whilePlaying;
}

describe("songPassReviewed", () => {
  it("is published once when a Songs pass settles, with the review the screen draws", async () => {
    const hook = mount(true);
    await act(flush);
    const whilePlaying = await playAndStop(hook);
    expect(whilePlaying, "something was published while the pass ran").toBe(0);
    const passes = heard.filter((e) => e.type === "songPassReviewed");
    expect(passes).toHaveLength(1);
    const review = hook.result.current.review;
    expect(review).not.toBeNull();
    expect(passes[0].type === "songPassReviewed" && passes[0].review).toBe(review);
    // A re-render with nothing new says nothing more.
    await act(async () => {
      hook.rerender({ isPlaying: false });
      await flush();
    });
    expect(heard.filter((e) => e.type === "songPassReviewed")).toHaveLength(1);
  });

  it("is published once per pass: a second pass is a second event", async () => {
    const hook = mount(true);
    await act(flush);
    await playAndStop(hook);
    await playAndStop(hook);
    const passes = heard.filter((e) => e.type === "songPassReviewed");
    expect(passes).toHaveLength(2);
    expect(passes[0].type === "songPassReviewed" && passes[1].type === "songPassReviewed" && passes[0].review.attemptId).not.toBe(
      passes[1].type === "songPassReviewed" && passes[1].review.attemptId,
    );
  });

  it("is not published by a caller that leaves it off (a Session's Takes)", async () => {
    const hook = mount(undefined);
    await act(flush);
    await playAndStop(hook);
    expect(hook.result.current.review).not.toBeNull();
    expect(heard).toHaveLength(0);
  });
});
