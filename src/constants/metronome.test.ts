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

  it("keeps each label clear of the next one at the width they are shown at", () => {
    // Five markings are labelled and thirteen are not because a label needs
    // room. Labels are placed at their tempo's position and read left to
    // right, so what matters for each pair is the gap against the width of
    // the LEFT label — not one worst case applied to all of them.
    //
    // The bar comes from the narrowest ruler the labels appear on:
    // metronome.css hides `.tempo-scale` below a 980px window, where the
    // ruler is about 720px. Uppercase 9.5px/700 with 0.06em tracking runs
    // roughly 7.4px per character.
    //
    // An earlier version of this test asserted a flat 9% and passed while
    // "MODERATO" was overlapping "ALLEGRO" on screen — the ruler was
    // rendering at ~515px, not the width the number assumed. The assumption
    // is now written down where it can be checked.
    const RULER_PX = 720;
    const PER_CHAR_PX = 7.4;
    const BREATHING_PX = 6;
    const scale = getTempoScale();
    for (let i = 1; i < scale.length; i++) {
      const gapPx = ((scale[i].percent - scale[i - 1].percent) / 100) * RULER_PX;
      const needed = scale[i - 1].label.length * PER_CHAR_PX + BREATHING_PX;
      expect(
        gapPx,
        `${scale[i - 1].label} would run into ${scale[i].label}`,
      ).toBeGreaterThan(needed);
    }
  });

  it("runs left to right", () => {
    const percents = getTempoScale().map((m) => m.percent);
    expect([...percents].sort((a, b) => a - b)).toEqual(percents);
  });
});
