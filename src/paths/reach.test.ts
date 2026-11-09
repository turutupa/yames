// Reachability has to fail on real impossibilities and pass on real shapes. The
// passing cases here are shapes every guitarist plays; if the model refuses one
// of them, the model is wrong.
import { describe, expect, it } from "vitest";
import { STANDARD_TUNING } from "./format";
import type { PathLevel } from "./format";
import { checkReachAt, fretMm, maxPlayableBpm, spanLimitMm } from "./reach";
import { parseTab } from "./tabDsl";

function shape(tab: string, fret: number, shifts: "none" | "allowed" = "none", loops = false) {
  const parsed = parseTab(tab, STANDARD_TUNING, 3840);
  return {
    notes: parsed.notes,
    position: { fret, shifts },
    loops,
    meter: { numerator: 4, denominator: 4 },
    bars: Math.ceil(parsed.totalTicks / 3840),
  };
}

const reach = (tab: string, fret: number, level: PathLevel, bpm: number, shifts: "none" | "allowed" = "none", loops = false) =>
  checkReachAt(shape(tab, fret, shifts, loops), level, bpm);

describe("frets", () => {
  it("are closer together up the neck", () => {
    expect(fretMm(4) - fretMm(1)).toBeGreaterThan(fretMm(16) - fretMm(13));
    expect(fretMm(12)).toBeCloseTo(324, 0);
  });
  it("a full stretch is only for slow playing", () => {
    expect(spanLimitMm("intermediate", 300)).toBe(100);
    expect(spanLimitMm("intermediate", 60)).toBe(85);
  });
});

describe("real shapes pass", () => {
  it("one finger per fret at fifth position", () => {
    expect(reach("/16 5:5 5:6 5:7 5:8", 5, "beginner", 60).failure).toBeNull();
    expect(reach("/16 5:5 5:6 5:7 5:8", 5, "early-intermediate", 120).failure).toBeNull();
  });
  it("the classic five-string minor sweep at fret 12", () => {
    const tab = "/8t 5:12 5:15h 4:14 3:14 2:13 1:12 1:17h 1:12p 2:13 3:14 4:14 5:15";
    expect(reach(tab, 12, "intermediate", 120).failure).toBeNull();
  });
  it("box 1 at any level, at a sensible speed", () => {
    const tab = "/16 6:5 6:8 5:5 5:7 4:5 4:7 3:5 3:7 2:5 2:8 1:5 1:8";
    expect(reach(tab, 5, "beginner", 60).failure).toBeNull();
  });
  it("open strings ask nothing of the hand", () => {
    expect(reach("/16 6:0 6:12 6:0 6:12", 12, "beginner", 100).failure).toBeNull();
  });
  it("a slide is allowed to be the shift", () => {
    expect(reach("/16 3:7s 3:14", 7, "beginner", 200, "allowed").failure).toBeNull();
  });
});

describe("impossible things fail", () => {
  it("a stretch across the nut end of the neck under one hand", () => {
    const result = reach("/4 5:1 5:7", 1, "advanced", 60);
    expect(result.failure?.kind).toBe("stretch");
  });
  it("the first note is not under the declared position", () => {
    expect(reach("/4 5:10", 5, "advanced", 60).failure?.kind).toBe("position");
  });
  it("a chord no hand can make", () => {
    expect(reach("/4 5:3 /4 5:5", 3, "advanced", 60).failure).toBeNull();
    const chord = shape("/4 5:1 3:9", 1);
    chord.notes[1].tick = chord.notes[0].tick;
    expect(checkReachAt(chord, "advanced", 60).failure?.kind).toBe("stretch");
  });
  it("a hammer-on across a shift", () => {
    expect(reach("/8 5:2 5:12h", 2, "advanced", 60, "allowed").failure?.kind).toBe("legato");
  });
  it("a jump that does not fit in the time", () => {
    const jump = "/16 6:2 6:15 6:2 6:15";
    expect(reach(jump, 2, "advanced", 160, "allowed").failure?.kind).toBe("shiftTime");
    expect(reach(jump, 2, "advanced", 40, "allowed").failure).toBeNull();
  });
  it("a loop whose return jump does not fit", () => {
    const line = "/16 6:2 6:3 6:4 6:5 6:6 6:7 6:8 6:9 6:10 6:11 6:12 6:13 6:14 6:15 6:16 6:17";
    const result = reach(line, 2, "beginner", 80, "allowed", true);
    expect(result.failure?.kind).toBe("seam");
  });
});

describe("tempo matters", () => {
  it("a stretch that is fine slowly fails fast", () => {
    // Fret 7 to 11: 89 mm, inside the limit until it tightens at speed.
    const tab = "/16 5:7 5:11 5:7 5:11";
    expect(reach(tab, 7, "intermediate", 60).failure).toBeNull();
    expect(reach(tab, 7, "intermediate", 200).failure?.kind).toBe("stretch");
  });
  it("finds the fastest playable tempo", () => {
    const jump = shape("/16 6:2 6:15 6:2 6:15", 2, "allowed");
    const top = maxPlayableBpm(jump, "advanced");
    expect(top).toBeGreaterThan(60);
    expect(top).toBeLessThan(160);
    expect(checkReachAt(jump, "advanced", top).failure).toBeNull();
    expect(checkReachAt(jump, "advanced", top + 2).failure).not.toBeNull();
  });
});
