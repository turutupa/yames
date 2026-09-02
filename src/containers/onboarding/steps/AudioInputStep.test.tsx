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
import { SIGNAL_HOLD_MS } from "./AudioInputStep";

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
  selectedDevice?: string;
  selectedChannel?: number;
  spectrum?: AudioSpectrum | null;
  instrument?: string;
};

function makeEvaluation(options: Options = {}): WizardEvaluationEnv {
  return {
    devices: options.devices ?? [MIC],
    selectedDevice: options.selectedDevice,
    selectDevice: vi.fn(),
    selectedChannel: options.selectedChannel ?? 0,
    selectChannel: vi.fn(),
    listening: true,
    setListening: vi.fn(),
    spectrum: options.spectrum ?? null,
    lastFeedback: null,
    avgDeviation: 0,
  };
}

function harness(options: Options = {}) {
  const dispatch = vi.fn();
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
    />
  );
  return { dispatch, evaluation, ui };
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

  it.each([
    ["a run that never reached W4", {}, false],
    ["timing-only, no opt-in", { coachTier: "off" as const }, false],
    ["timing-only who opted in", { coachTier: "off" as const, tryListening: true }, true],
    ["standard brain", { coachTier: "standard" as const }, true],
    ["studio brain", { coachTier: "full" as const }, true],
    ["opt-in without a tier yet", { tryListening: true }, true],
  ])("audio-input: %s → %s", (_name, patch, expected) => {
    expect(gate("audio-input")(ctx(patch))).toBe(expected);
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

  it("keeps both steps in flow order between the coach step and W7", () => {
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual([
      "welcome",
      "instrument",
      "sound-look",
      "hands-free",
      "coach",
      "audio-input",
      "hear-it-work",
      "ready",
    ]);
  });
});
