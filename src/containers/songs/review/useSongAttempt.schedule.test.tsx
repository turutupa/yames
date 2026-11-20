// A stop's grade and the schedule's lifetime (HANDOFF, M7 leftovers).
//
// A stop waits up to 600 ms for the analyzer's last segment, then asks for
// the grade; both read the schedule the pass was played against. The clear on
// leaving Songs (`useScheduleLeavesWithSong`) and Songs' push of the next
// schedule (`useSongSchedulePush`) used to run in that window: leave within
// 600 ms of a stop and the grade was read off nothing; the push on the stop
// itself loaded a fresh run before the close graded the old one.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useSongAttempt } from "./useSongAttempt";
import { useScheduleLeavesWithSong } from "../useScheduleLeavesWithSong";
import { useSongSchedulePush } from "../useSongSchedulePush";
import { __resetScheduleHoldForTests, scheduleHeld } from "../../../songs/scheduleHold";
import type { PracticeSegmentEndedPayload } from "../../../ipc";
import type { SongScore } from "../../../songs/types";

const calls: string[] = [];
const segmentHandlers = new Set<(p: PracticeSegmentEndedPayload) => void>();

vi.mock("../../../ipc", () => ({
  analyzeAttempt: vi.fn(() => Promise.resolve([])),
  clearScoreSchedule: vi.fn(() => {
    calls.push("clear");
    return Promise.resolve();
  }),
  closeOpenSegment: vi.fn(() => {
    calls.push("close");
    return Promise.resolve();
  }),
  getTakeGrade: vi.fn(() => {
    calls.push("grade");
    return Promise.resolve({ score: 80 });
  }),
  getTakeGradeWithNotes: vi.fn(() => Promise.resolve(null)),
  onPracticeSegmentEnded: vi.fn((fn: (p: PracticeSegmentEndedPayload) => void) => {
    segmentHandlers.add(fn);
    return Promise.resolve(() => {
      segmentHandlers.delete(fn);
    });
  }),
  saveAttempt: vi.fn(() => {
    calls.push("save");
    return Promise.resolve();
  }),
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

const push = () => {
  calls.push("push");
  return Promise.resolve(true);
};

/** Songs as the window has it: the attempt, then the push (SongsView), and the leaving clear (MainWindow). */
type Props = { isPlaying: boolean; inSongs: boolean; screen: boolean };

function Window({ isPlaying, inSongs, screen }: Props) {
  useScheduleLeavesWithSong(inSongs);
  return screen ? <SongsScreen isPlaying={isPlaying} /> : null;
}

function mountSongs() {
  const view = render(<Window isPlaying={false} inSongs screen />);
  return { rerender: (p: Props) => view.rerender(<Window {...p} />) };
}

// The screen as a child, so it can unmount (Settings over Songs) while the window stays.
function SongsScreen({ isPlaying }: { isPlaying: boolean }) {
  useSongAttempt({
    score: SCORE,
    scoreId: "s1",
    range: { startBar: 0, endBar: 3 },
    loop: false,
    tempoPercent: 100,
    bpm: 96,
    isPlaying,
    listening: true,
  });
  useSongSchedulePush(true, isPlaying, push);
  return null;
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
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

beforeEach(() => {
  vi.useFakeTimers();
  calls.length = 0;
  segmentHandlers.clear();
  __resetScheduleHoldForTests();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a stop's grade is read before the schedule goes", () => {
  it("leaving Songs 300 ms after a stop does not clear ahead of the grade (the 600 ms case)", async () => {
    const view = mountSongs();
    await act(flush);
    view.rerender({ isPlaying: true, inSongs: true, screen: true });
    calls.length = 0;
    await act(async () => {
      view.rerender({ isPlaying: false, inSongs: true, screen: true });
      await flush();
    });
    // No segment comes (a silent Take): the stop waits out its deadline.
    await act(async () => {
      vi.advanceTimersByTime(300);
      view.rerender({ isPlaying: false, inSongs: false, screen: false });
      await flush();
    });
    expect(calls, "the leaving clear ran ahead of the grade").not.toContain("clear");
    await act(async () => {
      vi.advanceTimersByTime(400);
      await flush();
    });
    expect(calls).toEqual(["close", "grade", "clear"]);
    expect(scheduleHeld()).toBe(false);
  });

  it("the push on the stop waits for the grade, then readies the next pass", async () => {
    const view = mountSongs();
    await act(flush);
    expect(calls).toEqual(["push"]);
    view.rerender({ isPlaying: true, inSongs: true, screen: true });
    calls.length = 0;
    await act(async () => {
      view.rerender({ isPlaying: false, inSongs: true, screen: true });
      await flush();
    });
    expect(calls, "a schedule loaded before the close is a fresh run").toEqual(["close"]);
    await act(async () => {
      for (const fn of segmentHandlers) fn(segment());
      await flush();
    });
    expect(calls.slice(0, 3)).toEqual(["close", "clear", "push"]);
    expect(calls).toContain("save");
  });

  it("a retry before the grade still gets its schedule, after the old stop's clear", async () => {
    const view = mountSongs();
    await act(flush);
    view.rerender({ isPlaying: true, inSongs: true, screen: true });
    calls.length = 0;
    await act(async () => {
      view.rerender({ isPlaying: false, inSongs: true, screen: true });
      await flush();
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
      view.rerender({ isPlaying: true, inSongs: true, screen: true });
      await flush();
    });
    expect(calls).toEqual(["close"]);
    await act(async () => {
      vi.advanceTimersByTime(400);
      await flush();
    });
    expect(calls).toEqual(["close", "grade", "clear", "push"]);
  });

  it("Settings over Songs right after a stop keeps the segment, the attempt and the schedule", async () => {
    const view = mountSongs();
    await act(flush);
    view.rerender({ isPlaying: true, inSongs: true, screen: true });
    calls.length = 0;
    await act(async () => {
      view.rerender({ isPlaying: false, inSongs: true, screen: true });
      await flush();
    });
    await act(async () => {
      // Settings opens: the screen unmounts, the mode stays.
      view.rerender({ isPlaying: false, inSongs: true, screen: false });
      await flush();
    });
    expect(segmentHandlers.size, "the listener went with the screen").toBe(1);
    await act(async () => {
      for (const fn of [...segmentHandlers]) fn(segment());
      await flush();
    });
    expect(calls).toEqual(["close", "clear", "save"]);
    expect(segmentHandlers.size, "the listener outlived its stop").toBe(0);
    // And back: the screen pushes the schedule again.
    await act(async () => {
      view.rerender({ isPlaying: false, inSongs: true, screen: true });
      await flush();
    });
    expect(calls.at(-1)).toBe("push");
  });

  it("closing the song during the wait: the stop's own clear, and no push after it", async () => {
    const view = mountSongs();
    await act(flush);
    view.rerender({ isPlaying: true, inSongs: true, screen: true });
    calls.length = 0;
    await act(async () => {
      view.rerender({ isPlaying: false, inSongs: true, screen: true });
      await flush();
    });
    await act(async () => {
      view.rerender({ isPlaying: false, inSongs: false, screen: false });
      await flush();
    });
    await act(async () => {
      vi.advanceTimersByTime(700);
      await flush();
    });
    expect(calls).toEqual(["close", "grade", "clear"]);
  });

  it("with nothing held, leaving clears at once", async () => {
    const view = mountSongs();
    await act(flush);
    calls.length = 0;
    await act(async () => {
      view.rerender({ isPlaying: false, inSongs: false, screen: false });
      await flush();
    });
    expect(calls).toEqual(["clear"]);
  });
});
