/**
 * W4 — practice coach opt-in.
 *
 * Rendered inside the real wizard shell so the tests exercise the actual
 * contract: the commit the shell runs on Next, the Next gate, the footer, and
 * the "selection is never navigation" house rule. Capabilities come through
 * the real `ipc.ts` on the mocked Tauri transport; the coach hand-offs are
 * spies standing in for MainWindow's single `useCoachDownload`.
 */
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import type { ModelStatus } from "../../../ipc";
import { setInvokeResponse } from "../../../test/mocks";
import { OnboardingWizard } from "../OnboardingWizard";
import type { OnboardingContext, OnboardingState } from "../onboardingMachine";
import type { WizardCoachEnv } from "../WizardContext";

const GB = 1024;

function stateAt(stepId: OnboardingState["stepId"], context: Partial<OnboardingContext> = {}): OnboardingState {
  return {
    status: "step",
    stepId,
    context: { skipped: [], visited: ["welcome", "instrument", "coach"], ...context },
  };
}

const installed = (tier: "standard" | "full", voiceReady = true): ModelStatus => ({
  brainReady: true,
  brainTier: tier,
  brainFamily: "qwen3",
  brainSizeBytes: 2_497_280_256,
  voiceReady,
  voiceSizeBytes: 60_000_000,
});

type HarnessOptions = {
  llmCompiled?: boolean;
  systemMemoryMb?: number | null;
  modelStatus?: ModelStatus | null;
  downloading?: boolean;
  downloadFraction?: number | null;
  state?: OnboardingState;
};

function harness(options: HarnessOptions = {}) {
  const {
    llmCompiled = true,
    systemMemoryMb = 32 * GB,
    modelStatus = null,
    downloading = false,
    downloadFraction = null,
    state = stateAt("coach"),
  } = options;

  setInvokeResponse("get_coach_capabilities", {
    llmCompiled,
    modelResident: false,
    backend: llmCompiled ? "vulkan" : "none",
    modelName: null,
    ramEstimateMb: 0,
  });

  const dispatch = vi.fn();
  const coach: WizardCoachEnv = {
    systemMemoryMb,
    modelStatus,
    downloading,
    downloadFraction,
    startDownload: vi.fn(),
    setBrainTier: vi.fn(),
  };

  const ui = (
    <OnboardingWizard
      state={state}
      dispatch={dispatch as never}
      appVersion="1.0.4"
      instrument="electric-guitar"
      instrumentChosen
      onInstrumentChange={vi.fn()}
      soundType="wood"
      themeId="obsidian"
      coachTier="off"
      alwaysOnTop
      onAlwaysOnTopChange={vi.fn()}
      startSoftClick={vi.fn()}
      stopSoftClick={vi.fn()}
      softClickPlaying={false}
      onFinish={vi.fn()}
      coach={coach}
    />
  );
  return { ui, dispatch, coach };
}

async function mount(options: HarnessOptions = {}) {
  const h = harness(options);
  await act(async () => {
    render(h.ui);
  });
  // The cards only appear once `get_coach_capabilities` has answered — the
  // step refuses to guess at the machine.
  if ((options.state ?? stateAt("coach")).stepId === "coach") {
    await waitFor(() => expect(screen.getByTestId("coach-tier-off")).toBeInTheDocument());
  }
  return h;
}

const card = (tier: "off" | "standard" | "full") => screen.getByTestId(`coach-tier-${tier}`);
const click = async (el: HTMLElement) => {
  await act(async () => {
    el.click();
  });
};
const next = () => screen.getByRole("button", { name: "Next" });
const skip = () => screen.getByRole("button", { name: "Skip" });

describe("W4 — what the screen says", () => {
  it("states what the coach does and one true privacy line", async () => {
    await mount();
    expect(
      screen.getByText(/listens through your audio input and scores/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/writes a short report/i)).toBeInTheDocument();
    // Both halves of the privacy promise: nothing leaves, nothing is recorded.
    expect(
      screen.getByText(
        "Everything runs on this machine. Your audio never leaves it, and release builds never record it.",
      ),
    ).toBeInTheDocument();
  });

  it("offers exactly three choices", async () => {
    await mount();
    expect(within(screen.getByTestId("coach-tiers")).getAllByRole("button")).toHaveLength(3);
  });
});

describe("W4 — recommendation is preselected", () => {
  it("preselects Standard on a capable machine", async () => {
    await mount();
    expect(card("standard")).toHaveAttribute("aria-pressed", "true");
    expect(within(card("standard")).getByText("Recommended")).toBeInTheDocument();
    expect(card("off")).toHaveAttribute("aria-pressed", "false");
  });

  it("preselects timing-only on a build with no LLM, and says why", async () => {
    await mount({ llmCompiled: false });
    expect(card("off")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("coach-recommendation-reason")).toHaveTextContent(
      "This build can't run a model",
    );
    expect(card("standard")).toBeDisabled();
    expect(card("full")).toBeDisabled();
  });

  it("preselects timing-only on a machine below the Standard floor", async () => {
    await mount({ systemMemoryMb: 4 * GB });
    expect(card("off")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("coach-recommendation-reason")).toHaveTextContent(
      "This machine has 4 GB of RAM",
    );
  });

  it("preselects the brain that is already downloaded", async () => {
    await mount({ modelStatus: installed("standard") });
    expect(card("standard")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("coach-recommendation-reason")).toHaveTextContent(
      "Already downloaded",
    );
  });
});

describe("W4 — Studio is greyed with the reason below 16 GB (decision 5)", () => {
  it("names the RAM this machine actually has", async () => {
    await mount({ systemMemoryMb: 8 * GB });
    expect(card("full")).toBeDisabled();
    expect(within(card("full")).getByText(/Studio needs at least 16 GB of RAM/)).toHaveTextContent(
      "this machine has 8 GB",
    );
  });

  it("is selectable at 16 GB and above", async () => {
    await mount({ systemMemoryMb: 16 * GB });
    expect(card("full")).toBeEnabled();
    expect(within(card("full")).queryByText(/needs at least 16 GB/)).toBeNull();
  });

  it("is selectable when the RAM query failed rather than falsely locked", async () => {
    await mount({ systemMemoryMb: 0 });
    expect(card("full")).toBeEnabled();
  });
});

describe("W4 — selection never advances (house rule)", () => {
  it("clicking any card only selects it", async () => {
    const { dispatch } = await mount();
    for (const tier of ["off", "standard", "full"] as const) {
      await click(card(tier));
      expect(card(tier)).toHaveAttribute("aria-pressed", "true");
    }
    expect(dispatch).not.toHaveBeenCalled();
    expect(next()).toBeEnabled();
  });

  it("selecting a brain does not start a download", async () => {
    const { coach } = await mount();
    await click(card("full"));
    await click(card("standard"));
    expect(coach.startDownload).not.toHaveBeenCalled();
    expect(coach.setBrainTier).not.toHaveBeenCalled();
  });
});

describe("W4 — the commit on Next", () => {
  it("persists the tier, records the context and hands off the download once", async () => {
    const { dispatch, coach } = await mount();
    await click(card("standard"));
    await click(next());

    expect(coach.setBrainTier).toHaveBeenCalledTimes(1);
    expect(coach.setBrainTier).toHaveBeenCalledWith("standard");
    expect(coach.startDownload).toHaveBeenCalledTimes(1);
    expect(coach.startDownload).toHaveBeenCalledWith("standard");
    // Context first (so W5/W6 gate correctly), then the move.
    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: "SET_CONTEXT",
      patch: { coachTier: "standard", tryListening: false },
    });
    expect(dispatch).toHaveBeenNthCalledWith(2, { type: "NEXT" });
  });

  it("never downloads for a timing-only user", async () => {
    const { dispatch, coach } = await mount();
    await click(card("off"));
    await click(next());
    expect(coach.startDownload).not.toHaveBeenCalled();
    expect(coach.setBrainTier).toHaveBeenCalledWith("off");
    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: "SET_CONTEXT",
      patch: { coachTier: "off", tryListening: false },
    });
  });

  it("persists nothing and downloads nothing on Skip", async () => {
    const { dispatch, coach } = await mount();
    await click(card("standard"));
    await click(skip());
    expect(coach.startDownload).not.toHaveBeenCalled();
    expect(coach.setBrainTier).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "SKIP_STEP" });
  });

  it("re-downloads nothing when the tier is already complete on disk", async () => {
    const { coach } = await mount({ modelStatus: installed("standard") });
    await click(next());
    expect(coach.setBrainTier).toHaveBeenCalledWith("standard");
    expect(coach.startDownload).not.toHaveBeenCalled();
  });

  it("fetches the missing voices for a brain that is installed without them", async () => {
    const { coach } = await mount({ modelStatus: installed("standard", false) });
    await click(next());
    expect(coach.startDownload).toHaveBeenCalledTimes(1);
    expect(coach.startDownload).toHaveBeenCalledWith("standard");
  });

  it("does not start a second download while one is already running", async () => {
    const { coach } = await mount({ downloading: true, downloadFraction: 0.3 });
    await click(card("standard"));
    await click(next());
    expect(coach.setBrainTier).toHaveBeenCalledWith("standard");
    expect(coach.startDownload).not.toHaveBeenCalled();
  });
});

describe("W4 — the optional listening branch (decision 3)", () => {
  it("is offered only to timing-only users", async () => {
    await mount();
    expect(screen.queryByTestId("coach-try-listening")).toBeNull();
    await click(card("off"));
    expect(screen.getByTestId("coach-try-listening")).toBeInTheDocument();
  });

  it("records the intent for O5 when ticked", async () => {
    const { dispatch } = await mount({ llmCompiled: false });
    const checkbox = within(screen.getByTestId("coach-try-listening")).getByRole("checkbox");
    await click(checkbox);
    // Ticking it is a selection, not navigation.
    expect(dispatch).not.toHaveBeenCalled();
    await click(next());
    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: "SET_CONTEXT",
      patch: { coachTier: "off", tryListening: true },
    });
  });
});

describe("W4 — the download bar in the footer", () => {
  it("shows the progress of the download the step handed off", async () => {
    await mount({ downloading: true, downloadFraction: 0.42 });
    const bar = screen.getByTestId("onboarding-download-bar");
    expect(bar).toHaveAttribute("aria-valuenow", "42");
  });

  it("survives the move to a later step", async () => {
    await mount({
      downloading: true,
      downloadFraction: 0.6,
      state: stateAt("ready", { coachTier: "standard" }),
    });
    expect(screen.getByTestId("onboarding-download-bar")).toHaveAttribute(
      "aria-valuenow",
      "60",
    );
  });

  it("is absent when nothing is downloading", async () => {
    await mount();
    expect(screen.queryByTestId("onboarding-download-bar")).toBeNull();
  });
});

describe("W7 — the coach row goes live once the step is registered", () => {
  it("links back to W4 and reflects the chosen tier", async () => {
    const { dispatch } = harness({ state: stateAt("ready", { coachTier: "standard" }) });
    await act(async () => {
      render(
        <OnboardingWizard
          state={stateAt("ready", { coachTier: "standard" })}
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
          softClickPlaying={false}
          onFinish={vi.fn()}
        />,
      );
    });
    const row = screen.getByText("Practice coach").closest("button");
    expect(row).not.toBeNull();
    expect(within(row!).getByText("On")).toBeInTheDocument();
    await click(row!);
    expect(dispatch).toHaveBeenCalledWith({ type: "JUMP", stepId: "coach" });
  });
});
