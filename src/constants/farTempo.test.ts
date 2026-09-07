import { describe, it, expect } from "vitest";
import { FAR_TEMPO, farTempoFade, getTempoScale, getTempoTicks, MAX_BPM, MIN_BPM } from "./metronome";

/**
 * The ruler runs to 300 because the engine does, but almost nobody practises
 * past 200 — and the far quarter of the scale was competing for attention with
 * the half that gets used. It is drawn back rather than cut: anyone who does
 * climb up there still has to be able to read where they are, so the fade
 * reverses as the tempo approaches.
 */

describe("the ruler's far end", () => {
  it("is quiet while you are nowhere near it", () => {
    expect(farTempoFade(MIN_BPM)).toBeLessThan(0.35);
    expect(farTempoFade(120)).toBeLessThan(0.35);
    expect(farTempoFade(FAR_TEMPO - 40)).toBeLessThan(0.35);
  });

  it("is fully lit by the time you get there, and stays lit above it", () => {
    expect(farTempoFade(FAR_TEMPO)).toBe(1);
    expect(farTempoFade(240)).toBe(1);
    expect(farTempoFade(MAX_BPM)).toBe(1);
  });

  it("comes back before the caret arrives, not under it", () => {
    // Legible on the way up rather than appearing beneath the marker.
    const approaching = farTempoFade(FAR_TEMPO - 20);
    expect(approaching).toBeGreaterThan(farTempoFade(FAR_TEMPO - 40));
    expect(approaching).toBeLessThan(1);
  });

  it("never disappears and never overshoots", () => {
    for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm++) {
      const f = farTempoFade(bpm);
      expect(f, `${bpm}`).toBeGreaterThanOrEqual(0.3);
      expect(f, `${bpm}`).toBeLessThanOrEqual(1);
    }
  });

  it("only rises — a faster tempo never dims the far end", () => {
    let prev = 0;
    for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm++) {
      const f = farTempoFade(bpm);
      expect(f, `${bpm}`).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });

  it("has something to dim, and something left alone", () => {
    // If every tick were past the threshold the whole ruler would fade, and if
    // none were the feature would be dead code. Both would pass silently.
    const ticks = getTempoTicks();
    expect(ticks.some((t) => t.bpm > FAR_TEMPO)).toBe(true);
    expect(ticks.some((t) => t.bpm <= FAR_TEMPO)).toBe(true);

    // The era names are deliberately NOT faded: the last of them, Prestissimo,
    // begins at 178, so none is ever past the threshold. If one ever is, the
    // decision to leave them alone needs revisiting rather than silently
    // leaving a name stranded at full strength among dimmed ticks.
    const scale = getTempoScale();
    expect(scale.every((s) => s.bpm <= FAR_TEMPO)).toBe(true);
  });
});
