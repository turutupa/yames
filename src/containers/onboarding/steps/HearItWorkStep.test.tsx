/**
 * W6 — hear it work.
 *
 * The step is rendered inside the real wizard shell with a spy evaluation env
 * (MainWindow's `useEvaluation`, narrowed) and the real `ipc.ts` on the mocked
 * Tauri transport — so `close_open_segment`, `get_session_report` and
 * `coach_generate` are genuine round trips, and what the tests assert about
 * them is what production calls.
 *
 * The load-bearing behaviour: the take starts and stops the shared stream
 * exactly once, and nothing invents a result. A run with no onsets says it
 * heard nothing and never asks the coach to comment on it.
 */
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { mockInvoke, setInvokeResponse } from "../../../test/mocks";
import type { BeatEvent, BeatFeedback, SessionReport } from "../../../types";
import { OnboardingWizard } from "../OnboardingWizard";
import type { OnboardingContext, OnboardingState } from "../onboardingMachine";
import type { WizardEvaluationEnv } from "../WizardContext";
import { COUNT_IN_BEATS, TAKE_BEATS, firstSentence } from "./HearItWorkStep";

function stateAt(context: Partial<OnboardingContext> = {}): OnboardingState {
  return {
    status: "step",
    stepId: "hear-it-work",
    context: {
      skipped: [],
      visited: ["welcome", "instrument", "coach", "audio-input", "hear-it-work"],
      coachTier: "standard",
      inputConfigured: true,
      ...context,
    },
  };
}

function beatEvent(n: number): BeatEvent {
  return {
    beat: n,
    measureBeat: n % 4,
    subdivision: 0,
    isDownbeat: n % 4 === 0,
    isAccent: n % 4 === 0,
  };
}

function feedback(
  beatIndex: number,
  classification: BeatFeedback["classification"],
  deviationMs = 6,
): BeatFeedback {
  return {
    beatIndex,
    deviationMs,
    intervalErrorMs: 3,
    classification,
    amplitude: classification === "miss" || classification === "skipped" ? 0 : 0.4,
    calibrationOffsetMs: 12,
    calibrationConfidence: 0.8,
    gridCorrelation: 0.9,
  };
}

const REPORT: SessionReport = {
  totalBeats: 8,
  hitsCount: 7,
  missCount: 1,
  skippedBeats: 0,
  perfectCount: 4,
  goodCount: 2,
  okCount: 1,
  meanDeviationMs: 4.2,
  stdDeviationMs: 9.1,
  meanAbsDeviationMs: 8.3,
  meanIntervalErrorMs: 5.5,
  grade: "B",
  score: 78,
  deviations: [3, -2, 8, 5],
  dynamicsStd: 0.1,
  meanAmplitude: 0.4,
  tempoStabilityMs: 4,
  longestStreak: 5,
  comment: "",
  insights: [],
  gridCorrelation: 0.9,
  hitCompleteness: 0.9,
  intervalConsistency: 0.8,
  gridAlignment: 0.75,
};

const BASE_EVALUATION: WizardEvaluationEnv = {
  devices: [],
  selectedDevice: "Scarlett 2i2",
  selectDevice: vi.fn(),
  selectedChannel: 0,
  selectChannel: vi.fn(),
  listening: false,
  setListening: vi.fn(),
  spectrum: null,
  lastFeedback: null,
  avgDeviation: 0,
};

function mount() {
  const dispatch = vi.fn();
  const setListening = vi.fn();
  const evaluation: WizardEvaluationEnv = { ...BASE_EVALUATION, setListening };

  const ui = (lastFeedback: BeatFeedback | null, currentBeat: BeatEvent | null) => (
    <OnboardingWizard
      state={stateAt()}
      dispatch={dispatch as never}
      appVersion="1.0.4"
      instrument="electric-guitar"
      instrumentChosen
      onInstrumentChange={vi.fn()}
      soundType="wood"
      themeId="obsidian"
      coachTier="standard"
      alwaysOnTop
      onAlwaysOnTopChange={vi.fn()}
      startSoftClick={vi.fn()}
      stopSoftClick={vi.fn()}
      softClickPlaying
      currentBeat={currentBeat}
      onFinish={vi.fn()}
      evaluation={{ ...evaluation, lastFeedback }}
    />
  );

  const view = render(ui(null, null));
  let beatNumber = -1;
  // The shell counts a beat per *new* `currentBeat` object, so the
  // feedback-only re-render has to hand back the same one — otherwise a single
  // call here would tick two beats.
  let currentBeat: BeatEvent | null = null;
  let feedbackSeen: BeatFeedback | null = null;

  /** One engine beat, optionally carrying the feedback event for it. */
  const beat = async (fb?: BeatFeedback) => {
    if (fb) {
      feedbackSeen = fb;
      // The feedback event lands before the next beat tick, as it does live.
      await act(async () => {
        view.rerender(ui(feedbackSeen, currentBeat));
      });
    }
    beatNumber += 1;
    currentBeat = beatEvent(beatNumber);
    await act(async () => {
      view.rerender(ui(feedbackSeen, currentBeat));
    });
  };

  const countIn = async () => {
    for (let i = 0; i < COUNT_IN_BEATS; i++) await beat();
  };

  return { dispatch, setListening, view, beat, countIn };
}

const start = async () => {
  await act(async () => {
    screen.getByTestId("hiw-start").click();
  });
};

describe("firstSentence", () => {
  it("keeps one sentence and drops the rest", () => {
    expect(firstSentence("Right in the pocket. Keep it there next time.")).toBe(
      "Right in the pocket.",
    );
  });

  it("returns text that never ends a sentence unchanged", () => {
    expect(firstSentence("  Locked in  ")).toBe("Locked in");
  });
});

describe("W6 — the take", () => {
  it("starts and stops the shared stream exactly once", async () => {
    setInvokeResponse("get_session_report", REPORT);
    setInvokeResponse("coach_generate", "Mostly on top of the beat.");
    const { setListening, beat, countIn } = mount();

    expect(setListening).not.toHaveBeenCalled();
    await start();
    expect(setListening.mock.calls).toEqual([[true]]);

    await countIn();
    for (let i = 0; i < TAKE_BEATS; i++) await beat(feedback(i, "good"));

    await waitFor(() => expect(screen.getByTestId("hiw-result")).toBeInTheDocument());
    expect(setListening.mock.calls).toEqual([[true], [false]]);
  });

  it("only scores the eight beats after the count-in", async () => {
    setInvokeResponse("get_session_report", REPORT);
    setInvokeResponse("coach_generate", "Solid.");
    const { beat } = mount();
    await start();

    // Count-in beats carry feedback too (the analyzer is already running) —
    // they must not fill the dots.
    for (let i = 0; i < COUNT_IN_BEATS; i++) await beat(feedback(i, "miss"));
    expect(screen.getByTestId("hiw-dot-0")).toHaveAttribute(
      "data-classification",
      "pending",
    );
    // `clear_session` fires on the count-in → take boundary, so the report
    // covers the take alone.
    expect(mockInvoke.mock.calls.map(([name]) => name)).toContain("clear_session");

    for (let i = 0; i < TAKE_BEATS; i++) await beat(feedback(i, "perfect"));
    expect(screen.getByTestId("hiw-dot-0")).toHaveAttribute(
      "data-classification",
      "perfect",
    );
    await waitFor(() => expect(screen.getByTestId("hiw-result")).toBeInTheDocument());
  });

  it("closes the open segment before asking for the report", async () => {
    setInvokeResponse("get_session_report", REPORT);
    setInvokeResponse("coach_generate", "Solid work.");
    const { beat, countIn } = mount();
    await start();
    await countIn();
    for (let i = 0; i < TAKE_BEATS; i++) await beat(feedback(i, "good"));

    await waitFor(() => expect(screen.getByTestId("hiw-result")).toBeInTheDocument());
    const commands = mockInvoke.mock.calls.map(([name]) => name);
    expect(commands.indexOf("close_open_segment")).toBeGreaterThanOrEqual(0);
    expect(commands.indexOf("close_open_segment")).toBeLessThan(
      commands.indexOf("get_session_report"),
    );
  });

  it("shows the measured score and one sentence from the coach", async () => {
    setInvokeResponse("get_session_report", REPORT);
    setInvokeResponse(
      "coach_generate",
      "Mostly on top of the beat. The coach will track this every session.",
    );
    const { beat, countIn } = mount();
    await start();
    await countIn();
    for (let i = 0; i < TAKE_BEATS; i++) await beat(feedback(i, "good"));

    const result = await screen.findByTestId("hiw-result");
    expect(result).toHaveTextContent("78");
    expect(result).toHaveTextContent("Mostly on top of the beat.");
    // One sentence, not the whole paragraph.
    expect(result).not.toHaveTextContent("every session");
  });

  it("falls back to the measured line when the coach cannot answer", async () => {
    setInvokeResponse("get_session_report", REPORT);
    setInvokeResponse("coach_generate", () => {
      throw new Error("no model");
    });
    const { beat, countIn } = mount();
    await start();
    await countIn();
    for (let i = 0; i < TAKE_BEATS; i++) await beat(feedback(i, "good"));

    const result = await screen.findByTestId("hiw-result");
    // Still measured, still true — never invented.
    expect(result).toHaveTextContent("Score 78");
    expect(result).toHaveTextContent("88% hits");
  });
});

describe("W6 — when nothing was heard", () => {
  it("says so, offers the way back to W5, and never asks for a comment", async () => {
    setInvokeResponse("get_session_report", null);
    const { beat, countIn, dispatch } = mount();
    await start();
    await countIn();
    // Eight beats of metronome, no onset matched to any of them.
    for (let i = 0; i < TAKE_BEATS; i++) await beat(feedback(i, "skipped"));

    const nothing = await screen.findByTestId("hiw-nothing");
    expect(nothing).toHaveTextContent(
      "Didn't hear anything — check the input level.",
    );
    expect(screen.queryByTestId("hiw-result")).toBeNull();
    expect(mockInvoke.mock.calls.map(([name]) => name)).not.toContain("coach_generate");

    act(() => {
      screen.getByTestId("hiw-back-to-input").click();
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "BACK" });
  });

  it("treats a report with no hits as nothing heard, not as a zero", async () => {
    setInvokeResponse("get_session_report", { ...REPORT, hitsCount: 0, score: 0 });
    const { beat, countIn } = mount();
    await start();
    await countIn();
    for (let i = 0; i < TAKE_BEATS; i++) await beat(feedback(i, "miss"));

    expect(await screen.findByTestId("hiw-nothing")).toBeInTheDocument();
    expect(screen.queryByTestId("hiw-result")).toBeNull();
  });

  it("stops the stream on the way out even when the take found nothing", async () => {
    setInvokeResponse("get_session_report", null);
    const { beat, countIn, setListening } = mount();
    await start();
    await countIn();
    for (let i = 0; i < TAKE_BEATS; i++) await beat(feedback(i, "skipped"));

    await screen.findByTestId("hiw-nothing");
    expect(setListening.mock.calls).toEqual([[true], [false]]);
  });
});

describe("W6 — cancelling", () => {
  it("hands the stream back and returns to the button", async () => {
    const { setListening, beat } = mount();
    await start();
    await beat(feedback(0, "good"));

    await act(async () => {
      screen.getByTestId("hiw-cancel").click();
    });
    expect(setListening.mock.calls).toEqual([[true], [false]]);
    expect(screen.getByTestId("hiw-start")).toBeInTheDocument();
    expect(screen.queryByTestId("hiw-result")).toBeNull();
    expect(screen.queryByTestId("hiw-nothing")).toBeNull();
  });
});

describe("W6 — starting the take is not navigation", () => {
  it("pressing Start plays; only Next advances", async () => {
    const { dispatch } = mount();
    await start();
    expect(screen.getByTestId("hiw-countin")).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();

    act(() => {
      screen.getByRole("button", { name: "Next" }).click();
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "NEXT" });
  });
});
