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
