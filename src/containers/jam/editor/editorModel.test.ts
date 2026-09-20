/**
 * The editor's model.
 *
 * What these lock in is the two rules a musician would notice if they broke:
 * the cycle a click walks, and what happens to a groove when the subdivision
 * changes under it (plan §4.1). The resize rule in particular has one right
 * answer — a hit keeps the moment in the bar it was played at — and several
 * plausible wrong ones that silently hand back a different groove.
 */
import { describe, it, expect } from "vitest";
import type { JamLevel, JamPattern } from "../../../jam/types";
import { JAM_LANES } from "../../../jam/types";
import {
  LANE_LABELS,
  PERC_LANES,
  cellAt,
  cellLabel,
  columnsOf,
  cycleLevel,
  emptyPattern,
  fromGroove,
  hasPerc,
  hasToms,
  isPercLane,
  isShuffleTick,
  lanesFor,
  meterCaption,
  normalizePattern,
  percLanesOf,
  resizeGroove,
  resizePattern,
  setCell,
  setPercCell,
  tickLabel,
  withPercLane,
  withToms,
} from "./editorModel";
import { grooveById } from "../../../jam/grooves";

/** A pattern with one lane spelled out and the rest silent. */
function kickRow(levels: number[]): JamPattern {
  const pattern = emptyPattern(levels.length, 1);
  pattern.kick = levels as JamLevel[];
  return pattern;
}

describe("cycleLevel", () => {
  it("walks off → hit → accent → peak → ghost → off", () => {
    // Loudest to quietest with silence at the end — the order a drummer would
    // say them in, and deliberately NOT the order the numbers are in (a peak
    // is 4 and a ghost is 3), because the numbers are a wire format.
    const seen: JamLevel[] = [];
    let level: JamLevel = 0;
    for (let i = 0; i < 6; i++) {
      seen.push(level);
      level = cycleLevel(level);
    }
    expect(seen).toEqual([0, 1, 2, 4, 3, 0]);
  });

  it("walks the same ring backwards, so a mis-click costs one keystroke", () => {
    const seen: JamLevel[] = [];
    let level: JamLevel = 0;
    for (let i = 0; i < 6; i++) {
      seen.push(level);
      level = cycleLevel(level, true);
    }
    expect(seen).toEqual([0, 3, 4, 2, 1, 0]);
  });
});

describe("the tom rows", () => {
  it("draws four lanes for a pattern with no toms, six for one with them", () => {
    const plain = emptyPattern(4, 2);
    expect(hasToms(plain)).toBe(false);
    expect(lanesFor(plain)).toEqual(["hat", "snare", "kick", "ride"]);

    const withRows = withToms(plain);
    expect(hasToms(withRows)).toBe(true);
    // Snare, toms, kick: the kit, top to bottom, the way a chart is written.
    expect(lanesFor(withRows)).toEqual([
      "hat",
      "snare",
      "tomHi",
      "tomLo",
      "kick",
      "ride",
    ]);
  });

  it("adds the rows at the bar's own width, and adds them only once", () => {
    const before = emptyPattern(4, 4);
    const after = withToms(before);
    expect(after.tomHi).toHaveLength(16);
    expect(after.tomLo).toHaveLength(16);
    expect(after.tomHi?.every((l) => l === 0)).toBe(true);
    // Already there: the same object back, so a re-render is free and a row
    // that has something in it cannot be wiped by a second click.
    expect(withToms(after)).toBe(after);
  });

  it("keeps a fill's toms through a normalise, and does not invent any", () => {
    // Every preset's FILL goes to the toms and its bar does not, so a pass
    // through the grid has to carry one and leave the other alone.
    const fill = normalizePattern(grooveById("rock8").fill, 4, 2);
    expect(fill.tomLo).toHaveLength(8);
    expect(fill.tomLo?.[7]).toBe(4);
    const bar = normalizePattern(grooveById("rock8").bar, 4, 2);
    expect(bar.tomHi).toBeUndefined();
    expect(bar.tomLo).toBeUndefined();
  });

  it("carries the toms through a change of subdivision", () => {
    const eighths = withToms(emptyPattern(4, 2));
    eighths.tomLo![7] = 4;
    const sixteenths = resizePattern(eighths, 2, 4);
    expect(sixteenths.tomLo).toHaveLength(16);
    // Tick 7 is the "and" of four: beat 3, sub 1 of 2 → beat 3, sub 2 of 4.
    expect(sixteenths.tomLo?.[14]).toBe(4);
    // And a pattern with no toms does not acquire them on the way through.
    expect(resizePattern(emptyPattern(4, 2), 2, 4).tomLo).toBeUndefined();
  });
});

describe("setCell", () => {
  it("writes one cell and leaves the source pattern alone", () => {
    const before = emptyPattern(4, 2);
    const after = setCell(before, "snare", 2, 2);
    expect(after.snare[2]).toBe(2);
    expect(before.snare[2]).toBe(0);
    expect(after).not.toBe(before);
  });

  it("does not touch the other lanes' arrays", () => {
    const before = emptyPattern(4, 2);
    const after = setCell(before, "snare", 2, 1);
    expect(after.kick).toBe(before.kick);
    expect(after.hat).toBe(before.hat);
  });

  it("returns the same object when nothing would change", () => {
    const before = emptyPattern(4, 2);
    expect(setCell(before, "snare", 2, 0)).toBe(before);
    expect(setCell(before, "snare", 99, 1)).toBe(before);
    expect(setCell(before, "snare", -1, 1)).toBe(before);
  });
});

describe("emptyPattern", () => {
  it("is beatsPerBar × ticksPerBeat columns wide, on every lane", () => {
    const pattern = emptyPattern(4, 3);
    for (const lane of JAM_LANES) {
      expect(pattern[lane]).toHaveLength(12);
      expect(pattern[lane].every((level) => level === 0)).toBe(true);
    }
  });

  it("includes crash, which the engine's type requires even though nobody draws it", () => {
    expect(emptyPattern(4, 4).crash).toHaveLength(16);
  });

  it("gives every lane its own array", () => {
    const pattern = emptyPattern(2, 2);
    pattern.kick[0] = 1;
    expect(pattern.snare[0]).toBe(0);
  });
});

describe("resizePattern", () => {
  it("keeps every hit and gains empty columns going finer (8ths → 16ths)", () => {
    // Beat, "and", beat, "and" across two beats of 8ths.
    const before = kickRow([1, 2, 1, 2]);
    const after = resizePattern(before, 2, 4);
    expect(after.kick).toEqual([1, 0, 2, 0, 1, 0, 2, 0]);
  });

  it("drops the in-between hits going coarser (16ths → 8ths)", () => {
    // One beat of 16ths: beat, e, and, a.
    const before = kickRow([1, 3, 2, 3]);
    const after = resizePattern(before, 4, 2);
    expect(after.kick).toEqual([1, 2]);
  });

  it("round-trips a groove that only uses columns both grids have", () => {
    const before = kickRow([1, 0, 2, 0, 0, 0, 3, 0]);
    const wider = resizePattern(before, 4, 6);
    expect(resizePattern(wider, 6, 4).kick).toEqual(before.kick);
  });

  it("spreads a triplet groove into sextuplets and back", () => {
    const before = kickRow([1, 0, 3, 2, 0, 0]);
    const wider = resizePattern(before, 3, 6);
    expect(wider.kick).toEqual([1, 0, 0, 0, 3, 0, 2, 0, 0, 0, 0, 0]);
    expect(resizePattern(wider, 6, 3).kick).toEqual(before.kick);
  });

  it("drops the offbeat when the new grid has no column for it (8ths → triplets)", () => {
    // The "and" of an 8ths groove is not a triplet column. Dropping it is
    // honest; snapping it to the nearest triplet would hand back a groove
    // that plays differently from the one on screen.
    const before = kickRow([1, 2, 1, 2]);
    const after = resizePattern(before, 2, 3);
    expect(after.kick).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("resizes every lane, not just the one being looked at", () => {
    const before = emptyPattern(2, 2);
    before.hat = [1, 1, 1, 1];
    before.snare = [0, 0, 2, 0];
    const after = resizePattern(before, 2, 4);
    expect(after.hat).toEqual([1, 0, 1, 0, 1, 0, 1, 0]);
    expect(after.snare).toEqual([0, 0, 0, 0, 2, 0, 0, 0]);
  });

  it("returns the same object when the subdivision has not moved", () => {
    const before = emptyPattern(4, 4);
    expect(resizePattern(before, 4, 4)).toBe(before);
  });
});

describe("resizeGroove", () => {
  it("moves the bar, the fill and the header together", () => {
    const groove = {
      name: "Mine",
      beatsPerBar: 2,
      ticksPerBeat: 2 as const,
      bar: kickRow([1, 0, 1, 0]),
      fill: kickRow([0, 2, 0, 2]),
    };
    const wider = resizeGroove(groove, 4);
    expect(wider.ticksPerBeat).toBe(4);
    expect(wider.bar.kick).toEqual([1, 0, 0, 0, 1, 0, 0, 0]);
    expect(wider.fill?.kick).toEqual([0, 0, 2, 0, 0, 0, 2, 0]);
  });

  it("leaves a groove with no fill without one", () => {
    const groove = {
      name: "Mine",
      beatsPerBar: 2,
      ticksPerBeat: 2 as const,
      bar: emptyPattern(2, 2),
      fill: null,
    };
    expect(resizeGroove(groove, 4).fill).toBeNull();
  });
});

describe("normalizePattern", () => {
  it("pads a short lane and fills in a missing one", () => {
    const ragged = { kick: [1, 2] } as unknown as JamPattern;
    const fixed = normalizePattern(ragged, 2, 2);
    expect(fixed.kick).toEqual([1, 2, 0, 0]);
    expect(fixed.snare).toEqual([0, 0, 0, 0]);
  });

  it("drops anything past the end of the bar", () => {
    const longRow = kickRow([1, 1, 1, 1, 1, 1]);
    expect(normalizePattern(longRow, 2, 2).kick).toEqual([1, 1, 1, 1]);
  });

  it("copes with no pattern at all", () => {
    expect(normalizePattern(null, 2, 2).kick).toEqual([0, 0, 0, 0]);
  });
});

describe("fromGroove", () => {
  it("deep-copies the preset, so editing never rewrites it", () => {
    const preset = {
      name: "Shuffle",
      beatsPerBar: 2,
      ticksPerBeat: 3 as const,
      bar: kickRow([1, 0, 0, 1, 0, 0]),
      fill: null,
    };
    const mine = fromGroove(preset);
    mine.bar.kick[0] = 3;
    expect(preset.bar.kick[0]).toBe(1);
    expect(mine.name).toBe("Shuffle");
    expect(mine.fill).toBeNull();
  });

  it("carries a preset's fill across, copied too", () => {
    const fill = kickRow([0, 0, 2, 0]);
    const mine = fromGroove({
      name: "Rock",
      beatsPerBar: 2,
      ticksPerBeat: 2,
      bar: emptyPattern(2, 2),
      fill,
    });
    expect(mine.fill?.kick).toEqual([0, 0, 2, 0]);
    mine.fill!.kick[2] = 1;
    expect(fill.kick[2]).toBe(2);
  });
});

describe("the labels a screen reader reads", () => {
  it("says the lane, the beat, the tick and the state", () => {
    const groove = emptyPattern(4, 3);
    groove.snare[5] = 2;
    expect(cellLabel("snare", 5, 3, cellAt(groove, "snare", 5))).toBe(
      "Snare, beat 2, tick 3: accent",
    );
  });

  it("counts beats and ticks from one, the way a musician does", () => {
    expect(cellLabel("kick", 0, 4, 0)).toBe("Kick, beat 1, tick 1: off");
    expect(cellLabel("hat", 7, 4, 3)).toBe("Hat, beat 2, tick 4: ghost");
  });
});

describe("the grid's own labels", () => {
  it("counts triplets the way they are said", () => {
    expect([0, 1, 2].map((sub) => tickLabel(sub, 3))).toEqual(["", "trip", "let"]);
    expect([0, 1, 2, 3].map((sub) => tickLabel(sub, 4))).toEqual([
      "",
      "e",
      "and",
      "a",
    ]);
  });

  it("names the meter in the caption", () => {
    expect(meterCaption(4, 3)).toBe(
      "4 beats in triplets · the columns follow the meter",
    );
  });

  it("marks the middle of a triplet, and only that", () => {
    expect([0, 1, 2].map((sub) => isShuffleTick(sub, 3))).toEqual([
      false,
      true,
      false,
    ]);
    expect([0, 1, 2, 3, 4, 5].map((sub) => isShuffleTick(sub, 6))).toEqual([
      false,
      true,
      false,
      false,
      true,
      false,
    ]);
    expect([0, 1, 2, 3].map((sub) => isShuffleTick(sub, 4))).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("columnsOf", () => {
  it("reports the widest lane", () => {
    expect(columnsOf(emptyPattern(4, 3))).toBe(12);
    expect(columnsOf({ kick: [1, 1, 1] } as unknown as JamPattern)).toBe(3);
  });
});

describe("the percussionist's rows", () => {
  it("draws the rows a groove already has, under the kit", () => {
    // "Reveals the rows the groove uses": a bossa opened in the editor has
    // its shaker on the grid without anybody asking for it.
    const bossa = normalizePattern(grooveById("bossa").bar, 4, 4);
    expect(hasPerc(bossa)).toBe(true);
    expect(lanesFor(bossa)).toEqual(["hat", "snare", "kick", "ride", "shaker"]);
    // And a groove with none has none: the rock bar is four rows, as before.
    const rock = normalizePattern(grooveById("rock8").bar, 4, 2);
    expect(hasPerc(rock)).toBe(false);
    expect(lanesFor(rock)).toEqual(["hat", "snare", "kick", "ride"]);
  });

  it("keeps the contract's order however the rows were added", () => {
    // The order on screen is the order in `JAM_PERC_LANES`, not the order
    // somebody happened to click — a grid whose rows moved as you built it
    // would be a different instrument every time you looked away.
    let pattern = emptyPattern(4, 4);
    for (const lane of ["bongoLo", "shaker", "congaHi"] as const) {
      pattern = withPercLane(pattern, lane);
    }
    expect(percLanesOf(pattern)).toEqual(["shaker", "congaHi", "bongoLo"]);
  });

  it("adds one row at the bar's width, and adds it only once", () => {
    const before = emptyPattern(4, 4);
    const after = withPercLane(before, "claves");
    expect(after.claves).toHaveLength(16);
    expect(after.claves?.every((level) => level === 0)).toBe(true);
    // Already there: the same object back, so a second click cannot wipe a
    // row somebody has been playing on.
    expect(withPercLane(after, "claves")).toBe(after);
  });

  it("drops a percussion row when its last stroke is taken back out", () => {
    // The rule the toms do not have. A row of zeros on the record is a lane
    // the engine reads past on every tick of every bar to learn nothing, and
    // `JamPattern` says these rows are absent rather than empty.
    let pattern = withPercLane(emptyPattern(4, 4), "cowbell");
    pattern = setPercCell(pattern, "cowbell", 0, 2);
    pattern = setPercCell(pattern, "cowbell", 8, 1);
    expect(pattern.cowbell).toHaveLength(16);
    pattern = setPercCell(pattern, "cowbell", 0, 0);
    // One stroke left: still a row.
    expect(pattern.cowbell).toHaveLength(16);
    pattern = setPercCell(pattern, "cowbell", 8, 0);
    expect(pattern.cowbell).toBeUndefined();
  });

  it("leaves a drum row alone when the same thing happens to it", () => {
    // The kick is one of the five the engine always reads; emptying it is a
    // groove with no kick, not a groove with no kick LANE.
    const pattern = setCell(emptyPattern(4, 2), "kick", 0, 0);
    expect(pattern.kick).toHaveLength(8);
  });

  it("carries the percussion through a normalise and a change of subdivision", () => {
    const bossa = normalizePattern(grooveById("bossa").bar, 4, 4);
    expect(bossa.shaker).toHaveLength(16);
    const eighths = resizePattern(bossa, 4, 2);
    expect(eighths.shaker).toHaveLength(8);
    // And a pattern with no percussion does not acquire ten silent
    // instruments on the way through either function.
    expect(resizePattern(emptyPattern(4, 2), 2, 4).shaker).toBeUndefined();
    expect(normalizePattern(grooveById("rock8").bar, 4, 2).shaker).toBeUndefined();
  });

  it("names every one of the ten", () => {
    // `LANE_LABELS` is what `cellLabel` reads out, so a voice missing from it
    // is a row a screen reader cannot announce.
    for (const lane of PERC_LANES) {
      expect(LANE_LABELS[lane], lane).toBeTruthy();
      expect(isPercLane(lane), lane).toBe(true);
    }
    expect(isPercLane("snare")).toBe(false);
    expect(cellLabel("congaHi", 4, 4, 2)).toBe("High conga, beat 2, tick 1: accent");
  });
});
