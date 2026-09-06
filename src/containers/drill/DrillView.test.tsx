/**
 * DrillView feature preservation tests.
 *
 * Locks in:
 * - Renders the climb from the speedRamp config (start, target, increment)
 * - Linear/Zigzag/Adaptive mode toggle buttons exist
 * - Clicking a cell calls start_speed_ramp_from with stepIdx + bpm + barIdx
 * - Cyclic toggle switches the speed_ramp.cyclic flag
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DrillView } from "./DrillView";
import { mockInvoke, DEFAULT_TEST_STATE } from "../../test/mocks";
import type { AppState } from "../../types";

const drillState: AppState = {
  ...DEFAULT_TEST_STATE,
  speedRamp: {
    ...DEFAULT_TEST_STATE.speedRamp,
    startBpm: 80,
    targetBpm: 100,
    increment: 10,
    decrement: 5,
    barsPerStep: 2,
    beatsPerBar: 4,
    mode: "linear",
    cyclic: false,
    aggressiveness: "moderate",
    active: false,
    warmupBeats: 4,
  },
};

describe("DrillView", () => {
  it("renders mode toggle buttons (Linear/Zigzag/Adaptive)", () => {
    render(<DrillView state={drillState} currentBeat={null} animations={false} />);
    expect(screen.getByRole("button", { name: /linear/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /zigzag/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /adaptive/i })).toBeInTheDocument();
  });

  it("gives the climb one column per step (80, 90, 100)", () => {
    const { container } = render(
      <DrillView state={drillState} currentBeat={null} animations={false} />,
    );
    // start=80, target=100, increment=10 → steps: 80, 90, 100
    const bpmLabels = container.querySelectorAll(".drill-grid-bpm");
    const bpms = Array.from(bpmLabels).map((el) => el.textContent);
    expect(bpms).toEqual(["80", "90", "100"]);
    expect(container.querySelectorAll(".drill-climb-col")).toHaveLength(3);
  });

  it("redraws the climb when the plan changes shape", async () => {
    const { container } = render(
      <DrillView state={drillState} currentBeat={null} animations={false} />,
    );
    expect(container.querySelectorAll(".drill-grid-cell")).toHaveLength(3 * 2);
    const repeats = screen.getByText("Repeats").parentElement!;
    fireEvent.click(repeats.querySelectorAll(".stepper-btn")[1]);
    await waitFor(() =>
      expect(container.querySelectorAll(".drill-grid-cell")).toHaveLength(3 * 3),
    );
  });

  it("clicking a cell in the climb calls start_speed_ramp_from with its step and bar", async () => {
    const { container } = render(
      <DrillView state={drillState} currentBeat={null} animations={false} />,
    );
    const cells = container.querySelectorAll(".drill-grid-cell");
    expect(cells.length).toBe(3 * 2);
    fireEvent.click(cells[0] as Element);
    await waitFor(() => {
      // first cell of the first column → step=0, bpm=80, bar=0
      expect(mockInvoke).toHaveBeenCalledWith(
        "start_speed_ramp_from",
        expect.objectContaining({ step: 0, bpm: 80, bar: 0 }),
      );
    });

    // Second cell of the last column: the bar index has to survive the
    // rotation from rows-of-bars to columns-of-bars.
    fireEvent.click(cells[5] as Element);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "start_speed_ramp_from",
        expect.objectContaining({ step: 2, bpm: 100, bar: 1 }),
      );
    });
  });

  // The tempo block that used to head this screen is the thing the owner read
  // as "the old mesh": a 5rem "80" over four circles that never lit, above the
  // sentence that is meant to be the subject. It is gone at rest — and every
  // number it carried has to come back the moment a run makes one real.
  it("opens on the plan, not on a tempo readout", () => {
    const { container } = render(
      <DrillView state={drillState} currentBeat={null} animations={false} />,
    );
    expect(container.querySelector(".drill-live")).toBeNull();
    expect(container.querySelectorAll(".drill-dot")).toHaveLength(0);
    // The plan is what heads the stage instead.
    expect(container.querySelector(".drill-stage-head .drill-plan")).not.toBeNull();
  });

  it("brings the tempo, the beat dots and the step position back while a run is going", () => {
    const running: AppState = {
      ...drillState,
      // Past the count-in, so the readout is showing the run rather than the
      // countdown that replaces it.
      speedRamp: { ...drillState.speedRamp, active: true, warmupCount: 4, currentBpm: 90, currentStep: 1, barsInStep: 1 },
    };
    const { container } = render(
      <DrillView state={running} currentBeat={null} animations={false} />,
    );
    const live = container.querySelector(".drill-live");
    expect(live).not.toBeNull();
    expect(live!.querySelector(".drill-current-bpm")?.textContent).toBe("90");
    expect(live!.querySelectorAll(".drill-dot")).toHaveLength(4);
    expect(live!.querySelector(".drill-current-step")?.textContent).toContain("2");
  });

  it("counts the run in when the drill is warming up", () => {
    const warming: AppState = {
      ...drillState,
      speedRamp: { ...drillState.speedRamp, active: true, warmupBeats: 4, warmupCount: 1 },
    };
    render(<DrillView state={warming} currentBeat={null} animations={false} />);
    expect(screen.getByText("Starting in")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("sizes the run against the plan: steps, total bars, and how long that takes", () => {
    const { container } = render(
      <DrillView state={drillState} currentBeat={null} animations={false} />,
    );
    // 3 steps (80, 90, 100) of 2 bars each.
    const stats = container.querySelector(".drill-run-stats")?.textContent ?? "";
    expect(stats).toContain("3 steps");
    expect(stats).toContain("6 bars");
    expect(stats).toContain("about");
  });

  it("says what one bar will sound like under the sentence", () => {
    const { container } = render(
      <DrillView state={{ ...drillState, soundType: "wood" }} currentBeat={null} animations={false} />,
    );
    const detail = container.querySelector(".drill-plan-detail")?.textContent ?? "";
    expect(detail).toContain("4 beats per bar");
    // A ramp pins the subdivision to 1 in the engine, whatever the metronome
    // screen is set to, so this line is a fact rather than a reading.
    expect(detail).toContain("quarter notes");
    expect(detail).toContain("Wood");
  });

  it("clicking Cyclic toggle calls configure_speed_ramp with cyclic=true", async () => {
    render(<DrillView state={drillState} currentBeat={null} animations={false} />);
    // The "Cyclic" toggle is rendered next to a label with that text.
    const cyclicLabel = screen.getByText("Cyclic");
    const toggleBtn = cyclicLabel.parentElement?.querySelector(".toggle-btn") as HTMLElement;
    expect(toggleBtn).not.toBeNull();
    fireEvent.click(toggleBtn);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "configure_speed_ramp",
        expect.objectContaining({ cyclic: true }),
      );
    });
  });
});
