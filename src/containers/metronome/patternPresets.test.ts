import { describe, it, expect } from "vitest";
import {
  CORE_PATTERN_PRESETS,
  cycleAccent,
  createDefaultPattern,
  grooveToPattern,
  JAM_GROOVE_PRESETS,
  PATTERN_PRESETS,
  resamplePatternSubdivision,
  resamplePatternMeter,
} from "./patternPresets";
import { grooveById } from "../../jam/grooves";
import type { MultiMeasurePattern } from "../../types";

describe("patternPresets", () => {
  it("cycles accents sequentially: Rest -> Plain -> Mid -> Strong -> Rest", () => {
    expect(cycleAccent(0)).toBe(1);
    expect(cycleAccent(1)).toBe(2);
    expect(cycleAccent(2)).toBe(3);
    expect(cycleAccent(3)).toBe(0);
  });

  it("creates a default pattern with downbeat accents", () => {
    const pattern = createDefaultPattern(2, 4, 1);
    expect(pattern.loopBars).toBe(2);
    expect(pattern.measures).toHaveLength(2);
    expect(pattern.measures[0].beats).toBe(4);
    expect(pattern.measures[0].subdivision).toBe(1);
    expect(pattern.measures[0].ticks).toEqual([3, 1, 1, 1]);
    expect(pattern.measures[1].ticks).toEqual([2, 1, 1, 1]);
  });

  describe("resamplePatternSubdivision", () => {
    it("resamples 1 tick/beat to 2 ticks/beat preserving downbeats", () => {
      const pattern = createDefaultPattern(1, 4, 1);
      const resampled = resamplePatternSubdivision(pattern, 2);

      expect(resampled.measures[0].subdivision).toBe(2);
      expect(resampled.measures[0].ticks).toHaveLength(8);
      // Downbeat 1 is Strong (3) and its 8th is Plain (1)
      expect(resampled.measures[0].ticks.slice(0, 2)).toEqual([3, 1]);
      // Beat 2 is Plain (1) and its 8th is Plain (1)
      expect(resampled.measures[0].ticks.slice(2, 4)).toEqual([1, 1]);
    });

    it("resamples 2 ticks/beat to 4 ticks/beat preserving 8th-note syncopations", () => {
      const pattern: MultiMeasurePattern = {
        id: "clave",
        name: "Clave",
        loopBars: 1,
        measures: [
          {
            beats: 2,
            subdivision: 2,
            // Beat 1: downbeat 3, offbeat 2
            // Beat 2: downbeat 0, offbeat 3
            ticks: [3, 2, 0, 3],
          },
        ],
      };

      const resampled = resamplePatternSubdivision(pattern, 4);
      expect(resampled.measures[0].subdivision).toBe(4);
      expect(resampled.measures[0].ticks).toHaveLength(8);

      // Beat 1: 1 (3), 1-e (1), 1-& (2), 1-a (1)
      expect(resampled.measures[0].ticks.slice(0, 4)).toEqual([3, 1, 2, 1]);
      // Beat 2: 2 (0), 2-e (0 because beat was rest), 2-& (3), 2-a (0)
      expect(resampled.measures[0].ticks.slice(4, 8)).toEqual([0, 0, 3, 0]);
    });

    it("keeps gap/silent bars completely silent when resampled", () => {
      const pattern: MultiMeasurePattern = {
        id: "gap",
        name: "Gap",
        loopBars: 1,
        measures: [
          {
            beats: 4,
            subdivision: 1,
            ticks: [0, 0, 0, 0],
          },
        ],
      };

      const resampled = resamplePatternSubdivision(pattern, 4);
      expect(resampled.measures[0].subdivision).toBe(4);
      expect(resampled.measures[0].ticks).toEqual(Array(16).fill(0));
    });
  });

  describe("resamplePatternMeter", () => {
    it("expands beats when meter increases", () => {
      const pattern = createDefaultPattern(1, 3, 2);
      const resampled = resamplePatternMeter(pattern, 4);

      expect(resampled.measures[0].beats).toBe(4);
      expect(resampled.measures[0].ticks).toHaveLength(8);
    });

    it("truncates beats when meter decreases", () => {
      const pattern = createDefaultPattern(1, 4, 2);
      const resampled = resamplePatternMeter(pattern, 3);

      expect(resampled.measures[0].beats).toBe(3);
      expect(resampled.measures[0].ticks).toHaveLength(6);
    });
  });

  describe("Jam Groove Presets reuse", () => {
    it("converts all 115 Jam Grooves into valid MultiMeasurePatterns", () => {
      expect(JAM_GROOVE_PRESETS).toHaveLength(115);
      expect(PATTERN_PRESETS).toHaveLength(CORE_PATTERN_PRESETS.length + 115);

      for (const preset of JAM_GROOVE_PRESETS) {
        expect(preset.pattern.measures.length).toBeGreaterThanOrEqual(1);
        for (const m of preset.pattern.measures) {
          expect(m.ticks).toHaveLength(m.beats * m.subdivision);
          expect(m.ticks.some((t) => t > 0)).toBe(true);
        }
      }
    });

    it("preserves shuffle rests and supports optional fill on the last bar", () => {
      const shuffle = grooveById("shuffle");
      const steady = grooveToPattern(shuffle, 2, false);
      const withFill = grooveToPattern(shuffle, 2, true);

      // Shuffle middle triplet on beat 1 (index 1) is silent (0 = Rest)
      expect(steady.measures[0].ticks[1]).toBe(0);
      expect(steady.measures[0].ticks).toEqual(steady.measures[1].ticks);

      // With fill enabled, bar 2 differs from bar 1 (contains the turnaround fill)
      expect(withFill.measures[0].ticks).toEqual(steady.measures[0].ticks);
      expect(withFill.measures[1].ticks).not.toEqual(withFill.measures[0].ticks);
    });

    it("marks a preset pattern as custom when resampled to a different subdivision or meter, and keeps id when unchanged", () => {
      const clave = CORE_PATTERN_PRESETS[0].pattern;
      expect(clave.id).toBe("son-clave-3-2");

      const sameSub = resamplePatternSubdivision(clave, 2);
      expect(sameSub.id).toBe("son-clave-3-2");

      const changedSub = resamplePatternSubdivision(clave, 4);
      expect(changedSub.id).toBe("custom");

      const sameMeter = resamplePatternMeter(clave, 4);
      expect(sameMeter.id).toBe("son-clave-3-2");

      const changedMeter = resamplePatternMeter(clave, 3);
      expect(changedMeter.id).toBe("custom");
    });
  });
});
