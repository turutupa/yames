/**
 * W5 — audio input.
 *
 * Rendered inside the real wizard shell, so the tests exercise the actual
 * contract: the Next gate, the commit the shell runs on Next, and the
 * "selection is never navigation" house rule. The evaluation env is a set of
 * spies standing in for MainWindow's single `useEvaluation` — the same shape
 * the app passes, so what is asserted here is what production calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import type { AudioInputDevice, AudioSpectrum } from "../../../types";
import { OnboardingWizard } from "../OnboardingWizard";
import type { OnboardingContext, OnboardingState } from "../onboardingMachine";
import type { WizardEvaluationEnv } from "../WizardContext";
import { ONBOARDING_STEPS } from "./index";
import { deviceForMode, NOTHING_HEARD_MS, SIGNAL_HOLD_MS } from "./AudioInputStep";

const MIC: AudioInputDevice = {
  name: "MacBook Pro Microphone",
  isDefault: true,
  isInterface: false,
  channels: 1,
};
const INTERFACE: AudioInputDevice = {
  name: "Scarlett 2i2",
  isDefault: false,
  isInterface: true,
  channels: 4,
};

const LOUD: AudioSpectrum = { bands: new Array(16).fill(0.5), rms: 0.2 };
const SILENT: AudioSpectrum = { bands: new Array(16).fill(0), rms: 0.0005 };

function stateAt(
  stepId: OnboardingState["stepId"],
  context: Partial<OnboardingContext> = {},
): OnboardingState {
  return {
    status: "step",
    stepId,
    context: {
      skipped: [],
      visited: ["welcome", "instrument", "coach", "audio-input"],
      coachTier: "standard",
      ...context,
    },
  };
}

type Options = {
  devices?: AudioInputDevice[];
  startError?: string | null;
  listening?: boolean;
  selectedDevice?: string;
  selectedChannel?: number;
  spectrum?: AudioSpectrum | null;
  instrument?: string;
  /** The player's grading choice going in; graded unless a test says otherwise. */
  grading?: "on" | "off" | "ask";
};

function makeEvaluation(options: Options = {}): WizardEvaluationEnv {
  return {
    devices: options.devices ?? [MIC],
    selectedDevice: options.selectedDevice,
    selectDevice: vi.fn(),
    selectedChannel: options.selectedChannel ?? 0,
    selectChannel: vi.fn(),
    listening: options.listening ?? true,
    setListening: vi.fn(),
    startError: options.startError ?? null,
    spectrum: options.spectrum ?? null,
    lastFeedback: null,
    avgDeviation: 0,
  };
}

function harness(options: Options = {}) {
  const dispatch = vi.fn();
  const setGrading = vi.fn();
  const learning = {
    paths: [],
    progress: { states: [], takes: [], ceilings: [], unsubscribed: [] },
    plan: null,
    startPath: () => null,
    grading: options.grading ?? "on",
    setGrading,
  };
  const evaluation = makeEvaluation(options);
  const ui = (evalEnv: WizardEvaluationEnv) => (
    <OnboardingWizard
      state={stateAt("audio-input")}
      dispatch={dispatch as never}
      appVersion="1.0.4"
      instrument={options.instrument ?? "electric-guitar"}
      instrumentChosen
      onInstrumentChange={vi.fn()}
      soundType="wood"
      themeId="obsidian"
      coachTier="standard"
      alwaysOnTop
      onAlwaysOnTopChange={vi.fn()}
      startSoftClick={vi.fn()}
      stopSoftClick={vi.fn()}
      softClickPlaying={false}
      onFinish={vi.fn()}
      evaluation={evalEnv}
      learning={learning}
    />
  );
  return { dispatch, evaluation, ui, setGrading };
}

/** Mount, then optionally feed the meter and let the hold timer run. */
function mount(options: Options = {}) {
  const h = harness(options);
  const view = render(h.ui(h.evaluation));
  /** Re-render with a different spectrum, as the app does on every event. */
  const feed = (spectrum: AudioSpectrum | null) => {
    view.rerender(h.ui({ ...h.evaluation, spectrum }));
  };
  return { ...h, view, feed };
}

const next = () => screen.getByRole("button", { name: "Next" });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("W5 — the meter gates Next", () => {
  it("keeps Next off until the meter has held signal for a full second", () => {
    const { feed } = mount();
    expect(next()).toBeDisabled();

    // Signal, but not yet a second of it.
    feed(LOUD);
    act(() => {
      vi.advanceTimersByTime(SIGNAL_HOLD_MS - 200);
    });
    expect(next()).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(next()).toBeEnabled();
  });

  it("does not count room tone below the noise floor", () => {
    const { feed } = mount();
    feed(SILENT);
    act(() => {
      vi.advanceTimersByTime(SIGNAL_HOLD_MS * 3);
    });
    expect(next()).toBeDisabled();
    expect(screen.getByTestId("audio-input-gate")).toHaveTextContent(
      "Play something — the meter needs a second of signal.",
    );
  });

  it("stays open once the input has proved itself, even if it falls silent", () => {
    const { feed } = mount();
    feed(LOUD);
    act(() => {
      vi.advanceTimersByTime(SIGNAL_HOLD_MS);
    });
    expect(next()).toBeEnabled();

    feed(SILENT);
    act(() => {
      vi.advanceTimersByTime(SIGNAL_HOLD_MS * 2);
    });
    expect(next()).toBeEnabled();
    expect(screen.getByTestId("audio-input-gate")).toHaveTextContent(
      "Got it. Yames can hear you.",
    );
  });
});

describe("W5 — what Next commits", () => {
  it("records that the input was set up AND heard", () => {
    const { feed, dispatch } = mount();
    feed(LOUD);
    act(() => {
      vi.advanceTimersByTime(SIGNAL_HOLD_MS);
    });
    act(() => {
      next().click();
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_CONTEXT",
      patch: { inputConfigured: true },
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "NEXT" });
  });

  it("skipping commits nothing — W6 must not follow a skipped W5", () => {
    const { feed, dispatch } = mount();
    feed(LOUD);
    act(() => {
      vi.advanceTimersByTime(SIGNAL_HOLD_MS);
    });
    act(() => {
      screen.getByTestId("audio-input-skip").click();
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "SKIP_STEP" });
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_CONTEXT" }),
    );
  });

  it("offers the escape hatch even when nothing has been heard", () => {
    mount();
    expect(next()).toBeDisabled();
    expect(screen.getByTestId("audio-input-skip")).toBeEnabled();
    expect(screen.getByTestId("audio-input-skip")).toHaveTextContent(
      "Skip, I'll set this up later",
    );
  });
});

describe("W5 — the device row", () => {
  it("owns the shared stream while it is on screen and hands it back on the way out", () => {
    const { evaluation, view } = mount();
    expect(evaluation.setListening).toHaveBeenCalledWith(true);
    view.unmount();
    expect(evaluation.setListening).toHaveBeenCalledWith(false);
    expect(evaluation.setListening).toHaveBeenCalledTimes(2);
  });

  it("hides the channel picker on a one-channel device and shows it on an interface", () => {
    const mono = mount({ devices: [MIC, INTERFACE], selectedDevice: MIC.name });
    expect(screen.queryByTestId("audio-input-channel")).toBeNull();
    mono.view.unmount();

    mount({ devices: [MIC, INTERFACE], selectedDevice: INTERFACE.name });
    expect(screen.getByTestId("audio-input-channel")).toBeInTheDocument();
  });

  it("picking a device asks the app's hook to switch, and nothing else", () => {
    const { evaluation, dispatch } = mount({
      devices: [MIC, INTERFACE],
      selectedDevice: MIC.name,
    });
    const dropdown = screen.getByTestId("audio-input-device");
    act(() => {
      within(dropdown).getByRole("button").click();
    });
    act(() => {
      within(dropdown).getByText(INTERFACE.name).click();
    });
    expect(evaluation.selectDevice).toHaveBeenCalledWith(INTERFACE.name);
    // Selection is never navigation.
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("a device that has proved nothing yet re-closes the gate", () => {
    const h = harness({ devices: [MIC, INTERFACE], selectedDevice: MIC.name });
    const view = render(h.ui({ ...h.evaluation, spectrum: LOUD }));
    act(() => {
      vi.advanceTimersByTime(SIGNAL_HOLD_MS);
    });
    expect(next()).toBeEnabled();

    // The app switched device: the new one has been heard for 0 ms.
    view.rerender(
      h.ui({ ...h.evaluation, selectedDevice: INTERFACE.name, spectrum: SILENT }),
    );
    expect(next()).toBeDisabled();
  });
});

describe("W5 — guidance", () => {
  it("says something instrument-specific for a guided instrument", () => {
    mount({ instrument: "bass" });
    expect(screen.getByTestId("audio-input-guidance")).toHaveTextContent(
      /An interface is best for bass/,
    );
  });

  it("falls back to the generic line for anything else", () => {
    mount({ instrument: "other" });
    expect(screen.getByTestId("audio-input-guidance")).toHaveTextContent(
      /An interface is better, but the laptop mic works/,
    );
  });
});

describe("W5/W6 — the isEnabled matrix", () => {
  const gate = (id: string) => ONBOARDING_STEPS.find((s) => s.id === id)!.isEnabled!;
  const ctx = (patch: Partial<OnboardingContext>): OnboardingContext => ({
    skipped: [],
    visited: [],
    ...patch,
  });

  // MVP, 2026-11-16: the learning side grades from the guitar, so W5 is on
  // every run. It used to be off for a timing-only run that did not opt in
  // (plan decision 3); whatever the coach tier, the question is now asked.
  it.each([
    ["a run that never reached W4", {}],
    ["timing-only, no opt-in", { coachTier: "off" as const }],
    ["timing-only who opted in", { coachTier: "off" as const, tryListening: true }],
    ["standard brain", { coachTier: "standard" as const }],
    ["studio brain", { coachTier: "full" as const }],
  ])("audio-input is on every run: %s", (_name, patch) => {
    const step = ONBOARDING_STEPS.find((s) => s.id === "audio-input")!;
    expect(step.isEnabled ? step.isEnabled(ctx(patch)) : true).toBe(true);
  });

  it.each([
    ["W5 never ran", {}, false],
    ["W5 was skipped", { coachTier: "standard" as const }, false],
    ["W5 heard the input", { coachTier: "standard" as const, inputConfigured: true }, true],
    ["timing-only who set an input up", { coachTier: "off" as const, inputConfigured: true }, true],
  ])("hear-it-work: %s → %s", (_name, patch, expected) => {
    expect(gate("hear-it-work")(ctx(patch))).toBe(expected);
  });

  // O1 built W7's rows against `availableSteps`, so registering W5 is all it
  // takes for the "Audio input" row to become a live link. Verified rather
  // than assumed — it is the one deliverable of this task nobody wrote code
  // for.
  it("W7's audio-input row goes live now that the step is registered", () => {
    const dispatch = vi.fn();
    render(
      <OnboardingWizard
        state={{
          status: "step",
          stepId: "ready",
          context: {
            skipped: [],
            visited: ["welcome", "ready"],
            coachTier: "standard",
            inputConfigured: true,
          },
        }}
        dispatch={dispatch as never}
        appVersion="1.0.4"
        instrument="electric-guitar"
        instrumentChosen
        onInstrumentChange={vi.fn()}
        soundType="wood"
        themeId="obsidian"
        coachTier="standard"
        inputDeviceName="Scarlett 2i2"
        alwaysOnTop
        onAlwaysOnTopChange={vi.fn()}
        startSoftClick={vi.fn()}
        stopSoftClick={vi.fn()}
        softClickPlaying={false}
        onFinish={vi.fn()}
      />,
    );
    const row = screen.getByText("Audio input").closest("button");
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent("Scarlett 2i2");
    act(() => {
      row!.click();
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "JUMP", stepId: "audio-input" });
  });

  // MVP, 2026-11-16: hearing the guitar comes straight after the instrument,
  // before the steps that only tune the tools.
  // 2026-11-18: "Where do you start?" sits between the guitar and the input.
  it("puts both steps straight after the instrument and the start, before the coach", () => {
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual([
      "welcome",
      "instrument",
      "start",
      "audio-input",
      "hear-it-work",
      "coach",
      "sound-look",
      "hands-free",
      "ready",
    ]);
  });
});

// ── MVP first run (2026-11-16): microphone or direct input, and what to do
//    when nothing works ──────────────────────────────────────────────────
describe("W5 — microphone or direct input", () => {
  it("names the device each choice means", () => {
    const usbMic: AudioInputDevice = { name: "USB Mic", isDefault: false, isInterface: false, channels: 1 };
    expect(deviceForMode([INTERFACE, usbMic, MIC], "mic")).toBe(MIC.name);
    expect(deviceForMode([INTERFACE, usbMic], "mic")).toBe("USB Mic");
    expect(deviceForMode([INTERFACE], "mic")).toBe("");
    expect(deviceForMode([MIC, INTERFACE], "direct")).toBe(INTERFACE.name);
    expect(deviceForMode([MIC], "direct")).toBeNull();
  });

  it("follows the device: an interface reads as direct input", () => {
    mount({ devices: [MIC, INTERFACE], selectedDevice: INTERFACE.name });
    expect(screen.getByTestId("audio-input-mode-direct")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("audio-input-mode-mic")).toHaveAttribute("aria-pressed", "false");
  });

  it("choosing direct input picks the interface, and never advances", () => {
    const { evaluation, dispatch } = mount({ devices: [MIC, INTERFACE], selectedDevice: MIC.name });
    act(() => {
      screen.getByTestId("audio-input-mode-direct").click();
    });
    expect(evaluation.selectDevice).toHaveBeenCalledWith(INTERFACE.name);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("says so when direct input is asked for and no interface is plugged in", () => {
    const { evaluation } = mount({ devices: [MIC], selectedDevice: MIC.name });
    act(() => {
      screen.getByTestId("audio-input-mode-direct").click();
    });
    expect(evaluation.selectDevice).not.toHaveBeenCalled();
    expect(screen.getByTestId("audio-input-no-interface")).toHaveTextContent(
      "No audio interface found.",
    );
  });
});

describe("W5 — when the guitar is not heard", () => {
  it("with no input at all, says what to plug in", () => {
    mount({ devices: [] });
    expect(screen.getByTestId("audio-input-trouble")).toHaveTextContent("No input found");
    expect(screen.queryByTestId("audio-input-retry")).toBeNull();
  });

  it("when the input will not open, says why it may be and offers to try again", () => {
    const { evaluation } = mount({ startError: "device busy", listening: false });
    const trouble = screen.getByTestId("audio-input-trouble");
    expect(trouble).toHaveTextContent("This input would not open");
    expect(trouble).toHaveTextContent("Privacy");
    act(() => {
      within(trouble).getByTestId("audio-input-retry").click();
    });
    expect(evaluation.setListening).toHaveBeenCalledWith(false);
  });

  it("after a while of silence, lists what to check for the way it is connected", () => {
    const { feed } = mount({ devices: [MIC, INTERFACE], selectedDevice: INTERFACE.name });
    feed(SILENT);
    act(() => {
      vi.advanceTimersByTime(NOTHING_HEARD_MS - 500);
    });
    expect(screen.queryByTestId("audio-input-trouble")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(600);
    });
    const trouble = screen.getByTestId("audio-input-trouble");
    expect(trouble).toHaveTextContent("Nothing heard yet");
    expect(trouble).toHaveTextContent("interface's gain");
    expect(trouble).toHaveTextContent("macOS");
    // Still only advice: Next stays off, Skip stays there.
    expect(next()).toBeDisabled();
    expect(screen.getByTestId("audio-input-skip")).toBeInTheDocument();
  });

  it("does not call a stream that never opened silent", () => {
    const { feed } = mount({ listening: false });
    feed(SILENT);
    act(() => {
      vi.advanceTimersByTime(NOTHING_HEARD_MS * 2);
    });
    expect(screen.queryByTestId("audio-input-trouble")).toBeNull();
  });

  it("puts the advice away once the guitar is heard", () => {
    const { feed } = mount();
    feed(SILENT);
    act(() => {
      vi.advanceTimersByTime(NOTHING_HEARD_MS + 200);
    });
    expect(screen.getByTestId("audio-input-trouble")).toBeInTheDocument();
    feed(LOUD);
    act(() => {
      vi.advanceTimersByTime(SIGNAL_HOLD_MS + 200);
    });
    expect(screen.queryByTestId("audio-input-trouble")).toBeNull();
    expect(next()).toBeEnabled();
  });
});

describe("W5 — should Yames listen and grade? (owner, 2026-11-18)", () => {
  it("a new player is asked first: two equal answers, no stream opened, Next off", () => {
    const { evaluation } = mount({ grading: "ask" });
    expect(screen.getByText("Should Yames listen to your playing and grade it?")).toBeInTheDocument();
    expect(screen.getByTestId("audio-input-grade-yes")).toHaveTextContent("Yes, grade my playing");
    expect(screen.getByTestId("audio-input-grade-no")).toHaveTextContent("No, just the click and the visuals");
    expect(screen.queryByTestId("audio-input-setup")).toBeNull();
    expect(evaluation.setListening).not.toHaveBeenCalled();
    expect(next()).toBeDisabled();
  });

  it("No skips the input setup entirely, asks for no microphone, and Next sets grading off", () => {
    const { evaluation, dispatch, setGrading } = mount({ grading: "ask" });
    act(() => {
      screen.getByTestId("audio-input-grade-no").click();
    });
    expect(screen.queryByTestId("audio-input-setup")).toBeNull();
    expect(evaluation.setListening).not.toHaveBeenCalled();
    // Selecting is never navigating.
    expect(dispatch).not.toHaveBeenCalledWith({ type: "NEXT" });
    expect(next()).toBeEnabled();
    act(() => {
      next().click();
    });
    expect(setGrading).toHaveBeenCalledWith("off");
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_CONTEXT", patch: { inputConfigured: false } });
    expect(dispatch).toHaveBeenCalledWith({ type: "NEXT" });
  });

  it("Yes opens the input setup, and Next once heard sets grading on", () => {
    const h = harness({ grading: "ask" });
    const view = render(h.ui(h.evaluation));
    act(() => {
      screen.getByTestId("audio-input-grade-yes").click();
    });
    expect(screen.getByTestId("audio-input-setup")).toBeInTheDocument();
    expect(h.evaluation.setListening).toHaveBeenCalledWith(true);
    expect(next()).toBeDisabled();
    view.rerender(h.ui({ ...h.evaluation, spectrum: LOUD }));
    act(() => {
      vi.advanceTimersByTime(SIGNAL_HOLD_MS);
    });
    act(() => {
      next().click();
    });
    expect(h.setGrading).toHaveBeenCalledWith("on");
    expect(h.dispatch).toHaveBeenCalledWith({ type: "SET_CONTEXT", patch: { inputConfigured: true } });
  });

  it("a re-run starts on the answer that is live: off shows No, with no setup", () => {
    mount({ grading: "off" });
    expect(screen.getByTestId("audio-input-grade-no").getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByTestId("audio-input-setup")).toBeNull();
    expect(next()).toBeEnabled();
  });
});
