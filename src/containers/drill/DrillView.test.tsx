/**
 * DrillView feature preservation tests.
 *
 * Locks in:
 * - Renders the climb from the speedRamp config (start, target, increment)
 * - Linear/Zigzag/Adaptive mode toggle buttons exist
 * - Clicking a cell calls start_speed_ramp_from with stepIdx + bpm + barIdx
 * - The up-and-down toggle switches the speed_ramp.cyclic flag
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DrillView } from "./DrillView";
import { mockInvoke, DEFAULT_TEST_STATE } from "../../test/mocks";
import type { AppState } from "../../types";

const drillState: AppState = {
  ...DEFAULT_TEST_STATE,
  accentMode: "groups" as const,
  countIn: { beats: 0, done: 0 },
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
    render(
      <DrillView state={drillState} currentBeat={null} animations={false} />,
    );
    expect(screen.getByRole("button", { name: /linear/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /zigzag/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /adaptive/i }),
    ).toBeInTheDocument();
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
    // The settings live in a window under the phrase they belong to now, so
    // the bar count has to be opened before it can be changed.
    fireEvent.click(screen.getByText("every 2 bars"));
    fireEvent.click(screen.getByLabelText("Repeats +1"));
    await waitFor(() =>
      expect(container.querySelectorAll(".drill-grid-cell")).toHaveLength(
        3 * 3,
      ),
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
    // The row is always there and never hides — three goes at this taught
    // that. Unmounted, it shoved the climb down the screen on Start; hidden,
    // it flashed the whole row in and out. What changes is the VALUE: an em
    // dash asserts nothing, where the "80" this used to show at rest was a
    // tempo that nothing was sounding.
    const live = container.querySelector(".drill-live") as HTMLElement;
    expect(live).not.toBeNull();
    expect(live.hasAttribute("data-idle")).toBe(false);
    const bpm = container.querySelector(".drill-current-bpm") as HTMLElement;
    expect(bpm.textContent).toBe("—");
    expect(bpm.hasAttribute("data-idle")).toBe(true);
    // The plan is what heads the stage instead.
    expect(
      container.querySelector(".drill-stage-head .drill-plan"),
    ).not.toBeNull();
  });

  it("keeps the readout one shape, so nothing after it moves", () => {
    // The row re-flowed on every state change — a dash, then "STARTING IN 2"
    // with the label FIRST, then "80" — and the dots and the step position
    // slid back and forth under it.
    //
    // jsdom has no layout, so the pixel positions were verified in a browser
    // (all four states put the dots at the same x, including the widest
    // possible "300 BPM"). What is asserted here is the structure that makes
    // that true: one `.drill-readout` with the number first and the label
    // second, in every state, so the two fixed-width slots in the stylesheet
    // always apply to the same elements.
    const shape = (c: HTMLElement) => {
      const readout = c.querySelector(".drill-readout");
      return [...(readout?.children ?? [])].map((el) => el.className.split(" ")[0]);
    };

    const rest = render(
      <DrillView state={drillState} currentBeat={null} animations={false} />,
    );
    expect(shape(rest.container)).toEqual(["drill-current-bpm", "drill-current-label"]);
    rest.unmount();

    const counting = render(
      <DrillView
        state={{
          ...drillState,
          countIn: { beats: 4, done: 2 },
          speedRamp: { ...drillState.speedRamp, active: true },
        }}
        currentBeat={null}
        animations={false}
      />,
    );
    // Same two children in the same order — the count-in no longer leads with
    // its label.
    expect(shape(counting.container)).toEqual([
      "drill-current-bpm",
      "drill-current-label",
    ]);
    expect(
      counting.container.querySelector(".drill-current-bpm")?.textContent,
    ).toBe("2");
    expect(
      counting.container.querySelector(".drill-current-label")?.textContent,
    ).toBe("Starting in");
  });

  it("never takes the beat dots away — not at rest, not through the count-in", () => {
    // "The dots should NEVER disappear." They used to go twice over: with the
    // whole row while the drill was stopped, and again behind an inline
    // `visibility: hidden` for the duration of the count-in — which is
    // precisely when they are the thing you are counting towards.
    const dots = (c: HTMLElement) => c.querySelectorAll(".drill-dot").length;

    const rest = render(
      <DrillView state={drillState} currentBeat={null} animations={false} />,
    );
    expect(dots(rest.container)).toBe(4);
    rest.unmount();

    const counting = render(
      <DrillView
        state={{
          ...drillState,
          countIn: { beats: 4, done: 1 },
          speedRamp: { ...drillState.speedRamp, active: true },
        }}
        currentBeat={null}
        animations={false}
      />,
    );
    // Rendered AND visible: `visibility` inherits, so a hidden row with a
    // `visible` child was how the dots once survived alone on an otherwise
    // blank row. Nothing here sets visibility at all now.
    const row = counting.container.querySelector(".drill-beat-dots") as HTMLElement;
    expect(dots(counting.container)).toBe(4);
    expect(row.style.visibility).toBe("");
  });

  it("brings the tempo, the beat dots and the step position back while a run is going", () => {
    const running: AppState = {
      ...drillState,
      // Past the count-in, so the readout is showing the run rather than the
      // countdown that replaces it.
      countIn: { beats: 0, done: 0 },
      speedRamp: {
        ...drillState.speedRamp,
        active: true,
        warmupCount: 4,
        currentBpm: 90,
        currentStep: 1,
        barsInStep: 1,
      },
    };
    const { container } = render(
      <DrillView state={running} currentBeat={null} animations={false} />,
    );
    const live = container.querySelector(".drill-live");
    expect(live).not.toBeNull();
    expect(live!.querySelector(".drill-current-bpm")?.textContent).toBe("90");
    expect(live!.querySelectorAll(".drill-dot")).toHaveLength(4);
    expect(live!.querySelector(".drill-current-step")?.textContent).toContain(
      "2",
    );
  });

  it("counts the run in when the drill is warming up", () => {
    // The live counter is `state.countIn` now, not `speedRamp.warmupCount`
    // (U9.5) — the ramp still owns `warmupBeats` as the setting, and the
    // engine owns the counting so a chain can use the same machinery.
    const warming: AppState = {
      ...drillState,
      countIn: { beats: 4, done: 1 },
      speedRamp: { ...drillState.speedRamp, active: true, warmupBeats: 4 },
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
    const stats =
      container.querySelector(".drill-run-stats")?.textContent ?? "";
    expect(stats).toContain("3 steps");
    expect(stats).toContain("6 bars");
    expect(stats).toContain("about");
  });

  it("says what one bar will sound like under the sentence", () => {
    const { container } = render(
      <DrillView
        state={{ ...drillState, soundType: "wood" }}
        currentBeat={null}
        animations={false}
      />,
    );
    const detail =
      container.querySelector(".drill-plan-detail")?.textContent ?? "";
    expect(detail).toContain("4 beats per bar");
    // The subdivision is the DRILL's now — the engine used to pin every ramp
    // to 1, so this line stated a fact instead of reading a setting.
    expect(detail).toContain("Quarter");
    expect(detail).toContain("Wood");
  });

  it("draws a descending drill, and lets the target be typed below the start", async () => {
    // The owner asked for this twice. The target used to be clamped to a
    // floor of the start tempo — in Rust AND in the field's own `min` — so
    // "play it at 120 and work down to 80 until it is clean" could not be
    // entered at all. The climb below mirrors `advance_ramp`, so it has to
    // descend too or the picture is a lie about what will play.
    const { container } = render(
      <DrillView
        state={{
          ...drillState,
          speedRamp: { ...drillState.speedRamp, startBpm: 100, targetBpm: 80, increment: 10 },
        }}
        currentBeat={null}
        animations={false}
      />,
    );
    const tempos = [...container.querySelectorAll(".drill-climb-bpm")].map(
      (el) => el.textContent,
    );
    expect(tempos).toEqual(["100", "90", "80"]);
  });

  it("does not draw the same tempo twice when start already is the target", () => {
    // 80 to 80 drew two identical columns: the first move landed on the
    // target and was pushed as if it had gone somewhere.
    const { container } = render(
      <DrillView
        state={{
          ...drillState,
          speedRamp: { ...drillState.speedRamp, startBpm: 80, targetBpm: 80 },
        }}
        currentBeat={null}
        animations={false}
      />,
    );
    expect(container.querySelectorAll(".drill-climb-bpm")).toHaveLength(1);
  });

  it("lets the start tempo pass the target without dragging it along", async () => {
    // Raising the start past the target used to push the target up with it,
    // because the engine only ramped upward. It descends now, so the two are
    // just the two ends of the plan.
    const { container } = render(
      <DrillView state={drillState} currentBeat={null} animations={false} />,
    );
    fireEvent.click(container.querySelector(".drill-plan-token")!);
    const start = screen.getByLabelText("Start BPM");
    fireEvent.change(start, { target: { value: "140" } });
    fireEvent.blur(start);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "configure_speed_ramp",
        expect.objectContaining({ startBpm: 140, targetBpm: 100 }),
      );
    });
  });

  it("clicking a phrase lands the cursor in the number behind it", () => {
    // Tested here and not only on the popover in isolation, because what the
    // owner reported is the whole path: click the words "every 12 bars" and
    // expect to be typing into the 12. A component that focuses correctly
    // when mounted by hand can still fail when mounted by a click.
    render(<DrillView state={drillState} currentBeat={null} animations={false} />);
    fireEvent.click(screen.getByText("every 2 bars"));
    expect(document.activeElement).toBe(screen.getByLabelText("Repeats"));

    fireEvent.click(screen.getByText("4 beats per bar"));
    expect(document.activeElement).toBe(screen.getByLabelText("Beats"));
  });

  it("sends the aggressiveness you just clicked, not the one before it", async () => {
    // A real bug, found while collapsing eleven pieces of state into one.
    // The handler was `setAggressiveness(next)` followed by a save that read
    // `aggressiveness` out of the render's own closure — the value BEFORE the
    // click — so picking "Gentle" sent whatever had been selected previously.
    // The button looked right and the engine got the wrong number.
    render(
      <DrillView
        state={{
          ...drillState,
          speedRamp: { ...drillState.speedRamp, mode: "adaptive", aggressiveness: "moderate" },
        }}
        currentBeat={null}
        animations={false}
      />,
    );
    fireEvent.click(screen.getByText("Options"));
    fireEvent.click(screen.getByRole("button", { name: "Gentle" }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "configure_speed_ramp",
        expect.objectContaining({ aggressiveness: "conservative" }),
      );
    });
  });

  it("changing the drill's subdivision saves it with the rest of the ramp", async () => {
    render(<DrillView state={drillState} currentBeat={null} animations={false} />);
    fireEvent.click(screen.getByText("Quarter"));
    fireEvent.click(screen.getByRole("button", { name: /Sixteenth/ }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "configure_speed_ramp",
        expect.objectContaining({ subdivision: 4 }),
      );
    });
  });

  it("the click can be changed from the plan line, not only the header", async () => {
    render(<DrillView state={drillState} currentBeat={null} animations={false} />);
    fireEvent.click(screen.getByText(/sound$/));
    fireEvent.click(screen.getByRole("button", { name: /Beep/ }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "set_sound_type",
        expect.objectContaining({ soundType: "beep" }),
      );
    });
  });

  it("clicking the up-and-down toggle calls configure_speed_ramp with cyclic=true", async () => {
    render(
      <DrillView state={drillState} currentBeat={null} animations={false} />,
    );
    // The flag is still `cyclic` in the engine; only the word the musician
    // reads changed. "Cyclic" was engineering vocabulary, and "Repeat" would
    // have been wrong — the ramp turns round and descends rather than starting
    // again, which is what the chain's repeat does.
    fireEvent.click(screen.getByText("Options"));
    const cyclicLabel = screen.getByText("Up and down");
    const toggleBtn = cyclicLabel
      .closest(".drill-popover-row")
      ?.querySelector(".toggle-btn") as HTMLElement;
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
