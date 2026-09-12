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
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { IS_MOBILE } from "./platform";
import { MainWindow } from "./containers/main-window/MainWindow";
import { MetronomeView } from "./containers/metronome/MetronomeView";
import { SettingsView } from "./containers/settings/SettingsView";
import { OnboardingWizard } from "./containers/onboarding/OnboardingWizard";
import { ONBOARDING_STEPS } from "./containers/onboarding/steps";
import { SERVICE_START_DELAY_MS } from "./containers/main-window/hooks/useAndroidNative";
import { INITIAL_ONBOARDING_STATE } from "./containers/onboarding/onboardingMachine";
import { INERT_EVALUATION, INERT_MIDI } from "./platform.inert";
import { DEFAULT_TEST_STATE, mockInvoke, mockListen, setInvokeResponse } from "./test/mocks";

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
    const tabs = screen.getByRole("navigation", { name: /modes/i });
    expect(tabs).toBeInTheDocument();
    expect(
      [...tabs.querySelectorAll(".mobile-tab[data-tab] .mobile-tab-label")].map(
        (el) => el.textContent,
      ),
    ).toEqual(["Metronome", "Drill", "Setlist", "Settings"]);

    // Zen ships on a phone (plan §1) and the rail was its only door.
    expect(container.querySelector(".mobile-tab-zen")).not.toBeNull();
  });

  // M05, found on the first release build: a fresh install raised Android's
  // "Allow Yames to send you notifications?" dialog over the welcome screen,
  // before the user had pressed anything. The wizard demonstrates the app by
  // running a soft 80 BPM click while it is open, that click is the engine's
  // transport, and the transport is what starts the foreground service.
  it("does not start the foreground service for the wizard's demo click", async () => {
    mockInvoke.mockClear();
    mockListen.mockClear();
    render(<MainWindow />);

    // The wizard is open (no saved onboarding version in the mocked store) and
    // has asked the engine for its demo click, exactly as it does on a first
    // launch.
    await waitFor(() =>
      expect(document.querySelector(".onboarding-overlay")).not.toBeNull(),
    );
    await waitFor(() =>
      expect(
        mockInvoke.mock.calls.some(([cmd]) => cmd === "toggle_playback"),
      ).toBe(true),
    );

    // The engine answers the way it does in the app: it is now playing. This
    // is the moment the guard exists for — the transport is live and no human
    // pressed anything.
    const stateListener = mockListen.mock.calls.find(
      ([event]) => event === "state-changed",
    )?.[1] as ((e: { payload: typeof DEFAULT_TEST_STATE }) => void) | undefined;
    expect(stateListener).toBeDefined();
    await act(async () => {
      stateListener!({ payload: { ...DEFAULT_TEST_STATE, isPlaying: true, bpm: 80 } });
    });

    // Real time, and longer than `SERVICE_START_DELAY_MS`: the hook's delay
    // would swallow this on its own, and what is under test here is the guard
    // that keeps the service away for as long as the demo runs — which is the
    // whole time the wizard is open, not half a second.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, SERVICE_START_DELAY_MS + 200));
    });

    const started = mockInvoke.mock.calls
      .filter(([cmd]) => cmd === "plugin:yames-mobile|set_background_audio")
      .map(([, args]) => (args as { payload: { active: boolean } }).payload.active);
    expect(started).not.toContain(true);
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

  it("shows general, appearance, support and about — and nothing else", async () => {
    render(<SettingsView {...props} />);

    // The sections a phone keeps.
    expect(await screen.findByText("General")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("About")).toBeInTheDocument();

    // Devices is gone entirely, heading and all. The input and MIDI halves
    // were always cut; the output picker went with M05, because Android does
    // its own routing and `set_audio_output_device` changes nothing there —
    // so what was left was a heading over a dropdown that does nothing.
    expect(screen.queryByText("Devices")).toBeNull();
    expect(screen.queryByText("Audio Output")).toBeNull();
    expect(screen.queryByText("Audio Input")).toBeNull();
    expect(screen.queryByText("MIDI")).toBeNull();
    expect(screen.queryByText("Hotkeys")).toBeNull();
    expect(screen.queryByText("Widget")).toBeNull();
    expect(screen.queryByText(/always on top/i)).toBeNull();
    expectNoCoachAnywhere();
  });
});

describe("the onboarding wizard on a phone", () => {
  it("is three steps: welcome, sound & look, ready", () => {
    // The instrument question is cut on a phone (M03d): nothing on mobile
    // reads the answer, since the coach and the mic evaluation — its only
    // consumers — do not exist there.
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual([
      "welcome",
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

  it("warns on the last step that the first Play raises a permission prompt", async () => {
    render(
      <OnboardingWizard
        state={{
          ...INITIAL_ONBOARDING_STATE,
          status: "step",
          stepId: "ready",
        }}
        dispatch={() => {}}
        appVersion="1.0.4"
        instrument="electric-guitar"
        instrumentChosen
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

    // Not the wording, which is copy and will be reworded — that the phone
    // says what it is about to ask for before it asks, rather than raising the
    // prompt unannounced a second after the first Play (M04 findings).
    expect(
      await screen.findByText(/ask if Yames can show a notification/i),
    ).toBeInTheDocument();
  });
});
