import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Transport } from "./Transport";

const base = {
  isPlaying: false,
  speedRampActive: false,
  isPulsing: false,
  bar: 1,
  elapsedSeconds: 0,
  listening: false,
  hasSignal: false,
  onTogglePlayback: vi.fn(),
  onStartSpeedRamp: vi.fn(),
  onStopSpeedRamp: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Transport", () => {
  it("starts the click on the metronome and the ramp on the drill", () => {
    const onTogglePlayback = vi.fn();
    const onStartSpeedRamp = vi.fn();

    const { unmount } = render(
      <Transport {...base} view="beat" onTogglePlayback={onTogglePlayback} onStartSpeedRamp={onStartSpeedRamp} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onTogglePlayback).toHaveBeenCalledTimes(1);
    expect(onStartSpeedRamp).not.toHaveBeenCalled();
    unmount();

    render(
      <Transport {...base} view="drill" onTogglePlayback={onTogglePlayback} onStartSpeedRamp={onStartSpeedRamp} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onStartSpeedRamp).toHaveBeenCalledTimes(1);
    expect(onTogglePlayback).toHaveBeenCalledTimes(1); // still just the first one
  });

  it("stops the ramp on the drill, not the click", () => {
    const onStopSpeedRamp = vi.fn();
    const onTogglePlayback = vi.fn();
    render(
      <Transport
        {...base}
        view="drill"
        speedRampActive
        onStopSpeedRamp={onStopSpeedRamp}
        onTogglePlayback={onTogglePlayback}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onStopSpeedRamp).toHaveBeenCalledTimes(1);
    expect(onTogglePlayback).not.toHaveBeenCalled();
  });

  it("shows a dash for the bar until something is running", () => {
    const { rerender } = render(<Transport {...base} view="beat" bar={7} />);
    expect(screen.getByText("—")).toBeTruthy();
    rerender(<Transport {...base} view="beat" bar={7} isPlaying />);
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("formats elapsed time as minutes and seconds", () => {
    render(<Transport {...base} view="beat" elapsedSeconds={252.7} />);
    expect(screen.getByText("4:12")).toBeTruthy();
  });

  it("pads the seconds so the clock does not jitter", () => {
    render(<Transport {...base} view="beat" elapsedSeconds={65} />);
    expect(screen.getByText("1:05")).toBeTruthy();
  });

  it("reports the input as off until the coach is listening", () => {
    const { container, rerender } = render(<Transport {...base} view="beat" />);
    expect(container.querySelector(".transport-input.listening")).toBeNull();
    rerender(<Transport {...base} view="beat" listening />);
    expect(container.querySelector(".transport-input.listening")).not.toBeNull();
  });

  it("shows the stop label while the drill's ramp runs, even though the click is not", () => {
    // The drill's play button follows the ramp, not `isPlaying` — the engine
    // is playing during a ramp either way, and the button must offer to stop
    // the thing the user actually started.
    render(<Transport {...base} view="drill" speedRampActive isPlaying />);
    expect(screen.getByRole("button").textContent).toContain("Stop");
  });
});
