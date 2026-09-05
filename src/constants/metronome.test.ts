import { describe, it, expect } from "vitest";
import {
  getTempoMarking,
  getTempoScale,
  MAX_BPM,
  MIN_BPM,
  TEMPO_MARKINGS,
  TEMPO_SCALE_LABELS,
} from "./metronome";

describe("tempo markings", () => {
  it("names the band a tempo falls in, not the nearest one", () => {
    expect(getTempoMarking(130)).toBe("Allegro"); // Vivace starts at 132
    expect(getTempoMarking(132)).toBe("Vivace");
    expect(getTempoMarking(20)).toBe("Grave");
    expect(getTempoMarking(300)).toBe("Prestissimo");
  });

  it("clamps below the first marking rather than returning nothing", () => {
    expect(getTempoMarking(1)).toBe("Grave");
  });
});

describe("tempo ruler scale", () => {
  it("labels only markings that exist", () => {
    // getTempoScale throws on a name TEMPO_MARKINGS does not have, so this
    // both documents the coupling and fails loudly if a marking is renamed.
    expect(() => getTempoScale()).not.toThrow();
    expect(getTempoScale().map((m) => m.label)).toEqual([...TEMPO_SCALE_LABELS]);
  });

  it("positions each label where its tempo actually sits on the slider", () => {
    for (const { label, percent } of getTempoScale()) {
      const bpm = TEMPO_MARKINGS.find(([, name]) => name === label)![0];
      expect(percent).toBeCloseTo(((bpm - MIN_BPM) / (MAX_BPM - MIN_BPM)) * 100, 6);
      expect(percent).toBeGreaterThanOrEqual(0);
      expect(percent).toBeLessThanOrEqual(100);
    }
  });

  it("keeps the labels far enough apart to read", () => {
    // The reason five markings are labelled and thirteen are not: at ruler
    // width a label needs roughly 9% of the track to itself. If someone adds
    // one back, this fails rather than silently overlapping two words.
    const scale = getTempoScale();
    for (let i = 1; i < scale.length; i++) {
      expect(
        scale[i].percent - scale[i - 1].percent,
        `${scale[i - 1].label} and ${scale[i].label} would overlap`,
      ).toBeGreaterThan(9);
    }
  });

  it("runs left to right", () => {
    const percents = getTempoScale().map((m) => m.percent);
    expect([...percents].sort((a, b) => a - b)).toEqual(percents);
  });
});
