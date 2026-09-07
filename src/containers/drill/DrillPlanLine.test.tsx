import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DrillPlanLine } from "./DrillPlanLine";

const base = {
  startBpm: 80,
  targetBpm: 120,
  increment: 5,
  decrement: 3,
  beatsPerBar: 4,
  barsPerStep: 12,
  mode: "linear",
  soundName: "Wood",
  subdivision: 1,
  openField: null,
  onOpenField: vi.fn(),
  // The settings window measures its position off these; the plan line only
  // fills them in.
  anchors: { current: {} },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DrillPlanLine", () => {
  it("reads the whole drill back in one line", () => {
    const { container } = render(<DrillPlanLine {...base} />);
    const text = container.textContent ?? "";
    expect(text).toContain("80");
    expect(text).toContain("120");
    expect(text).toContain("+5");
    expect(text).toContain("12");
    expect(text).toContain("4");
  });

  it("hides the slow-down rate unless the drill actually zigzags", () => {
    const { container, rerender } = render(<DrillPlanLine {...base} />);
    expect(container.textContent).not.toContain("−3");
    rerender(<DrillPlanLine {...base} mode="zigzag" />);
    expect(container.textContent).toContain("−3");
  });

  it("opens the settings behind a phrase, and closes them on a second click", () => {
    const onOpenField = vi.fn();
    const { rerender } = render(<DrillPlanLine {...base} onOpenField={onOpenField} />);
    fireEvent.click(screen.getByText("+5").closest("button")!);
    expect(onOpenField).toHaveBeenCalledWith("rate");

    rerender(<DrillPlanLine {...base} openField="rate" onOpenField={onOpenField} />);
    fireEvent.click(screen.getByText("+5").closest("button")!);
    expect(onOpenField).toHaveBeenLastCalledWith(null);
  });

  it("tells assistive tech which phrase is expanded", () => {
    const { container, rerender } = render(<DrillPlanLine {...base} />);
    const expanded = () =>
      [...container.querySelectorAll("button")].filter(
        (b) => b.getAttribute("aria-expanded") === "true",
      );
    expect(expanded()).toHaveLength(0);
    rerender(<DrillPlanLine {...base} openField="tempo" />);
    expect(expanded()).toHaveLength(1);
    expect(expanded()[0].textContent).toContain("80");
  });

  it("marks only the open phrase", () => {
    const { container } = render(<DrillPlanLine {...base} openField="repeats" />);
    const open = container.querySelectorAll(".drill-plan-token.open");
    expect(open).toHaveLength(1);
  });

  // Two lines, as drawn: the loud one is the shape of the climb, the quiet one
  // is what a single bar will sound like. The beat count belongs to the second
  // because it is a per-bar fact, not part of the tempo's journey.
  it("keeps the shape of the climb on the loud line", () => {
    const { container } = render(<DrillPlanLine {...base} />);
    const line = container.querySelector(".drill-plan")?.textContent ?? "";
    expect(line).toContain("80");
    expect(line).toContain("120");
    expect(line).toContain("+5");
    expect(line).toContain("every 12 bars");
    expect(line).not.toContain("per bar");
  });

  it("puts what a bar sounds like on the quiet line", () => {
    const { container } = render(<DrillPlanLine {...base} />);
    const detail = container.querySelector(".drill-plan-detail")?.textContent ?? "";
    expect(detail).toContain("4 beats per bar");
    expect(detail).toContain("Wood");
  });

  it("names whichever subdivision is set, not the pinned fact", () => {
    // This said "quarter notes" whatever the drill was doing, because the
    // engine pinned every ramp to 1. It is a setting now, so the sentence
    // reports it.
    const { container, rerender } = render(<DrillPlanLine {...base} />);
    const detail = () =>
      container.querySelector(".drill-plan-detail")?.textContent ?? "";
    expect(detail()).toContain("Quarter");
    rerender(<DrillPlanLine {...base} subdivision={4} />);
    expect(detail()).toContain("Sixteenth");
  });

  it("gives every phrase on the quiet line a window of its own", () => {
    // All four used to be one shared window or plain text. The owner hit both
    // halves of that: clicking "6 beats per bar" opened a card belonging to
    // "every 12 bars", and the subdivision and the click could not be clicked
    // at all while sitting in a line of things that could.
    const onOpenField = vi.fn();
    const { container } = render(
      <DrillPlanLine {...base} onOpenField={onOpenField} />,
    );
    const tokens = [...container.querySelectorAll(".drill-plan-detail-token")];
    expect(tokens).toHaveLength(4);
    for (const token of tokens) fireEvent.click(token);
    expect(onOpenField.mock.calls.map((c) => c[0])).toEqual([
      "beats",
      "sub",
      "sound",
      "more",
    ]);
  });

  it("keeps the bar count and the beat count apart", () => {
    const onOpenField = vi.fn();
    const { container } = render(
      <DrillPlanLine {...base} onOpenField={onOpenField} />,
    );
    fireEvent.click(container.querySelectorAll(".drill-plan-token")[2]);
    expect(onOpenField).toHaveBeenCalledWith("repeats");
    fireEvent.click(container.querySelector(".drill-plan-detail-token")!);
    expect(onOpenField).toHaveBeenCalledWith("beats");
  });
});
