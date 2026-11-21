/**
 * The behaviour gate of the `useSession` split (leg c5c1).
 *
 * `useSession` was one 2,295-line hook; it became a composer over
 * `usePracticeHistory` and `useToolCoach` with no behaviour change. This test
 * drives a scripted run (mount, start, play, a tip window, a grid
 * discontinuity, a Signal A tempo change, stop, the speech-started event,
 * end, unmount) and records every call the hook makes to the outside, in
 * order: each `invoke` (command and arguments), each `listen` and its
 * unlisten, each `setListening`, and what `isActive()` answers at each step.
 * The snapshot was recorded BEFORE the split, on the same branch; the split
 * must reproduce it call for call.
 *
 * Time is fake and `Math.random` is a fixed sequence, so the run is the same
 * every time; ids and wall-clock stamps are masked in the log.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { mockInvoke, mockListen, setInvokeResponse } from "../test/mocks";
import type { SessionReport } from "../types";
import { __resetCoachLoaderForTests } from "./coachLoader";
import { __resetHistoryNoticeForTests, useSession } from "./useSession";

type Evaluation = Parameters<typeof useSession>[0]["evaluation"];

const REPORT: SessionReport = {
  totalBeats: 480,
  hitsCount: 400,
  missCount: 80,
  skippedBeats: 0,
  perfectCount: 360,
  goodCount: 40,
  okCount: 0,
  meanDeviationMs: -18,
  stdDeviationMs: 5,
  meanAbsDeviationMs: 18,
  meanIntervalErrorMs: 3,
  grade: "C",
  score: 70,
  deviations: [],
  dynamicsStd: 0.1,
  meanAmplitude: 0.5,
  tempoStabilityMs: 3,
  longestStreak: 16,
  comment: "",
  insights: [],
  gridCorrelation: 0.9,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mask(value: unknown): string {
  return JSON.stringify(value, (key, v) => {
    if (key === "id" || key === "timestamp") return "<masked>";
    if (typeof v === "string" && UUID.test(v)) return "<uuid>";
    return v;
  }) ?? "undefined";
}

describe("useSession, the call log of a scripted run", () => {
  const unlisten = vi.fn((_event: string) => {});
  const step = vi.fn((_label: string) => {});
  let seed = 1;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T12:00:00Z"));
    seed = 1;
    vi.spyOn(Math, "random").mockImplementation(() => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    });
    __resetCoachLoaderForTests();
    __resetHistoryNoticeForTests();
    unlisten.mockClear();
    step.mockClear();
    mockListen.mockImplementation(async (event: string) => () => unlisten(event));
    setInvokeResponse("get_final_session_report", () => REPORT);
    setInvokeResponse("get_session_report", () => REPORT);
  });

  afterEach(() => {
    mockListen.mockImplementation(async () => () => {});
    vi.mocked(Math.random).mockRestore();
    vi.useRealTimers();
    __resetCoachLoaderForTests();
    __resetHistoryNoticeForTests();
  });

  it("makes the same calls, in the same order, as before the split", async () => {
    const setListening = vi.fn(async (_on: boolean) => {});
    const evaluation = {
      enabled: true,
      toggle: vi.fn(),
      setListening,
      selectedDevice: null,
    } as unknown as Evaluation;

    type Props = { isPlaying: boolean; bpm: number };
    const hook = renderHook(
      (props: Props) =>
        useSession({
          evaluation,
          isPlaying: props.isPlaying,
          bpm: props.bpm,
          timeSignature: 4,
          beatGroups: [4],
          presetId: "preset-split",
          presetName: "Split",
          voiceMode: "voice",
          setBpm: vi.fn(),
        }),
      { initialProps: { isPlaying: false, bpm: 100 } as Props },
    );

    const flush = async (ms = 0) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    };
    const mark = (label: string) => step(`${label} isActive=${hook.result.current.isActive()}`);
    const emit = async (event: string, payload: unknown) => {
      const calls = mockListen.mock.calls.filter(([e]) => e === event);
      const cb = calls.at(-1)?.[1] as ((e: { payload: unknown }) => void) | undefined;
      step(`emit ${event}${cb ? "" : " (no listener)"}`);
      await act(async () => {
        cb?.({ payload });
        await vi.advanceTimersByTimeAsync(0);
      });
    };

    await flush();
    mark("mounted");

    // Start: the lifecycle queue, the history loads, the input on.
    let starting: Promise<void> = Promise.resolve();
    await act(async () => {
      starting = hook.result.current.startSession();
      step(`start asked isActive=${hook.result.current.isActive()}`);
      await starting;
    });
    await flush(10);
    mark("started");

    // Play: the beat listener mounts; past the warm-up, a run of early beats.
    hook.rerender({ isPlaying: true, bpm: 100 });
    await flush(21_000);
    for (let i = 0; i < 32; i++) {
      await emit("beat-feedback", {
        beatIndex: i,
        deviationMs: -38,
        intervalErrorMs: 6,
        classification: "ok",
        amplitude: 0.5,
        calibrationOffsetMs: 0,
        calibrationConfidence: 0.9,
        gridCorrelation: 0.8,
      });
      await flush(600);
    }
    await flush(6_000);
    mark("after the beats");

    // A grid discontinuity, which the coach acknowledges by force.
    await emit("practice-segment-ended", {
      startMs: 0,
      endMs: 20_000,
      score: 41,
      componentScores: {},
      bpm: 100,
      instrument: "electric-guitar",
      presetId: "preset-split",
      endReason: "grid-discontinuity",
      onsetCount: 30,
      beatCount: 32,
      totalOnsets: 30,
      spuriousOnsets: 0,
      onsetEfficiency: 0.9,
      inferredDivisor: 1,
      inferredDivisorConfidence: 0.9,
      playMode: "structured",
    });
    await flush(6_000);
    mark("after the discontinuity");

    // Signal A: the tempo moves mid-session; the debounce settles it.
    hook.rerender({ isPlaying: true, bpm: 112 });
    await flush(3_000);
    mark("after the tempo change");

    // Stop: the falling edge closes the segment (a mini-report past 10 s).
    hook.rerender({ isPlaying: false, bpm: 112 });
    await flush(6_000);
    mark("stopped");

    // The voice starts: the reveal FIFO pops its head.
    await emit("tts-speech-started", null);
    await flush(100);

    // End: input off, the final report, the save, the summary.
    await act(async () => {
      const ending = hook.result.current.endSession();
      step(`end asked isActive=${hook.result.current.isActive()}`);
      await ending;
    });
    await flush(6_000);
    mark("ended");

    const messages = hook.result.current.messages.map((m) =>
      mask({ type: m.type, content: m.content, pending: m.pending, score: m.report?.score }),
    );

    hook.unmount();
    await flush();

    type Entry = [number, string];
    const log: Entry[] = [];
    mockInvoke.mock.calls.forEach(([cmd, args], i) =>
      log.push([mockInvoke.mock.invocationCallOrder[i], `invoke ${cmd} ${mask(args)}`]),
    );
    mockListen.mock.calls.forEach(([event], i) =>
      log.push([mockListen.mock.invocationCallOrder[i], `listen ${event}`]),
    );
    unlisten.mock.calls.forEach(([event], i) =>
      log.push([unlisten.mock.invocationCallOrder[i], `unlisten ${event}`]),
    );
    setListening.mock.calls.forEach(([on], i) =>
      log.push([setListening.mock.invocationCallOrder[i], `setListening ${on}`]),
    );
    step.mock.calls.forEach(([label], i) =>
      log.push([step.mock.invocationCallOrder[i], `-- ${label}`]),
    );
    log.sort((a, b) => a[0] - b[0]);

    expect({ calls: log.map(([, line]) => line), messages }).toMatchSnapshot();
  });
});
