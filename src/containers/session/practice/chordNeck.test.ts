/**
 * A chord Exercise on the neck, bar by bar (card #74): "E minor, A minor, C"
 * drew three shapes on top of each other. Read from the shipped pack, so the
 * test is about the Exercise a beginner meets.
 */
import { describe, expect, it } from "vitest";
import firstChords from "../../../paths/packs/first-chords.json";
import alternate from "../../../paths/packs/alternate-picking.json";
import { barLengthTicks } from "../../../paths/format";
import type { Exercise, PathDoc } from "../../../paths/format";
import { strumDirections, patternModel } from "../tabstrip/tabStripModel";
import { barShapes, readyNeck } from "./practiceModel";
import { handOf } from "./HandLine";
import type { NeckNote } from "../../../stage3d/api";

function exercise(doc: unknown, id: string): Exercise {
  for (const step of (doc as PathDoc).steps) for (const e of step.exercises) if (e.id === id) return e;
  throw new Error(`no ${id}`);
}
const onsetsOf = (e: Exercise) => {
  const by = new Map<number, { string: number; fret: number }[]>();
  for (const n of e.notes) by.set(n.tick, [...(by.get(n.tick) ?? []), { string: n.string, fret: n.fret }]);
  return [...by].sort((a, b) => a[0] - b[0]).map(([tick, places], id) => ({ id, tick, places }));
};
const placesOf = (bar: readonly { string: number; fret: number }[]) => [...new Set(bar.map((n) => `${n.string}:${n.fret}`))].sort();

describe("the neck of a chord Exercise", () => {
  const e = exercise(firstChords, "c-major.three-chords");
  const bar = barLengthTicks(e.meter);
  const onsets = onsetsOf(e);
  const by = barShapes(e.notes, onsets, 0, bar, e.bars)!;

  it("has one shape a bar: E minor, A minor, C, A minor", () => {
    expect(by).not.toBeNull();
    expect(by.bars).toHaveLength(4);
    // E minor: 022000. A minor: x02210. C: x32010.
    expect(placesOf(by.bars[0])).toEqual(["1:0", "2:0", "3:0", "4:2", "5:2", "6:0"]);
    expect(placesOf(by.bars[1])).toEqual(["1:0", "2:1", "3:2", "4:2", "5:0"]);
    expect(placesOf(by.bars[2])).toEqual(["1:0", "2:1", "3:0", "4:2", "5:3"]);
    expect(placesOf(by.bars[3])).toEqual(placesOf(by.bars[1]));
    // Never the three at once: the Exercise plays more places than any bar holds.
    expect(placesOf(e.notes).length).toBeGreaterThan(Math.max(...by.bars.map((b) => placesOf(b).length)));
  });

  it("knows an onset's bar, and wraps on the Take's later passes", () => {
    const perBar = onsets.length / 4;
    expect(by.barOf(0)).toBe(0);
    expect(by.barOf(perBar)).toBe(1);
    expect(by.barOf(perBar * 3)).toBe(3);
    const later = barShapes(e.notes, [...onsets, { id: 99, tick: 4 * bar + bar, places: onsets[0].places }], 0, bar, e.bars)!;
    expect(later.barOf(onsets.length)).toBe(1);
  });

  it("is not used for a single-note pattern, or one chord throughout", () => {
    const run = exercise(alternate, (alternate as unknown as PathDoc).steps[0].exercises[0].id);
    expect(barShapes(run.notes, onsetsOf(run), 0, barLengthTicks(run.meter), run.bars)).toBeNull();
    const one = exercise(firstChords, "e-minor.em-four");
    expect(barShapes(one.notes, onsetsOf(one), 0, barLengthTicks(one.meter), one.bars)).toBeNull();
  });

  it("before the start the whole first chord is NOW, not one of its strings", () => {
    const shape: NeckNote[] = placesOf(by.bars[0]).map((k) => {
      const [string, fret] = k.split(":").map(Number);
      return { string: string as NeckNote["string"], fret, kind: "aim" };
    });
    const ready = readyNeck(shape, onsets, new Map([["5:2", "2"], ["4:2", "3"]]));
    expect(ready.every((n) => n.kind === "now")).toBe(true);
    expect(ready.find((n) => n.string === 5)?.label).toBe("2");
  });
});

describe("which way a strum goes", () => {
  it("quarter-note strums are all down", () => {
    const e = exercise(firstChords, "c-major.three-chords");
    const dirs = strumDirections(e.notes);
    expect(dirs.size).toBe(16);
    expect([...dirs.values()].every((d) => d === "d")).toBe(true);
  });

  it("down, down-up: down on the beat, up between beats", () => {
    const e = exercise(firstChords, "down-up.down-down-up");
    const dirs = strumDirections(e.notes);
    // Bar 1: beat 1 down, beat 2 down, its "and" up, beat 3 down, beat 4 down, its "and" up.
    expect([0, 960, 1440, 1920, 2880, 3360].map((t) => dirs.get(t))).toEqual(["d", "d", "u", "d", "d", "u"]);
    expect(patternModel(e.notes, barLengthTicks(e.meter), e.bars).strums.get(1440)).toBe("u");
  });

  it("a written pick mark wins, and a pattern with no strum has none", () => {
    const strum = (tick: number, pick?: "d" | "u") => [1, 2, 3].map((string) => ({ string, tick, pick }));
    expect([...strumDirections([...strum(0, "u"), ...strum(480)]).values()]).toEqual(["u", "u"]);
    const run = exercise(alternate, (alternate as unknown as PathDoc).steps[0].exercises[0].id);
    expect(strumDirections(run.notes).size).toBe(0);
  });

  it("sixteenth strums alternate; a strum off the grid gets no guess", () => {
    const strum = (tick: number) => [1, 2, 3].map((string) => ({ string, tick }));
    expect([...strumDirections([0, 240, 480, 720].flatMap(strum)).values()]).toEqual(["d", "u", "d", "u"]);
    const triplets = strumDirections([0, 320, 640].flatMap(strum));
    expect(triplets.get(0)).toBe("d");
    expect(triplets.has(320)).toBe(false);
  });
});

describe("where the hand starts, in words", () => {
  it("open chords that change start in the first chord's shape", () => {
    expect(handOf(exercise(firstChords, "c-major.three-chords"))?.chord).toBe("Em");
    expect(handOf(exercise(firstChords, "d-major.g-c-d"))?.chord).toBe("G");
  });

  it("a single-note pattern keeps its own position", () => {
    const run = exercise(alternate, (alternate as unknown as PathDoc).steps[0].exercises[0].id);
    expect(handOf(run)).toBe(run.position);
  });
});
