/**
 * The climb (UI_DECISIONS U3.2).
 *
 * What these lock in is the picture's *shape*, because that is the whole
 * argument for replacing the grid: nine tempo steps must draw nine columns
 * standing at nine heights, and a zigzag must come back down. A test that only
 * counted cells would have passed against the mesh this replaced.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DrillClimb } from "./DrillClimb";

const base = {
  steps: [80, 90, 100],
  barsPerStep: 4,
  currentStep: 0,
  barsInStep: 0,
  active: false,
  cyclic: false,
  onJump: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** The columns, left to right, as [tempo, how high it stands (0–1)]. */
function columns(container: HTMLElement): [string, number][] {
  return [...container.querySelectorAll(".drill-climb-col")].map((col) => [
    col.querySelector(".drill-climb-bpm")?.textContent ?? "",
    Number((col as HTMLElement).style.getPropertyValue("--climb-step-rise")),
  ]);
}

const cellsOf = (container: HTMLElement) =>
  [...container.querySelectorAll(".drill-climb-cell")] as HTMLElement[];

describe("DrillClimb", () => {
  it("draws one column per tempo step, labelled with its own tempo", () => {
    const { container } = render(<DrillClimb {...base} />);
    expect(columns(container).map(([bpm]) => bpm)).toEqual(["80", "90", "100"]);
  });

  it("draws one cell per bar inside every column", () => {
    const { container, rerender } = render(<DrillClimb {...base} />);
    expect(cellsOf(container)).toHaveLength(3 * 4);
    rerender(<DrillClimb {...base} barsPerStep={12} />);
    expect(cellsOf(container)).toHaveLength(3 * 12);
  });

  it("stands each column at its own tempo's height, so the plan climbs", () => {
    const { container } = render(<DrillClimb {...base} />);
    expect(columns(container)).toEqual([
      ["80", 0],
      ["90", 0.5],
      ["100", 1],
    ]);
  });

  it("draws a zigzag as a zigzag, not as a staircase", () => {
    // Height follows the tempo, never the index — this is the difference
    // between a picture of the exercise and a picture of the loop that drew it.
    const { container } = render(
      <DrillClimb {...base} steps={[80, 90, 85, 95, 90, 100]} />,
    );
    const heights = columns(container).map(([, rise]) => rise);
    expect(heights[1]).toBeGreaterThan(heights[2]);
    expect(heights[3]).toBeGreaterThan(heights[4]);
    expect(heights[5]).toBe(1);
  });

  it("keeps every column on the floor when the whole drill is one tempo", () => {
    const { container } = render(<DrillClimb {...base} steps={[100]} />);
    expect(columns(container)).toEqual([["100", 0]]);
  });

  it("fills the bars behind the playhead, lights the one under it, and leaves the rest", () => {
    const { container } = render(
      <DrillClimb {...base} active currentStep={1} barsInStep={2} />,
    );
    const cells = cellsOf(container);
    // Step 0 is behind us: all four bars done.
    expect(cells.slice(0, 4).every((c) => c.classList.contains("done"))).toBe(true);
    // Step 1 is the one playing: two bars done, the third is current.
    expect(cells[4].classList.contains("done")).toBe(true);
    expect(cells[5].classList.contains("done")).toBe(true);
    expect(cells[6].classList.contains("current")).toBe(true);
    expect(cells[7].className).not.toMatch(/done|current/);
    // Step 2 has not happened.
    expect(cells.slice(8).some((c) => /done|current/.test(c.className))).toBe(false);
    expect(container.querySelectorAll(".drill-climb-cell.current")).toHaveLength(1);
  });

  it("marks nothing as played until the drill is actually running", () => {
    const { container } = render(
      <DrillClimb {...base} currentStep={1} barsInStep={2} />,
    );
    expect(container.querySelectorAll(".drill-climb-cell.done")).toHaveLength(0);
    expect(container.querySelectorAll(".drill-climb-cell.current")).toHaveLength(0);
  });

  it("wraps a cyclic run back onto the same columns instead of running off the end", () => {
    // A cyclic ramp counts past the last step and comes back down the columns
    // it already climbed, so step 4 of a three-step plan is column 1 again —
    // and nothing behind it counts as finished, because it will be replayed.
    const { container } = render(
      <DrillClimb {...base} active cyclic currentStep={4} barsInStep={1} />,
    );
    const current = container.querySelector(".drill-climb-cell.current");
    expect(current?.closest(".drill-climb-col")?.getAttribute("data-row-idx")).toBe("1");
    expect(
      container.querySelectorAll('[data-row-idx="0"] .drill-climb-cell.done'),
    ).toHaveLength(0);
  });

  it("jumps the ramp to the step and bar you click", () => {
    const onJump = vi.fn();
    const { container } = render(<DrillClimb {...base} onJump={onJump} />);
    const cells = cellsOf(container);
    fireEvent.click(cells[0]);
    expect(onJump).toHaveBeenLastCalledWith(0, 80, 0);
    // Third column, second bar.
    fireEvent.click(cells[9]);
    expect(onJump).toHaveBeenLastCalledWith(2, 100, 1);
  });

  it("keeps departing steps and bars on screen so they can animate out", () => {
    const { container } = render(
      <DrillClimb {...base} ghostSteps={[110, 120]} ghostBars={2} />,
    );
    expect(container.querySelectorAll(".drill-climb-col")).toHaveLength(5);
    expect(container.querySelectorAll(".drill-climb-col.exiting")).toHaveLength(2);
    // Three live columns of 4 + 2 departing bars, plus two ghost columns of 6.
    expect(cellsOf(container)).toHaveLength(3 * 6 + 2 * 6);
    // Departing steps do not re-scale the live ones underneath them.
    expect(columns(container)[0][1]).toBe(0);
    expect(columns(container)[2][1]).toBeCloseTo(0.5, 4);
  });

  it("names the picture and keys the two states a cell can be in", () => {
    const { container } = render(<DrillClimb {...base} />);
    expect(screen.getByText("The climb")).toBeInTheDocument();
    // "Tonight" until the owner asked what it meant. The artboard's legend
    // was "Last run" / "Tonight" — a comparison with a run the app does not
    // record (U3.3), so half of it was never built and the other half was
    // left naming nothing. The two states a cell actually has are played and
    // not yet played.
    expect(screen.getByText("Remaining")).toBeInTheDocument();
    expect(screen.getByText("Played")).toBeInTheDocument();
    // The sentence the swatches replaced still explains how the picture is
    // built; it moved to the legend's tooltip rather than being dropped.
    expect(
      container.querySelector(".drill-climb-legend")?.getAttribute("title"),
    ).toMatch(/one cell per bar/i);
  });

  it("marks where you are with one playhead, and only while a run is going", () => {
    // The line is worth drawing only because the columns are a fixed width:
    // a picture that rescaled to fit the step count would slide it under the
    // player's eyes whenever a step was added.
    const { container, rerender } = render(<DrillClimb {...base} />);
    expect(container.querySelectorAll(".drill-climb-playhead")).toHaveLength(0);

    rerender(<DrillClimb {...base} active currentStep={1} barsInStep={2} />);
    const heads = container.querySelectorAll(".drill-climb-playhead");
    expect(heads).toHaveLength(1);

    // In the column being played, at the bar being played.
    const col = heads[0].closest(".drill-climb-col") as HTMLElement;
    expect(col.querySelector(".drill-climb-bpm")?.textContent).toBe("90");
    expect((heads[0] as HTMLElement).style.getPropertyValue("--climb-playhead-bar")).toBe("2");
  });

  it("follows the bar, not the step", () => {
    const { container, rerender } = render(
      <DrillClimb {...base} active currentStep={0} barsInStep={0} />,
    );
    const at = () =>
      (container.querySelector(".drill-climb-playhead") as HTMLElement)
        .style.getPropertyValue("--climb-playhead-bar");
    expect(at()).toBe("0");
    rerender(<DrillClimb {...base} active currentStep={0} barsInStep={3} />);
    expect(at()).toBe("3");
  });
});
