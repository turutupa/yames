/**
 * The control for `mobileComposition.test.tsx`.
 *
 * Every assertion over there is "this is not on screen", and an assertion
 * like that passes for free if the query is wrong, the class name was
 * renamed, or the component quietly failed to render. So the same queries
 * run here with the flag OFF — where they must FIND the coach, the drift
 * needle, the window drag region and all eight onboarding steps.
 *
 * If this file ever goes red, the mobile file's absences stopped meaning
 * anything, whatever colour it is showing.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { IS_MOBILE } from "./platform";
import { MainWindow } from "./containers/main-window/MainWindow";
import { MetronomeView } from "./containers/metronome/MetronomeView";
import { ONBOARDING_STEPS } from "./containers/onboarding/steps";
import { INERT_EVALUATION } from "./platform.inert";
import { DEFAULT_TEST_STATE, mockInvoke, setInvokeResponse } from "./test/mocks";

beforeEach(() => {
  setInvokeResponse("get_state", () => DEFAULT_TEST_STATE);
});

describe("the desktop build", () => {
  it("has the flag off — this file is the control", () => {
    expect(IS_MOBILE).toBe(false);
  });
});

describe("MainWindow on desktop", () => {
  it("finds exactly what the phone build must not have", async () => {
    const { container } = render(<MainWindow />);
    expect(
      await screen.findByText("120", { selector: ".bpm-input" }),
    ).toBeInTheDocument();

    // The queries the mobile file asserts are null.
    expect(container.querySelector(".rail-action-coach")).not.toBeNull();
    expect(screen.getAllByLabelText(/coach/i).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/widget/i)).not.toBeNull();
  });
});

describe("MetronomeView on desktop", () => {
  // Playing, with the evaluation reporting itself as on — the state the
  // mobile file renders too, where the needle must NOT appear.
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

  it("draws the drift needle while the input is on and the click is running", () => {
    const { container } = render(<MetronomeView {...props} />);
    expect(container.querySelector('[data-testid="drift-meter"]')).not.toBeNull();
  });

  it("asks for the session history once the click stops", async () => {
    // `LastSession` renders nothing until a stored session comes back, so the
    // question it asks is the evidence that it mounted at all — and it only
    // asks when the metronome is stopped. On a phone it is not there to ask.
    render(<MetronomeView {...props} state={DEFAULT_TEST_STATE} />);
    await waitFor(() =>
      expect(
        mockInvoke.mock.calls.some((c) => c[0] === "get_session_history"),
      ).toBe(true),
    );
  });
});

describe("the onboarding wizard on desktop", () => {
  it("is all eight steps", () => {
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
