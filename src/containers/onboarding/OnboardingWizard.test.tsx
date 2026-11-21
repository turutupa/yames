/**
 * Wizard shell + the three O1 steps + the chip.
 *
 * The shell is driven with an explicit machine state and a spy dispatch, so
 * these tests assert what the UI *emits* — the transitions themselves are
 * covered by `onboardingMachine.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { mockInvoke } from "../../test/mocks";
import { engineTick } from "../../test/engineTicks";
import { useWizardEnv } from "./WizardContext";
import { FinishSetupChip } from "./FinishSetupChip";
import { PREVIEW_DEBOUNCE_MS } from "./steps/SoundLookStep";
import { OnboardingWizard, type OnboardingWizardProps } from "./OnboardingWizard";
import { ONBOARDING_STEPS } from "./steps";
import {
  INITIAL_ONBOARDING_STATE,
  type OnboardingContext,
  type OnboardingState,
  type StepId,
} from "./onboardingMachine";

/** Steps the registry offers for a given context — the shell's own rule. */
function reachableSteps(context: OnboardingContext): Set<StepId> {
  return new Set(
    ONBOARDING_STEPS.filter((s) => (s.isEnabled ? s.isEnabled(context) : true)).map(
      (s) => s.id,
    ),
  );
}

function stateAt(stepId: StepId, visited: StepId[] = [stepId]): OnboardingState {
  return {
    status: stepId === "welcome" ? "welcome" : "step",
    stepId,
    context: { skipped: [], visited },
  };
}

/**
 * A step that stages nothing, so Next is enabled from the start. Used by the
 * shell-chrome tests — W1 deliberately gates Next until a card is selected,
 * which is the subject of its own tests below.
 */
function PlainStep() {
  return (
    <div className="onboarding-step">
      <button type="button">plain</button>
    </div>
  );
}
const PLAIN_STEPS = ONBOARDING_STEPS.map((s) =>
  s.id === "instrument" ? { ...s, Component: PlainStep } : s,
);

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
    // PLAIN_STEPS only swaps W1's component (same ids, same gates), so the dot
    // count still derives from the real registry — W1 gates Next until a card
    // is picked, which is the subject of its own tests below.
    const { container } = setup({ state: stateAt("instrument"), steps: PLAIN_STEPS });
    // One dot per registered step minus W0 — derived so registering a step
    // (O2–O5) doesn't need this number edited.
    const dots = ONBOARDING_STEPS.filter(
      (s) => !s.hideInProgress && reachableSteps({ skipped: [], visited: [] }).has(s.id),
    ).length;
    expect(container.querySelectorAll(".onboarding-dot")).toHaveLength(dots);
    expect(container.querySelector(".onboarding-dot.active")).not.toBeNull();
    // Back on the first step is live: it returns to W0.
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Skip" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("footer buttons dispatch NEXT / BACK / SKIP_STEP", () => {
    const { dispatch } = setup({ state: stateAt("instrument"), steps: PLAIN_STEPS });
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

  it("Esc on W0 of a first run does nothing (acceptance P1-6)", () => {
    const { dispatch } = setup();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("Esc on W0 of a run the player opened again closes it", () => {
    const { dispatch } = setup({
      state: { status: "welcome", stepId: "welcome", context: { skipped: [], visited: ["welcome"], rerun: true } },
    });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dispatch).toHaveBeenCalledWith({ type: "CLOSE" });
  });

  it("Esc on a step goes back a step, never forward", () => {
    const { dispatch } = setup({ state: stateAt("instrument") });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dispatch).toHaveBeenCalledWith({ type: "BACK" });
    expect(dispatch).not.toHaveBeenCalledWith({ type: "SKIP_STEP" });
  });

  it("←/→ navigate on a step and do nothing on W0", () => {
    const { dispatch } = setup({ state: stateAt("instrument"), steps: PLAIN_STEPS });
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
        "A guitar coach that listens. Choose a Path, and each day's Session fits the minutes you have.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/v9\.9\.9/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Set me up (about two minutes)" }),
    ).toBeInTheDocument();
  });

  it("starts the preview click when it appears", () => {
    const startSoftClick = vi.fn();
    setup({ startSoftClick });
    expect(startSoftClick).toHaveBeenCalled();
  });

  it("'Set me up' dispatches START_SETUP", () => {
    const { dispatch } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Set me up (about two minutes)" }));
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
        // Beat two of the bar, which the engine reports as a downbeat — the
        // field means "a whole beat and not a subdivision". The mark pulses
        // on the beat, so beat two is the one worth asking about; the tick
        // this used to build, with `isDownbeat: false` on a whole beat, was
        // one no engine emits.
        currentBeat={engineTick({ beat: 1 })}
      />,
    );
    expect(container.querySelector(".onboarding-logo.pulsing")).not.toBeNull();
  });
});

describe("W1 — instrument (guitar first)", () => {
  it("offers the two guitars and nothing else", () => {
    const { container } = setup({ state: stateAt("instrument") });
    expect(container.querySelector(".instrument-picker-grid.is-pair")).not.toBeNull();
    expect(container.querySelectorAll(".instrument-picker-card")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Electric Guitar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Acoustic Guitar/ })).toBeInTheDocument();
    for (const name of [/Bass/, /Drums/, /Piano/]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("says the other instruments live in Settings", () => {
    setup({ state: stateAt("instrument") });
    expect(screen.getByText(/Bass, drums or piano\? Choose it in Settings/)).toBeInTheDocument();
  });

  it("preselects Electric on a true first run, so Next is open", () => {
    const { container } = setup({ state: stateAt("instrument") });
    const selected = container.querySelectorAll(".instrument-picker-card.selected");
    expect(selected).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Electric Guitar/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Acoustic Guitar/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("Next on a first run persists the preselected electric guitar", () => {
    const onInstrumentChange = vi.fn();
    const { dispatch } = setup({ state: stateAt("instrument"), onInstrumentChange });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onInstrumentChange).toHaveBeenCalledWith("electric-guitar");
    expect(dispatch).toHaveBeenCalledWith({ type: "NEXT" });
  });

  it("preselects the current guitar on a re-run", () => {
    setup({ state: stateAt("instrument"), instrument: "acoustic-guitar", instrumentChosen: true });
    expect(screen.getByRole("button", { name: /Acoustic Guitar/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("a re-run keeps a non-guitar choice unless a guitar is picked", () => {
    const onInstrumentChange = vi.fn();
    const { container, dispatch } = setup({
      state: stateAt("instrument"),
      instrument: "drums",
      instrumentChosen: true,
      onInstrumentChange,
    });
    expect(container.querySelector(".instrument-picker-card.selected")).toBeNull();
    expect(screen.getByTestId("instrument-keep-current")).toHaveTextContent("Drums");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onInstrumentChange).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: "NEXT" });
  });

  it("clicking a card only selects it — it never advances or persists", () => {
    const onInstrumentChange = vi.fn();
    const { dispatch } = setup({
      state: stateAt("instrument"),
      onInstrumentChange,
    });
    fireEvent.click(screen.getByRole("button", { name: /Acoustic Guitar/ }));
    expect(screen.getByRole("button", { name: /Acoustic Guitar/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Electric Guitar/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(onInstrumentChange).not.toHaveBeenCalled();
  });

  it("Next persists the selection, then advances", () => {
    const onInstrumentChange = vi.fn();
    const { dispatch } = setup({ state: stateAt("instrument"), onInstrumentChange });
    fireEvent.click(screen.getByRole("button", { name: /Acoustic Guitar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onInstrumentChange).toHaveBeenCalledTimes(1);
    expect(onInstrumentChange).toHaveBeenCalledWith("acoustic-guitar");
    expect(dispatch).toHaveBeenCalledWith({ type: "NEXT" });
  });

  it("Skip advances without persisting anything (the shell falls back to electric)", () => {
    const onInstrumentChange = vi.fn();
    const { dispatch } = setup({ state: stateAt("instrument"), onInstrumentChange });
    fireEvent.click(screen.getByRole("button", { name: /Acoustic Guitar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onInstrumentChange).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: "SKIP_STEP" });
  });

  it("Enter and → advance with the preselected guitar", () => {
    const onInstrumentChange = vi.fn();
    const { dispatch } = setup({ state: stateAt("instrument"), onInstrumentChange });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onInstrumentChange).toHaveBeenCalledWith("electric-guitar");
    expect(dispatch).toHaveBeenCalledWith({ type: "NEXT" });
  });
});

describe("W2 — sound & look", () => {
  const at = { state: stateAt("sound-look", ["welcome", "instrument", "sound-look"]) };

  /** ids passed to a Tauri setter, in call order. */
  function calls(command: "set_sound_type" | "set_theme"): string[] {
    return mockInvoke.mock.calls
      .filter(([cmd]) => cmd === command)
      .map(([, args]) =>
        String(
          (args as Record<string, string>)[
            command === "set_theme" ? "theme" : "soundType"
          ],
        ),
      );
  }

  /** Let the preview debounce elapse. */
  function settle() {
    act(() => {
      vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS + 10);
    });
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("offers every engine sound and the three curated themes", () => {
    setup(at);
    for (const name of ["Click", "Wood", "Beep", "Drum"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    for (const name of ["Obsidian", "Aurora", "Ivory"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    // Curated, not the full grid — the other eight live in Settings.
    expect(screen.queryByRole("button", { name: "Lavender" })).toBeNull();
    // The current sound is marked, and Obsidian is the confirmed theme here.
    expect(screen.getByRole("button", { name: "Wood" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Obsidian" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps the click audible even when W0 was never shown", () => {
    const startSoftClick = vi.fn();
    setup({ ...at, startSoftClick });
    expect(startSoftClick).toHaveBeenCalled();
  });

  it("opens with the chosen sound focused, not the first card (acceptance 5, P2-6)", () => {
    setup(at);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Wood" }));
  });

  it("the shell's opening focus does not change the user's sound", () => {
    setup(at);
    settle();
    expect(calls("set_sound_type")).toEqual([]);
  });

  it("focusing a sound card previews it, debounced", () => {
    setup(at);
    fireEvent.focus(screen.getByRole("button", { name: "Beep" }));
    expect(calls("set_sound_type")).toEqual([]); // not yet — debounced
    settle();
    expect(calls("set_sound_type")).toEqual(["beep"]);
    // A preview is not a choice: the confirmed card is still Wood.
    expect(screen.getByRole("button", { name: "Wood" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("a fast sweep across cards only reaches the engine once", () => {
    setup(at);
    fireEvent.focus(screen.getByRole("button", { name: "Beep" }));
    fireEvent.focus(screen.getByRole("button", { name: "Drum" }));
    fireEvent.focus(screen.getByRole("button", { name: "Click" }));
    settle();
    expect(calls("set_sound_type")).toEqual(["click"]);
  });

  it("leaving a card puts the confirmed sound back", () => {
    setup(at);
    const beep = screen.getByRole("button", { name: "Beep" });
    fireEvent.focus(beep);
    settle();
    fireEvent.blur(beep);
    settle();
    expect(calls("set_sound_type")).toEqual(["beep", "wood"]);
  });

  it("hovering previews too, and un-hovering rolls back", () => {
    setup(at);
    const drum = screen.getByRole("button", { name: "Drum" });
    fireEvent.mouseEnter(drum);
    settle();
    expect(calls("set_sound_type")).toEqual(["drum"]);
    fireEvent.mouseLeave(drum);
    settle();
    expect(calls("set_sound_type")).toEqual(["drum", "wood"]);
  });

  it("moving from a sound card onto a theme card still rolls the sound back", () => {
    // The two columns debounce independently: a shared timer let the theme
    // hover swallow the sound's pending rollback and strand the click on a
    // preview (caught driving the real app).
    setup(at);
    const beep = screen.getByRole("button", { name: "Beep" });
    fireEvent.mouseEnter(beep);
    settle();
    fireEvent.mouseLeave(beep);
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Aurora" }));
    settle();
    expect(calls("set_sound_type")).toEqual(["beep", "wood"]);
    expect(calls("set_theme")).toEqual(["aurora"]);
  });

  it("focusing a theme card restyles the window behind the overlay", () => {
    setup(at);
    fireEvent.focus(screen.getByRole("button", { name: "Aurora" }));
    settle();
    expect(calls("set_theme")).toEqual(["aurora"]);
  });

  it("picking persists immediately, exactly like the Settings controls", () => {
    setup(at);
    fireEvent.click(screen.getByRole("button", { name: "Beep" }));
    fireEvent.click(screen.getByRole("button", { name: "Ivory" }));
    // No timer needed: a pick is not a preview.
    expect(calls("set_sound_type")).toEqual(["beep"]);
    expect(calls("set_theme")).toEqual(["ivory"]);
    expect(screen.getByRole("button", { name: "Beep" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Ivory" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("picking a card never advances the step — only Next does", () => {
    const { dispatch } = setup(at);
    fireEvent.click(screen.getByRole("button", { name: "Beep" }));
    fireEvent.click(screen.getByRole("button", { name: "Aurora" }));
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: "NEXT" });
  });

  it("Esc/Back restores the previously confirmed sound and theme", () => {
    const { rerender, props } = setup(at);
    fireEvent.focus(screen.getByRole("button", { name: "Drum" }));
    fireEvent.focus(screen.getByRole("button", { name: "Aurora" }));
    settle();
    expect(calls("set_sound_type")).toEqual(["drum"]);
    expect(calls("set_theme")).toEqual(["aurora"]);
    // Esc skips the step: the shell moves on and W2 unmounts mid-preview.
    act(() => {
      rerender(<OnboardingWizard {...props} state={stateAt("ready")} />);
    });
    expect(calls("set_sound_type")).toEqual(["drum", "wood"]);
    expect(calls("set_theme")).toEqual(["aurora", "obsidian"]);
  });

  it("what was picked survives Next", () => {
    const { rerender, props } = setup(at);
    fireEvent.click(screen.getByRole("button", { name: "Drum" }));
    fireEvent.click(screen.getByRole("button", { name: "Aurora" }));
    act(() => {
      rerender(<OnboardingWizard {...props} state={stateAt("ready")} />);
    });
    expect(calls("set_sound_type")).toEqual(["drum"]);
    expect(calls("set_theme")).toEqual(["aurora"]);
  });

  it("preselects Obsidian when no theme was ever chosen (decision 2)", () => {
    setup({ ...at, themeId: "mono" });
    expect(calls("set_theme")).toEqual(["obsidian"]);
    expect(screen.getByRole("button", { name: "Obsidian" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("never hijacks a theme the user already chose", () => {
    const { container } = setup({ ...at, themeId: "lavender" });
    expect(calls("set_theme")).toEqual([]);
    expect(container.querySelector(".onboarding-theme-card.active")).toBeNull();
  });

  it("a hover over a theme the user did not have goes back to theirs (Lavender, say)", () => {
    // A theme outside the three is never "confirmed" by W2, so the rollback
    // had nothing to return to and the preview stuck (found 2026-11-18).
    const { rerender, props } = setup({ ...at, themeId: "lavender" });
    const ivory = screen.getByRole("button", { name: "Ivory" });
    fireEvent.mouseEnter(ivory);
    settle();
    fireEvent.mouseLeave(ivory);
    settle();
    expect(calls("set_theme")).toEqual(["ivory", "lavender"]);
    fireEvent.mouseEnter(ivory);
    settle();
    act(() => {
      rerender(<OnboardingWizard {...props} state={stateAt("ready")} />);
    });
    expect(calls("set_theme")).toEqual(["ivory", "lavender", "ivory", "lavender"]);
  });

  it("shows the learning side in the hovered theme, then the chosen one", () => {
    setup(at);
    const preview = () => screen.getByTestId("onboarding-theme-preview");
    expect(preview()).toHaveAttribute("data-theme-preview", "obsidian");
    // The neck is the real graphic neck, at a small size.
    expect(preview().querySelector('[data-testid="neck-fallback"]')).not.toBeNull();
    const aurora = screen.getByRole("button", { name: "Aurora" });
    fireEvent.mouseEnter(aurora);
    expect(preview()).toHaveAttribute("data-theme-preview", "aurora");
    // The preview wears the theme's tokens itself; the wizard keeps its own.
    expect(preview().style.getPropertyValue("--bg-primary")).not.toBe("");
    fireEvent.mouseLeave(aurora);
    expect(preview()).toHaveAttribute("data-theme-preview", "obsidian");
  });

  it("'More themes in Settings' is hidden until the app wires the detour", () => {
    setup(at);
    expect(screen.queryByRole("button", { name: /More themes/ })).toBeNull();
    const onOpenThemeSettings = vi.fn();
    setup({ ...at, onOpenThemeSettings });
    fireEvent.click(screen.getByRole("button", { name: "More themes in Settings" }));
    expect(onOpenThemeSettings).toHaveBeenCalled();
  });

  it("hiding the wizard for the Settings detour keeps the confirmed setup", () => {
    const { container, rerender, props } = setup(at);
    fireEvent.click(screen.getByRole("button", { name: "Ivory" }));
    act(() => {
      rerender(<OnboardingWizard {...props} hidden />);
    });
    expect(container.querySelector(".onboarding-overlay")).toBeNull();
    expect(calls("set_theme")).toEqual(["ivory"]);
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
    // Leg c6a: the coach row says what Off is now, as the coach step does.
    expect(screen.getByText("Off: answers from your Takes and Paths")).toBeInTheDocument();
    expect(screen.getByText("Not set up")).toBeInTheDocument();
  });

  it("a row for a registered step is a button that jumps there", () => {
    const { dispatch } = setup(ready);
    const row = screen.getByText("Instrument").closest("button");
    expect(row).not.toBeNull();
    fireEvent.click(row!);
    expect(dispatch).toHaveBeenCalledWith({ type: "JUMP", stepId: "instrument" });
  });

  it("the sound and theme rows went live when O2 registered its step", () => {
    const { dispatch } = setup(ready);
    for (const label of ["Click sound", "Theme"]) {
      const row = screen.getByText(label).closest("button");
      expect(row, `${label} row should jump to W2`).not.toBeNull();
      fireEvent.click(row!);
    }
    expect(dispatch).toHaveBeenCalledWith({ type: "JUMP", stepId: "sound-look" });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("the control row went live when O3 registered its step", () => {
    const { dispatch } = setup(ready);
    const row = screen.getByText("Control").closest("button");
    expect(row, "Control row should jump to W3").not.toBeNull();
    fireEvent.click(row!);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({
      type: "JUMP",
      stepId: "hands-free",
    });
  });

  it("a row is a button exactly when its step is registered", () => {
    setup(ready);
    const reachable = reachableSteps(ready.state.context);
    const rowTargets: [string, StepId][] = [
      ["Click sound", "sound-look"],
      ["Theme", "sound-look"],
      ["Control", "hands-free"],
      ["Coach model", "coach"],
      ["Audio input", "audio-input"],
    ];
    for (const [label, target] of rowTargets) {
      const row = screen.getByText(label).closest(".onboarding-summary-row");
      expect(row, label).not.toBeNull();
      if (reachable.has(target)) {
        expect(row!.tagName, label).toBe("BUTTON");
      } else {
        // A clickable-looking row that leads nowhere is worse than plain text.
        expect(row!.tagName, label).toBe("DIV");
        expect(row, label).toHaveClass("onboarding-summary-static");
      }
    }
  });

  it("toggles always-on-top through the existing setter", () => {
    const onAlwaysOnTopChange = vi.fn();
    const { container } = setup({ ...ready, onAlwaysOnTopChange });
    const row = container.querySelector(".onboarding-summary-toggle") as HTMLElement;
    const toggle = within(row).getByRole("button");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);
    expect(onAlwaysOnTopChange).toHaveBeenCalledWith(false);
  });

  it("'Go to Today' closes the wizard", () => {
    const { dispatch } = setup(ready);
    fireEvent.click(screen.getByRole("button", { name: "Go to Today" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "CLOSE" });
  });

  it("hides the tour button until the shell wires one up, and it is Show me around", () => {
    setup(ready);
    expect(screen.queryByRole("button", { name: /Show me around/ })).toBeNull();
    const onRequestTour = vi.fn();
    setup({ ...ready, onRequestTour });
    fireEvent.click(screen.getByRole("button", { name: /Show me around/ }));
    expect(onRequestTour).toHaveBeenCalled();
  });
});

/**
 * The contract O2–O5 build against: a step stages a choice, gates Next, and
 * hands the shell a commit that runs on Next and only on Next.
 */
describe("step commit contract", () => {
  const commitSpy = vi.fn();

  function StagingStep() {
    const { setStepCommit, setNextEnabled } = useWizardEnv();
    const [picked, setPicked] = useState(false);
    useEffect(() => {
      setNextEnabled(picked);
      setStepCommit(picked ? () => commitSpy() : null);
    }, [picked, setNextEnabled, setStepCommit]);
    return (
      <button type="button" onClick={() => setPicked(true)}>
        stage it
      </button>
    );
  }

  const STAGING_STEPS = ONBOARDING_STEPS.map((s) =>
    s.id === "instrument" ? { ...s, Component: StagingStep } : s,
  );
  const staging = { state: stateAt("instrument"), steps: STAGING_STEPS };

  beforeEach(() => commitSpy.mockClear());

  it("gates Next until the step says it is ready", () => {
    const { dispatch } = setup(staging);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "stage it" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("runs the commit before advancing", () => {
    const { dispatch } = setup(staging);
    fireEvent.click(screen.getByRole("button", { name: "stage it" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "NEXT" });
  });

  it("never runs the commit on Skip or Back", () => {
    const { dispatch } = setup(staging);
    fireEvent.click(screen.getByRole("button", { name: "stage it" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(commitSpy).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: "SKIP_STEP" });
    expect(dispatch).toHaveBeenCalledWith({ type: "BACK" });
  });

  it("clears the gate and the commit when the step changes", () => {
    const { rerender, props } = setup(staging);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    // W7 registers nothing, so Next must not stay stuck off.
    rerender(
      <OnboardingWizard
        {...props}
        steps={STAGING_STEPS}
        state={stateAt("ready", ["instrument", "ready"])}
      />,
    );
    expect(screen.getByRole("button", { name: "Go to Today" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Go to Today" }));
    expect(commitSpy).not.toHaveBeenCalled();
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
