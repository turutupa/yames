/**
 * Wizard shell + the three O1 steps + the chip.
 *
 * The shell is driven with an explicit machine state and a spy dispatch, so
 * these tests assert what the UI *emits* — the transitions themselves are
 * covered by `onboardingMachine.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { FinishSetupChip } from "./FinishSetupChip";
import { OnboardingWizard, type OnboardingWizardProps } from "./OnboardingWizard";
import {
  INITIAL_ONBOARDING_STATE,
  type OnboardingState,
  type StepId,
} from "./onboardingMachine";

function stateAt(stepId: StepId, visited: StepId[] = [stepId]): OnboardingState {
  return {
    status: stepId === "welcome" ? "welcome" : "step",
    stepId,
    context: { skipped: [], visited },
  };
}

function setup(overrides: Partial<OnboardingWizardProps> = {}) {
  const dispatch = vi.fn();
  const props: OnboardingWizardProps = {
    state: stateAt("welcome"),
    dispatch,
    appVersion: "1.0.4",
    instrument: "electric-guitar",
    instrumentChosen: false,
    onInstrumentChange: vi.fn(),
    soundType: "wood",
    themeId: "obsidian",
    coachTier: "off",
    inputDeviceName: null,
    alwaysOnTop: true,
    onAlwaysOnTopChange: vi.fn(),
    startSoftClick: vi.fn(),
    stopSoftClick: vi.fn(),
    softClickPlaying: false,
    onFinish: vi.fn(),
    ...overrides,
  };
  const utils = render(<OnboardingWizard {...props} />);
  return { ...utils, props, dispatch };
}

describe("wizard shell", () => {
  it("renders nothing when the machine is idle", () => {
    const { container } = setup({ state: INITIAL_ONBOARDING_STATE });
    expect(container.querySelector(".onboarding-overlay")).toBeNull();
  });

  it("renders a modal dialog with a labelled title", () => {
    setup();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("data-step", "welcome");
  });

  it("hides the progress dots and the footer on W0", () => {
    const { container } = setup();
    expect(container.querySelector(".onboarding-progress")).toBeNull();
    expect(container.querySelector(".onboarding-footer")).toBeNull();
  });

  it("shows progress dots and Back/Skip/Next on a step", () => {
    const { container } = setup({ state: stateAt("instrument") });
    expect(container.querySelectorAll(".onboarding-dot")).toHaveLength(2);
    expect(container.querySelector(".onboarding-dot.active")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Skip" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("footer buttons dispatch NEXT / BACK / SKIP_STEP", () => {
    const { dispatch } = setup({ state: stateAt("instrument") });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "NEXT" });
    expect(dispatch).toHaveBeenCalledWith({ type: "SKIP_STEP" });
  });

  it("the last step carries its own action, so the footer only offers Back", () => {
    setup({ state: stateAt("ready") });
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
  });

  it("Esc on W0 is 'Just give me the click' (SKIP_ALL)", () => {
    const { dispatch } = setup();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dispatch).toHaveBeenCalledWith({ type: "SKIP_ALL" });
  });

  it("Esc on a step skips just that step", () => {
    const { dispatch } = setup({ state: stateAt("instrument") });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dispatch).toHaveBeenCalledWith({ type: "SKIP_STEP" });
  });

  it("←/→ navigate on a step and do nothing on W0", () => {
    const { dispatch } = setup({ state: stateAt("instrument") });
    fireEvent.keyDown(document, { key: "ArrowRight" });
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(dispatch).toHaveBeenCalledWith({ type: "NEXT" });
    expect(dispatch).toHaveBeenCalledWith({ type: "BACK" });

    const welcome = setup();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(welcome.dispatch).not.toHaveBeenCalled();
  });

  it("traps focus inside the card", () => {
    const { container } = setup({ state: stateAt("instrument") });
    const card = container.querySelector(".onboarding-card") as HTMLElement;
    const items = Array.from(
      card.querySelectorAll<HTMLElement>("button:not([disabled])"),
    );
    const last = items[items.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(card.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("focuses the first control of the step on open", () => {
    const { container } = setup({ state: stateAt("welcome") });
    const card = container.querySelector(".onboarding-card") as HTMLElement;
    expect(card.contains(document.activeElement)).toBe(true);
  });

  it("reports the outcome once when the machine reaches done", () => {
    const onFinish = vi.fn();
    const { rerender, props } = setup({ onFinish });
    expect(onFinish).not.toHaveBeenCalled();
    const done: OnboardingState = {
      status: "done",
      stepId: null,
      context: { skipped: [], visited: ["welcome"] },
      outcome: "skipped",
    };
    rerender(<OnboardingWizard {...props} state={done} />);
    rerender(<OnboardingWizard {...props} state={done} />);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith("skipped");
  });

  it("drops the entrance animation when view transitions are off", () => {
    const { container } = setup({ animate: false });
    expect(container.querySelector(".onboarding-overlay")).toHaveClass("no-motion");
  });
});

describe("W0 — welcome", () => {
  it("shows the product line, both paths and the version footer", () => {
    setup({ appVersion: "9.9.9" });
    expect(screen.getByRole("heading", { name: "Yames" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "A metronome built for real practice. Hands stay on the instrument.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/v9\.9\.9/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Set me up (about a minute)" }),
    ).toBeInTheDocument();
  });

  it("starts the preview click when it appears", () => {
    const startSoftClick = vi.fn();
    setup({ startSoftClick });
    expect(startSoftClick).toHaveBeenCalled();
  });

  it("'Set me up' dispatches START_SETUP", () => {
    const { dispatch } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Set me up (about a minute)" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "START_SETUP" });
  });

  it("'Just give me the click' dispatches SKIP_ALL", () => {
    const { dispatch } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Just give me the click" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "SKIP_ALL" });
  });

  it("pulses the mark on a beat while the preview click plays", () => {
    const { container, rerender, props } = setup({ softClickPlaying: true });
    rerender(
      <OnboardingWizard
        {...props}
        softClickPlaying
        currentBeat={{ beat: 1, measureBeat: 1, subdivision: 0, isDownbeat: false }}
      />,
    );
    expect(container.querySelector(".onboarding-logo.pulsing")).not.toBeNull();
  });
});

describe("W1 — instrument", () => {
  it("hosts the first-launch picker grid", () => {
    const { container } = setup({ state: stateAt("instrument") });
    expect(container.querySelector(".instrument-picker-grid")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Electric Guitar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bass/ })).toBeInTheDocument();
  });

  it("does not pre-select anything on a true first run", () => {
    const { container } = setup({ state: stateAt("instrument") });
    expect(container.querySelector(".instrument-picker-card.selected")).toBeNull();
  });

  it("marks the current instrument when one was already chosen", () => {
    setup({ state: stateAt("instrument"), instrument: "bass", instrumentChosen: true });
    expect(screen.getByRole("button", { name: /Bass/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("picking persists the choice and advances", () => {
    const onInstrumentChange = vi.fn();
    const { dispatch } = setup({
      state: stateAt("instrument"),
      onInstrumentChange,
    });
    fireEvent.click(screen.getByRole("button", { name: /Bass/ }));
    expect(onInstrumentChange).toHaveBeenCalledWith("bass");
    expect(dispatch).toHaveBeenCalledWith({ type: "NEXT" });
  });
});

describe("W7 — ready", () => {
  const ready = { state: stateAt("ready", ["welcome", "instrument", "ready"]) };

  it("summarises the setup, including steps O2–O5 will own", () => {
    const { container } = setup({ ...ready, instrument: "bass", soundType: "wood" });
    const rows = container.querySelectorAll(".onboarding-summary-row");
    expect(rows).toHaveLength(7); // 6 summary rows + the always-on-top row
    expect(screen.getByText("Bass")).toBeInTheDocument();
    expect(screen.getByText("Wood")).toBeInTheDocument();
    expect(screen.getByText("Obsidian")).toBeInTheDocument();
    expect(screen.getByText("Keyboard")).toBeInTheDocument();
    expect(screen.getByText("Timing feedback only")).toBeInTheDocument();
    expect(screen.getByText("Not set up")).toBeInTheDocument();
  });

  it("each row jumps back to the step that owns it", () => {
    const { dispatch } = setup(ready);
    fireEvent.click(screen.getByText("Instrument").closest("button")!);
    expect(dispatch).toHaveBeenCalledWith({ type: "JUMP", stepId: "instrument" });
    fireEvent.click(screen.getByText("Click sound").closest("button")!);
    expect(dispatch).toHaveBeenCalledWith({ type: "JUMP", stepId: "sound-look" });
  });

  it("toggles always-on-top through the existing setter", () => {
    const onAlwaysOnTopChange = vi.fn();
    const { container } = setup({ ...ready, onAlwaysOnTopChange });
    const row = container.querySelector(".onboarding-summary-static") as HTMLElement;
    const toggle = within(row).getByRole("button");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);
    expect(onAlwaysOnTopChange).toHaveBeenCalledWith(false);
  });

  it("'Start practicing' closes the wizard", () => {
    const { dispatch } = setup(ready);
    fireEvent.click(screen.getByRole("button", { name: "Start practicing" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "CLOSE" });
  });

  it("hides the tour button until O6 wires one up", () => {
    setup(ready);
    expect(screen.queryByRole("button", { name: /Show me around/ })).toBeNull();
    const onRequestTour = vi.fn();
    setup({ ...ready, onRequestTour });
    fireEvent.click(screen.getByRole("button", { name: /Show me around/ }));
    expect(onRequestTour).toHaveBeenCalled();
  });
});

describe("FinishSetupChip", () => {
  it("opens the wizard and dismisses itself", () => {
    const onOpen = vi.fn();
    const onDismiss = vi.fn();
    render(<FinishSetupChip onOpen={onOpen} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /Finish setup/ }));
    expect(onOpen).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
