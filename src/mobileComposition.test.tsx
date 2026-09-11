/**
 * The four screens, composed for a phone.
 *
 * `scripts/check-mobile-bundle.mjs` proves the cut code is not in `dist/`.
 * This proves the other half: that what is left still stands up, and that
 * nothing on screen mentions a feature the phone does not have. The mobile
 * plan's rule is stricter than "disabled" — absent, with no greyed tiles and
 * no "coming soon" (`plans/MOBILE_IMPLEMENTATION_PLAN.md` §1).
 *
 * Absence assertions pass for the wrong reason if the screen never rendered,
 * so every block asserts something POSITIVE first — the tempo readout, the
 * settings sections that do ship, the wizard's overlay — before asserting
 * what is gone. `mobileComposition.desktop.test.tsx` is the other control: it
 * runs the same queries with the flag off and finds the coach.
 */
import "./test/mobileFlag"; // MUST be first — see the file.

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { IS_MOBILE } from "./platform";
import { MainWindow } from "./containers/main-window/MainWindow";
import { MetronomeView } from "./containers/metronome/MetronomeView";
import { SettingsView } from "./containers/settings/SettingsView";
import { OnboardingWizard } from "./containers/onboarding/OnboardingWizard";
import { ONBOARDING_STEPS } from "./containers/onboarding/steps";
import { INITIAL_ONBOARDING_STATE } from "./containers/onboarding/onboardingMachine";
import { INERT_EVALUATION, INERT_MIDI } from "./platform.inert";
import { DEFAULT_TEST_STATE, mockInvoke, setInvokeResponse } from "./test/mocks";

/** Nothing the user reads may say "coach", in any casing. */
function expectNoCoachAnywhere() {
  expect(screen.queryByText(/coach/i)).toBeNull();
  expect(document.body.querySelector('[aria-label*="oach"]')).toBeNull();
  expect(document.body.querySelector('[title*="oach"]')).toBeNull();
}

beforeEach(() => {
  setInvokeResponse("get_state", () => DEFAULT_TEST_STATE);
});

describe("the phone build", () => {
  it("has the flag on — every assertion below depends on it", () => {
    expect(IS_MOBILE).toBe(true);
  });
});

describe("MainWindow on a phone", () => {
  it("is a metronome, with no coach and no window chrome", async () => {
    const { container } = render(<MainWindow />);

    // It rendered: the tempo readout is the one thing this screen is for.
    expect(
      await screen.findByText("120", { selector: ".bpm-input" }),
    ).toBeInTheDocument();

    // The coach: no rail row, no card, no download bars.
    expect(container.querySelector(".rail-action-coach")).toBeNull();
    expect(container.querySelector(".coach-card")).toBeNull();
    expectNoCoachAnywhere();

    // The window: no title bar, no widget button, no drag region.
    expect(container.querySelector(".title-bar")).toBeNull();
    expect(container.querySelector("[data-tauri-drag-region]")).toBeNull();
    expect(screen.queryByLabelText(/widget/i)).toBeNull();

    // The microphone, which only ever existed to feed the coach.
    expect(container.querySelector(".drift-meter")).toBeNull();
    expect(screen.queryByText(/listening/i)).toBeNull();
  });

  // M03b: the 252px rail is gone on a phone and the four screens are a bottom
  // tab bar, with the library as a sheet the bar opens rather than a drawer
  // over the stage. The rail itself is untouched — `mobileComposition.desktop`
  // is what proves it is still there with the flag off.
  it("navigates from a bottom tab bar, not the rail", async () => {
    const { container } = render(<MainWindow />);
    await screen.findByText("120", { selector: ".bpm-input" });

    expect(container.querySelector(".rail")).toBeNull();
    const tabs = screen.getByRole("navigation", { name: /screens/i });
    expect(tabs).toBeInTheDocument();
    expect(
      [...tabs.querySelectorAll(".mobile-tab[data-tab] .mobile-tab-label")].map(
        (el) => el.textContent,
      ),
    ).toEqual(["Metronome", "Drill", "Setlist", "Settings"]);

    // Zen ships on a phone (plan §1) and the rail was its only door.
    expect(container.querySelector(".mobile-tab-zen")).not.toBeNull();
  });

  it("opens the library as a sheet, and it starts closed", async () => {
    render(<MainWindow />);
    await screen.findByText("120", { selector: ".bpm-input" });

    // Closed: nothing of the library is on screen, and the stage is not
    // sitting behind a preset list nobody asked for.
    expect(document.querySelector(".sheet--library")).toBeNull();
    expect(document.querySelector(".preset-sidebar")).toBeNull();

    fireEvent.click(document.querySelector(".mobile-tab-library") as HTMLElement);

    const sheet = document.querySelector(".sheet--library");
    expect(sheet).not.toBeNull();
    expect(sheet?.querySelector(".preset-sidebar")).not.toBeNull();
    // A scrim, so what is behind it reads as out of reach.
    expect(document.querySelector(".sheet-scrim")).not.toBeNull();
  });
});

describe("MetronomeView on a phone", () => {
  // Playing, with the evaluation reporting itself as on — the one state in
  // which the drift needle WOULD be drawn. Absent from a default-state render
  // proves nothing; absent from this one does.
  const props = {
    state: { ...DEFAULT_TEST_STATE, isPlaying: true },
    currentBeat: null,
    evaluation: { ...INERT_EVALUATION, enabled: true },
    activeBeat: -1,
    activeSub: -1,
    isDownbeat: false,
    sliderPercent: 35,
    tapActive: false,
    tapCount: 0,
    tapPulse: false,
    editingBpm: false,
    bpmEditValue: "120",
    setBpmEditValue: () => {},
    setEditingBpm: () => {},
    bpmInputRef: { current: null },
    onTap: () => {},
    onBpmChange: () => {},
    onStartBpmEdit: () => {},
    onCommitBpmEdit: () => {},
  };

  it("keeps tempo, meter and subdivision; drops the session card and the needle", () => {
    const { container } = render(<MetronomeView {...props} />);

    expect(
      screen.getByText("120", { selector: ".bpm-input" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".meter-section")).not.toBeNull();
    expect(container.querySelector(".sub-section")).not.toBeNull();

    expect(container.querySelector('[data-testid="drift-meter"]')).toBeNull();
    expectNoCoachAnywhere();
  });

  it("never asks for the session history — nothing here reads it", async () => {
    // `LastSession` renders nothing until a stored session comes back, so
    // whether it mounted at all is answered by whether anything asked. It
    // only asks with the metronome stopped, which is this render.
    render(<MetronomeView {...props} state={DEFAULT_TEST_STATE} />);
    await waitFor(() =>
      expect(screen.getByText("120", { selector: ".bpm-input" })).toBeInTheDocument(),
    );
    expect(
      mockInvoke.mock.calls.some((c) => c[0] === "get_session_history"),
    ).toBe(false);
  });
});

describe("SettingsView on a phone", () => {
  const props = {
    updateStatus: "idle" as const,
    setUpdateStatus: () => {},
    latestVersion: "",
    appVersion: "1.0.4",
    doUpdateCheck: () => {},
    autoCheckUpdates: true,
    setAutoCheckUpdates: () => {},
    alwaysOnTop: false,
    setAlwaysOnTop: () => {},
    buttonFlash: true,
    setButtonFlash: () => {},
    activeBorder: true,
    setActiveBorder: () => {},
    drillAutoCollapse: false,
    setDrillAutoCollapse: () => {},
    onRunSetupAgain: () => {},
    onTakeTour: () => {},
    themeId: "mono",
    setTheme: () => {},
    viewTransitions: "subtle" as const,
    setViewTransitions: () => {},
    animationStyle: "fade" as const,
    setAnimationStyle: () => {},
    audioOutputDevices: [],
    setAudioOutputDevices: () => {},
    selectedOutputDevice: "",
    setSelectedOutputDevice: () => {},
    evaluation: INERT_EVALUATION,
    midi: INERT_MIDI,
    onOpenInputTest: () => {},
    instrument: "electric-guitar",
    shareTooltip: false,
    onShareOption: () => {},
  };

  it("shows general, appearance, output, support and about — and nothing else", async () => {
    render(<SettingsView {...props} />);

    // The sections a phone keeps.
    expect(await screen.findByText("General")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("Devices")).toBeInTheDocument();
    expect(screen.getByText("Audio Output")).toBeInTheDocument();
    expect(screen.getByText("About")).toBeInTheDocument();

    // The three that are cut, plus the input half of Devices.
    expect(screen.queryByText("Audio Input")).toBeNull();
    expect(screen.queryByText("MIDI")).toBeNull();
    expect(screen.queryByText("Hotkeys")).toBeNull();
    expect(screen.queryByText("Widget")).toBeNull();
    expect(screen.queryByText(/always on top/i)).toBeNull();
    expectNoCoachAnywhere();
  });
});

describe("the onboarding wizard on a phone", () => {
  it("is four steps: welcome, instrument, sound & look, ready", () => {
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual([
      "welcome",
      "instrument",
      "sound-look",
      "ready",
    ]);
  });

  it("opens on welcome with no coach or microphone step in sight", async () => {
    render(
      <OnboardingWizard
        state={{
          ...INITIAL_ONBOARDING_STATE,
          status: "welcome",
          stepId: "welcome",
        }}
        dispatch={() => {}}
        appVersion="1.0.4"
        instrument="electric-guitar"
        instrumentChosen={false}
        onInstrumentChange={() => {}}
        soundType="click"
        themeId="mono"
        coachTier="off"
        alwaysOnTop={false}
        onAlwaysOnTopChange={() => {}}
        startSoftClick={() => {}}
        stopSoftClick={() => {}}
        softClickPlaying={false}
        onFinish={() => {}}
      />,
    );

    await waitFor(() =>
      expect(document.querySelector(".onboarding-overlay")).not.toBeNull(),
    );
    expectNoCoachAnywhere();
    expect(screen.queryByText(/microphone/i)).toBeNull();
    expect(screen.queryByText(/footswitch/i)).toBeNull();
  });
});
