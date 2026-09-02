/**
 * The level meter extracted from `AudioInputTestModal` (O5).
 *
 * The extraction has to be behaviour-preserving: the tester's readout was
 * tuned against these numbers, and W5's one-second gate reads the same floor.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  InputLevelMeter,
  METER_FLOOR_DB,
  SIGNAL_FLOOR_RMS,
  dbToPercent,
  rmsToDb,
} from "./InputLevelMeter";

describe("rmsToDb", () => {
  it("clamps silence to the floor rather than reporting -∞", () => {
    expect(rmsToDb(0)).toBe(METER_FLOOR_DB);
    expect(rmsToDb(0.00001)).toBe(METER_FLOOR_DB);
  });

  it("maps full scale to 0 dB and never goes above it", () => {
    expect(rmsToDb(1)).toBe(0);
    expect(rmsToDb(4)).toBe(0);
  });

  it("puts the noise floor well down the scale", () => {
    // 0.01 RMS is -40 dBFS — the point the app calls "signal".
    expect(rmsToDb(SIGNAL_FLOOR_RMS)).toBeCloseTo(-40, 5);
  });
});

describe("dbToPercent", () => {
  it("spans the meter from the floor to full", () => {
    expect(dbToPercent(METER_FLOOR_DB)).toBe(0);
    expect(dbToPercent(-30)).toBe(50);
    expect(dbToPercent(0)).toBe(100);
  });
});

describe("InputLevelMeter", () => {
  it("reads -∞ and draws nothing when there is no signal", () => {
    render(<InputLevelMeter rms={0} label="Level" />);
    expect(screen.getByTestId("input-level-db")).toHaveTextContent("-∞ dB");
    expect(screen.getByTestId("input-level-fill")).toHaveStyle({ width: "0%" });
  });

  it("shows the level in dB and fills proportionally", () => {
    render(<InputLevelMeter rms={0.1} label="Level" />);
    expect(screen.getByTestId("input-level-db")).toHaveTextContent("-20 dB");
    // -20 dB is two thirds up a -60..0 scale.
    const width = (screen.getByTestId("input-level-fill") as HTMLElement).style.width;
    expect(Number.parseFloat(width)).toBeCloseTo(66.667, 2);
  });

  it("flags a hot signal and a clipping one", () => {
    const hot = render(<InputLevelMeter rms={0.2} label="Level" />);
    expect(hot.getByTestId("input-level-fill")).toHaveClass("hot");
    hot.unmount();

    render(<InputLevelMeter rms={0.9} label="Level" />);
    expect(screen.getByTestId("input-level-fill")).toHaveClass("clipping");
  });
});
