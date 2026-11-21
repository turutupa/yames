/**
 * A note's chip answered from the app's own words is spoken through the same
 * reveal queue as every other line (leg pol2, item 4; review c2a2, note 7).
 *
 * Speech is one at a time on the Rust side, and each `tts-speech-started`
 * reveals the head of the queue. The chip's answer used to be spoken outside
 * the queue: its own start event then revealed whatever line was waiting
 * behind it, before that line's voice had begun, so the two answers read as
 * if spoken over each other.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { mockListen, setInvokeResponse } from "../test/mocks";
import type { FeedMessage } from "../types";
import { usePracticeHistoryState } from "./usePracticeHistory";
import { useToolCoach } from "./useToolCoach";
import { __resetAskStoreForTests } from "../containers/coach/askStore";

type Evaluation = Parameters<typeof useToolCoach>[0]["evaluation"];

function mount() {
  const evaluation = { enabled: false, toggle: vi.fn(), setListening: vi.fn(async () => {}), selectedDevice: null } as unknown as Evaluation;
  return renderHook(() => {
    const history = usePracticeHistoryState({ bpm: 100, isPlaying: false });
    return useToolCoach({
      evaluation,
      isPlaying: false,
      bpm: 100,
      timeSignature: 4,
      voiceMode: "voice",
      coachVerbosity: "default",
      coachMode: "default",
      coachStance: "strict",
      instrument: "electric-guitar",
      inDrillRamp: false,
      drillCompleted: false,
      jamMode: false,
      hushed: false,
      instrumentLabel: "electric guitar",
      vocab: "electric-guitar",
      active: history.active,
      startedAt: history.startedAt,
      playBpmRef: history.playBpmRef,
      segmentReportsRef: history.segmentReportsRef,
      segmentStartRef: history.segmentStartRef,
      coachLoadedRef: history.coachLoadedRef,
      sessionIdRef: history.sessionIdRef,
      activeRef: history.activeRef,
      quietRef: history.quietRef,
      modelMaySpeak: history.modelMaySpeak,
    });
  });
}

describe("a chip's spoken answer, in the reveal queue", () => {
  let speeches: Array<() => void> = [];

  beforeEach(() => {
    __resetAskStoreForTests();
    speeches = [];
    // Speech never finishes on its own: each resolves when the test says.
    setInvokeResponse("tts_speak", () => new Promise<void>((resolve) => speeches.push(resolve)));
  });

  afterEach(() => {
    __resetAskStoreForTests();
  });

  it("the chip's speech starting does not reveal the line queued behind it", async () => {
    const hook = mount();
    await act(async () => {
      await Promise.resolve();
    });
    const started = mockListen.mock.calls.filter(([e]) => e === "tts-speech-started").at(-1)?.[1] as
      | ((e: { payload: null }) => void)
      | undefined;
    expect(started).toBeDefined();

    // The chip's answer is spoken first.
    act(() => {
      hook.result.current.handleChipAction({
        kind: "answer",
        chip: { id: "c", label: "What is a groove?", answer: "Where the notes sit." },
      });
    });
    // A tip arrives behind it and waits for its own voice.
    const tip: FeedMessage = { id: "tip-1", type: "coach-tip", content: "Even the eighths.", timestamp: 1, pending: true };
    act(() => {
      hook.result.current.setMessages((prev) => [...prev, tip]);
      hook.result.current.speakAndReveal("tip-1", tip.content, "normal");
    });
    expect(speeches).toHaveLength(2);

    // The chip's audio starts: the tip is still waiting.
    act(() => started!({ payload: null }));
    expect(hook.result.current.messages.find((m) => m.id === "tip-1")?.pending).toBe(true);

    // The tip's audio starts: now it shows.
    act(() => started!({ payload: null }));
    expect(hook.result.current.messages.find((m) => m.id === "tip-1")?.pending).toBe(false);
  });
});
