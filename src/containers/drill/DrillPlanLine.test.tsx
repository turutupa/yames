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
  openField: null,
  onOpenField: vi.fn(),
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
    const { container } = render(<DrillPlanLine {...base} openField="shape" />);
    const open = container.querySelectorAll(".drill-plan-token.open");
    expect(open).toHaveLength(1);
  });
});
