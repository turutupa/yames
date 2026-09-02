import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import DriftMeter from "./DriftMeter";

// `evaluation.css` renders `.drift-meter` at opacity 0 and only
// `.drift-meter.visible` paints. The component must add that class when it
// is shown, otherwise the metronome's live needle is invisible.
describe("DriftMeter", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders nothing when not visible", () => {
    const { container } = render(<DriftMeter lastFeedback={null} avgDeviation={0} visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("adds the visible class after mount so the CSS fade-in paints the needle", async () => {
    let cb: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((fn) => {
      cb = fn;
      return 1;
    });
    render(<DriftMeter lastFeedback={null} avgDeviation={0} visible={true} />);
    const meter = screen.getByTestId("drift-meter");
    expect(meter.classList.contains("visible")).toBe(false);
    await act(async () => {
      cb?.(0);
    });
    expect(meter.classList.contains("visible")).toBe(true);
  });
});
