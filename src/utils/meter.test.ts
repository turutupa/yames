import { describe, expect, it } from "vitest";
import { METER_PRESETS, METER_VARIANTS } from "../constants/metronome";
import {
  accentPositions,
  cycleMeterPreset,
  findMeterPreset,
  findMeterPresetIndex,
  meterKey,
  meterLabel,
  meterTotal,
  presetBeatGroups,
  presetFreeMode,
  stepMeter,
} from "./meter";
import { MAX_FREE_BEATS, MIN_FREE_BEATS } from "../constants/metronome";
import type { Preset } from "../types";

function preset(overrides: Partial<Preset>): Preset {
  return {
    id: "p1",
    name: "Test",
    bpm: 120,
    subdivision: 1,
    timeSignature: 4,
    soundType: "click",
    volume: 0.8,
    ...overrides,
  } as Preset;
}

describe("meterTotal", () => {
  it("sums the groups", () => {
    expect(meterTotal([4])).toBe(4);
    expect(meterTotal([3, 2, 2])).toBe(7);
    expect(meterTotal([3, 3, 3, 3])).toBe(12);
  });

  it("is 0 for an empty or missing grouping", () => {
    expect(meterTotal([])).toBe(0);
    expect(meterTotal(undefined)).toBe(0);
    expect(meterTotal(null)).toBe(0);
  });
});

describe("meterKey", () => {
  it("is stable across separate arrays with the same contents", () => {
    expect(meterKey([3, 2, 2])).toBe(meterKey([3, 2, 2]));
  });

  it("distinguishes variants with the same total", () => {
    expect(meterKey([3, 2, 2])).not.toBe(meterKey([2, 3, 2]));
  });

  it("is the empty string for a missing grouping", () => {
    expect(meterKey(undefined)).toBe("");
  });
});

/** The levels of a whole bar, position 0 upwards, unaccented beats as 0. */
function bar(groups: number[], mode?: "groups" | "all" | "none"): number[] {
  const levels = accentPositions(groups, mode);
  return Array.from({ length: meterTotal(groups) }, (_, i) => levels.get(i) ?? 0);
}

describe("accentPositions", () => {
  it("opens the bar strong and every later group medium", () => {
    // The whole of issue 52 in three lines: a group start that is not the
    // bar's own is a middle, not a second downbeat.
    expect(bar([3, 2, 2])).toEqual([2, 0, 0, 1, 0, 1, 0]);
    expect(bar([4])).toEqual([2, 0, 0, 0]);
    expect(bar([2])).toEqual([2, 0]);
  });

  it("gives 6/8 a middle in both of its groupings", () => {
    // 3+3 is the compound feel — one, two, three, FOUR, five, six — and
    // 2+2+2 the duple one the reporter may have meant.
    expect(bar([3, 3])).toEqual([2, 0, 0, 1, 0, 0]);
    expect(bar([2, 2, 2])).toEqual([2, 0, 1, 0, 1, 0]);
  });

  it("marks the first beat in FREE mode, which is one group of N", () => {
    // This used to assert the opposite. The owner found the consequence: on
    // FREE with "Group starts" selected, beat one was neither heard nor lit,
    // while the other two modes behaved. FREE mode carries a single group —
    // Rust's `collapse_to_free` guarantees it — so it opens once, and what
    // it opens with is the strong accent: a FREE bar has no middle.
    expect(bar([7])).toEqual([2, 0, 0, 0, 0, 0, 0]);
    expect([...accentPositions([16]).entries()]).toEqual([[0, 2]]);
  });

  it("agrees with the group boundaries for every shipped meter", () => {
    const all = [
      ...METER_PRESETS.map((p) => p.groups),
      ...Object.values(METER_VARIANTS).flat(),
    ];
    for (const groups of all) {
      const positions = accentPositions(groups);
      expect(positions.size).toBe(groups.length);
      expect(positions.get(0)).toBe(2);
      // Nothing marked past the end of the bar.
      for (const p of positions.keys()) expect(p).toBeLessThan(meterTotal(groups));
    }
  });

  it("mirrors the engine's rule for every meter and every grouping the app ships", () => {
    // THE MIRROR. `accentPositions` draws the dots at rest and `accent_for`
    // in engine.rs decides what you hear; they have drifted before, and the
    // Rust side walks this same list as `ALL_METERS`. The rule is written
    // out here a second time on purpose — a mirror that calls the thing it
    // mirrors proves nothing.
    const everyMeter = [
      ...METER_PRESETS.map((p) => p.groups),
      ...Object.values(METER_VARIANTS).flat(),
      // The edges the Rust validator still accepts, and FREE mode's range.
      [1],
      [16],
      [1, 1, 1, 1, 1, 1],
      [8, 8],
    ];
    for (const groups of everyMeter) {
      const expected: number[] = Array(meterTotal(groups)).fill(0);
      let cursor = 0;
      for (const g of groups) {
        expected[cursor] = cursor === 0 ? 2 : 1;
        cursor += g;
      }
      expect(bar(groups)).toEqual(expected);
      // Exactly one strong beat in a bar, which is the bug being fixed.
      expect(bar(groups).filter((l) => l === 2)).toEqual([2]);
      // As many accents as there are groups, which is what did not change.
      expect(bar(groups).filter((l) => l > 0).length).toBe(groups.length);
    }
  });
});
describe("accentPositions and the accent mode", () => {
  // This mirrors `accent_for` in engine.rs. They must agree: this is what the
  // dots draw at rest, and the engine is what you hear. For as long as the
  // accent control existed without a mode argument here, you could choose
  // "every beat", hear every beat, and watch a single dot stay lit.
  it("marks every beat under `all`, and all of them strong", () => {
    // "Every beat" is the mode for a flat pulse. Handing it the tier would
    // put back the shape it exists to remove.
    expect(bar([3, 2, 2], "all")).toEqual([2, 2, 2, 2, 2, 2, 2]);
  });

  it("marks nothing under `none`", () => {
    expect([...accentPositions([3, 2, 2], "none")]).toEqual([]);
  });

  it("keeps group starts under `groups`, which is the default", () => {
    expect(bar([3, 2, 2], "groups")).toEqual([2, 0, 0, 1, 0, 1, 0]);
    expect(bar([3, 2, 2])).toEqual([2, 0, 0, 1, 0, 1, 0]);
  });

  it("gives FREE mode all three modes, exactly as the engine does", () => {
    // A FREE bar is `[N]`, so all three answers fall out of the general rule:
    // every beat, no beat, or the one beat that opens the single group.
    expect(bar([4], "all")).toEqual([2, 2, 2, 2]);
    expect([...accentPositions([4], "none")]).toEqual([]);
    expect(bar([4], "groups")).toEqual([2, 0, 0, 0]);
  });
});


describe("findMeterPresetIndex", () => {
  it("finds an exact preset match", () => {
    const idx = findMeterPresetIndex([4]);
    expect(METER_PRESETS[idx].label).toBe("4/4");
    expect(METER_PRESETS[findMeterPresetIndex([2])].label).toBe("2/4");
  });

  it("finds the preset a variant belongs to", () => {
    expect(findMeterPreset([2, 3])?.label).toBe("5/4");
    expect(findMeterPreset([2, 3, 2])?.label).toBe("7/8");
    expect(findMeterPreset([2, 3, 3])?.label).toBe("8/8");
  });

  it("returns -1 for a grouping that is not one of ours", () => {
    expect(findMeterPresetIndex([5, 5])).toBe(-1);
    expect(findMeterPresetIndex([])).toBe(-1);
    expect(findMeterPresetIndex(undefined)).toBe(-1);
  });
});

describe("meterLabel", () => {
  it("uses the preset label, variants included", () => {
    expect(meterLabel([3, 2])).toBe("5/4");
    expect(meterLabel([2, 3])).toBe("5/4");
    expect(meterLabel([2])).toBe("2/4");
  });

  it("falls back to n/4 for a hand-built grouping", () => {
    expect(meterLabel([5, 5])).toBe("10/4");
  });
});

describe("cycleMeterPreset", () => {
  it("steps forward and back through the preset list", () => {
    // Index-relative, not hardcoded: the row is display-ordered and has
    // been reordered once already (4/4-first -> ascending).
    const fourFour = findMeterPresetIndex([4]);
    const next = METER_PRESETS[fourFour + 1].groups;
    expect(cycleMeterPreset([4], 1)).toEqual(next);
    expect(cycleMeterPreset(next, -1)).toEqual([4]);
  });

  it("wraps at both ends", () => {
    const last = METER_PRESETS[METER_PRESETS.length - 1].groups;
    expect(cycleMeterPreset(last, 1)).toEqual(METER_PRESETS[0].groups);
    expect(cycleMeterPreset(METER_PRESETS[0].groups, -1)).toEqual(last);
  });

  it("cycles onward from a VARIANT rather than restarting at 4/4", () => {
    // [2, 3] is a 5/4 grouping. Before findMeterPresetIndex was
    // variant-aware, this landed on 4/4 (index -1 → 0).
    const fiveFour = findMeterPresetIndex([3, 2]);
    expect(cycleMeterPreset([2, 3], 1)).toEqual(
      METER_PRESETS[(fiveFour + 1) % METER_PRESETS.length].groups,
    );
    // Cycling always lands on a preset's canonical grouping.
    expect(cycleMeterPreset([2, 3, 2], 1)).toEqual(
      METER_PRESETS[(findMeterPresetIndex([3, 2, 2]) + 1) % METER_PRESETS.length].groups,
    );
  });

  it("cycles from the 2/4 preset", () => {
    const n = METER_PRESETS.length;
    const twoFour = findMeterPresetIndex([2]);
    expect(twoFour).toBeGreaterThanOrEqual(0);
    // Modular both ways: 2/4 is the first entry since the row was sorted
    // ascending, so stepping back from it wraps to the last preset.
    expect(cycleMeterPreset([2], 1)).toEqual(METER_PRESETS[(twoFour + 1) % n].groups);
    expect(cycleMeterPreset([2], -1)).toEqual(METER_PRESETS[(twoFour - 1 + n) % n].groups);
  });

  // Pins the behaviour that sorting the row ascending would otherwise have
  // changed silently: the landing spot is 4/4 because it is 4/4, not
  // because it happened to be first in the array.
  it("lands on 4/4 from an unknown grouping, wherever 4/4 sits in the row", () => {
    expect(cycleMeterPreset([5, 5], 1)).toEqual([4]);
    expect(cycleMeterPreset([5, 5], -1)).toEqual([4]);
    expect(METER_PRESETS[0].label).not.toBe("4/4");
  });

  it("never produces a grouping Rust would reject", () => {
    let groups = METER_PRESETS[0].groups;
    for (let i = 0; i < METER_PRESETS.length * 2 + 1; i++) {
      groups = cycleMeterPreset(groups, 1);
      expect(groups.length).toBeGreaterThanOrEqual(1);
      expect(groups.length).toBeLessThanOrEqual(6);
      expect(meterTotal(groups)).toBeLessThanOrEqual(16);
      for (const g of groups) expect(g).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("presetBeatGroups", () => {
  it("prefers an explicit beatGroups array", () => {
    expect(presetBeatGroups(preset({ beatGroups: [3, 2, 2], timeSignature: 7 }))).toEqual([3, 2, 2]);
  });

  it("derives from timeSignature on a legacy preset", () => {
    expect(presetBeatGroups(preset({ timeSignature: 3 }))).toEqual([3]);
    expect(presetBeatGroups(preset({ timeSignature: 6 }))).toEqual([6]);
  });

  it("maps the retired 'Never accent' (timeSignature 0) to 4/4", () => {
    // The bug: this used to produce [0], which Rust rejects — and the
    // rejection aborted the rest of the preset load.
    expect(presetBeatGroups(preset({ timeSignature: 0 }))).toEqual([4]);
  });

  it("clamps anything out of range to 4/4", () => {
    expect(presetBeatGroups(preset({ timeSignature: -1 }))).toEqual([4]);
    expect(presetBeatGroups(preset({ timeSignature: 99 }))).toEqual([4]);
    expect(presetBeatGroups(preset({ timeSignature: NaN }))).toEqual([4]);
    expect(presetBeatGroups(preset({ beatGroups: [], timeSignature: 0 }))).toEqual([4]);
  });

  it("always yields a grouping the backend accepts", () => {
    for (const ts of [0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 255]) {
      const groups = presetBeatGroups(preset({ timeSignature: ts }));
      expect(groups.length).toBe(1);
      expect(meterTotal(groups)).toBeGreaterThanOrEqual(1);
      expect(meterTotal(groups)).toBeLessThanOrEqual(16);
    }
  });
});

describe("stepMeter", () => {
  it("walks the preset list when free mode is off", () => {
    // Relative to where 4/4 actually sits, not to a fixed index.
    const next = METER_PRESETS[findMeterPresetIndex([4]) + 1].groups;
    expect(stepMeter([4], false, 1)).toEqual(next);
    expect(stepMeter(next, false, -1)).toEqual([4]);
  });

  it("steps the beat count in FREE mode", () => {
    expect(stepMeter([5], true, 1)).toEqual([6]);
    expect(stepMeter([5], true, -1)).toEqual([4]);
  });

  it("wraps the FREE-mode beat count at both ends", () => {
    expect(stepMeter([MAX_FREE_BEATS], true, 1)).toEqual([MIN_FREE_BEATS]);
    expect(stepMeter([MIN_FREE_BEATS], true, -1)).toEqual([MAX_FREE_BEATS]);
  });

  it("never produces a grouping Rust would reject, in either mode", () => {
    for (const freeMode of [true, false]) {
      let groups = [4];
      for (let i = 0; i < 40; i++) {
        groups = stepMeter(groups, freeMode, 1);
        expect(groups.length).toBeGreaterThanOrEqual(1);
        expect(groups.length).toBeLessThanOrEqual(6);
        expect(meterTotal(groups)).toBeGreaterThanOrEqual(MIN_FREE_BEATS);
        expect(meterTotal(groups)).toBeLessThanOrEqual(MAX_FREE_BEATS);
        for (const g of groups) expect(g).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("presetFreeMode", () => {
  it("honours an explicit freeMode flag", () => {
    expect(presetFreeMode(preset({ freeMode: true }))).toBe(true);
    expect(presetFreeMode(preset({ freeMode: false, timeSignature: 0 }))).toBe(false);
  });

  it("maps the retired 'Never accent' preset to FREE mode", () => {
    // timeSignature 0 with no groups is the old "Never" option. FREE mode
    // is its modern spelling — the alternative was a silently accented
    // 4/4. Matches `commands.rs::restore_beat_groups`.
    const legacy = preset({ timeSignature: 0 });
    expect(presetFreeMode(legacy)).toBe(true);
    expect(presetBeatGroups(legacy)).toEqual([4]);
  });

  it("leaves a normal preset alone", () => {
    expect(presetFreeMode(preset({ timeSignature: 4 }))).toBe(false);
    expect(presetFreeMode(preset({ timeSignature: 0, beatGroups: [3, 2] }))).toBe(false);
  });
});
