import { describe, it, expect } from "vitest";
import { swingFor, bobFor, rodAngle } from "./MetronomeFigure";
import { MIN_BPM, MAX_BPM } from "../../constants/metronome";

/**
 * The figure is decoration, but its motion is a claim about time, and this
 * app cannot afford to look like it keeps bad time. These lock the two
 * behaviours the drawing is actually for.
 *
 * They exist as unit tests rather than a screenshot because the browser
 * preview has no engine behind it — nothing there ever sets `isPlaying`, so
 * the pendulum cannot be watched moving outside a real build.
 */

describe("the swing", () => {
  it("is wide when slow and narrow when fast", () => {
    // The point of the whole thing: a fixed arc at 240 is a blur.
    expect(swingFor(MIN_BPM)).toBeGreaterThan(swingFor(MAX_BPM));
    expect(swingFor(60)).toBeGreaterThan(swingFor(120));
    expect(swingFor(120)).toBeGreaterThan(swingFor(200));
  });

  it("never opens so far the rod would lie down, nor so little it looks stuck", () => {
    for (const bpm of [MIN_BPM, 40, 60, 90, 120, 180, 240, MAX_BPM]) {
      expect(swingFor(bpm), `${bpm}`).toBeLessThan(Math.PI / 6); // under 30°
      expect(swingFor(bpm), `${bpm}`).toBeGreaterThan(0.08); // over ~4.5°
    }
  });

  it("holds its ends outside the tempo range instead of inverting", () => {
    expect(swingFor(-5)).toBeCloseTo(swingFor(MIN_BPM), 6);
    expect(swingFor(10_000)).toBeCloseTo(swingFor(MAX_BPM), 6);
  });
});

describe("the bob", () => {
  it("slides down the rod as the tempo rises", () => {
    // Which is how you set a real metronome, and it makes a still frame of a
    // fast tempo still look fast.
    expect(bobFor(MIN_BPM)).toBeGreaterThan(bobFor(MAX_BPM));
    expect(bobFor(60)).toBeGreaterThan(bobFor(180));
  });

  it("stays on the rod", () => {
    for (const bpm of [MIN_BPM, 60, 120, 240, MAX_BPM]) {
      expect(bobFor(bpm)).toBeGreaterThan(0);
      expect(bobFor(bpm)).toBeLessThan(1);
    }
  });
});

describe("the rod", () => {
  const bpm = 120;
  const beatMs = 60000 / bpm;

  it("stands at one extreme the instant a beat lands", () => {
    // The beat event is what resets the phase, so t=0 is the tick. If the rod
    // were anywhere else here, it would visibly disagree with the click.
    expect(rodAngle(bpm, 0, 1)).toBeCloseTo(swingFor(bpm), 6);
    expect(rodAngle(bpm, 0, -1)).toBeCloseTo(-swingFor(bpm), 6);
  });

  it("crosses centre halfway between beats", () => {
    expect(rodAngle(bpm, beatMs / 2, 1)).toBeCloseTo(0, 6);
  });

  it("arrives at the far extreme exactly as the next beat sounds", () => {
    // One beat is one half-cycle: the escapement ticks at each end of travel.
    expect(rodAngle(bpm, beatMs, 1)).toBeCloseTo(-swingFor(bpm), 6);
  });

  it("waits at the end rather than swinging on if a beat is late", () => {
    // A dropped or delayed beat event must not let the rod run past its
    // travel and come back — it holds until the tick that releases it.
    const atEnd = rodAngle(bpm, beatMs, 1);
    expect(rodAngle(bpm, beatMs * 1.5, 1)).toBeCloseTo(atEnd, 6);
    expect(rodAngle(bpm, beatMs * 40, 1)).toBeCloseTo(atEnd, 6);
  });

  it("takes longer to cross at a slower tempo", () => {
    // Same fraction of the arc, more milliseconds to get there.
    const slowQuarter = rodAngle(60, 250, 1);
    const fastQuarter = rodAngle(120, 250, 1);
    expect(Math.abs(slowQuarter)).toBeGreaterThan(Math.abs(fastQuarter));
  });
});
