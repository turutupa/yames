import { describe, expect, it } from "vitest";
import { ALT } from "../../../session/testKit";
import { buildTake } from "../../../session/take";
import type { NeckNote } from "../../../stage3d/api";
import { nextOnsetIndex, runwayModel, usedStrings } from "../highway/runwayModel";
import {
  barAt,
  beatInBar,
  cameraPlan,
  fingerFor,
  nowNextNeck,
  orderedNeck,
  thenFrets,
  warmupPosition,
  windowOver,
} from "./practiceModel";
import { warmupClockOf } from "./useWarmupBeat";

const exercise = ALT.steps[0].exercises[0];
const take = buildTake(ALT, exercise, 80, null);
const model = runwayModel(take);

const N = (string: number, fret: number, label?: string): NeckNote => ({
  string: string as NeckNote["string"],
  fret,
  kind: "aim",
  label,
});
const onsets = [
  { id: 1, tick: 0, places: [{ string: 1, fret: 5 }] },
  { id: 2, tick: 480, places: [{ string: 1, fret: 7 }] },
  { id: 3, tick: 960, places: [{ string: 1, fret: 8 }] },
  { id: 4, tick: 1440, places: [{ string: 1, fret: 7 }] },
  { id: 5, tick: 1920, places: [{ string: 1, fret: 5 }] },
];
const shape = [N(1, 5, "A"), N(1, 7, "B"), N(1, 8, "C"), N(1, 3, "G")];

describe("the neck as the instruction", () => {
  it("puts NOW and NEXT on with their fret numbers, the rest quiet and unlabelled", () => {
    const out = nowNextNeck(shape, onsets, 1);
    const at = (f: number) => out.find((n) => n.fret === f)!;
    expect(at(7)).toMatchObject({ kind: "now", label: "7" });
    expect(at(8)).toMatchObject({ kind: "next", label: "8" });
    expect(at(5)).toMatchObject({ kind: "box", label: undefined });
    expect(at(3)).toMatchObject({ kind: "box", label: undefined });
  });

  it("keeps the letters on the quiet shape only in theory", () => {
    const out = nowNextNeck(shape, onsets, 1, null, true);
    expect(out.find((n) => n.fret === 3)!.label).toBe("G");
    expect(out.find((n) => n.fret === 7)!.label).toBe("7");
  });

  it("colours the notes just played by their verdict, NOW winning a shared place", () => {
    const verdicts = new Map([
      [1, "tone" as const],
      [2, "clash" as const],
    ]);
    const out = nowNextNeck(shape, onsets, 2, verdicts);
    expect(out.find((n) => n.fret === 5)!.kind).toBe("tone");
    // Fret 7 was played (clash) and is NEXT again: NEXT wins.
    expect(out.find((n) => n.fret === 7)!.kind).toBe("next");
    expect(out.find((n) => n.fret === 8)!.kind).toBe("now");
  });

  it("numbers the pattern in order before the start", () => {
    const out = orderedNeck(shape, onsets);
    expect(out.find((n) => n.fret === 5)).toMatchObject({ kind: "now", label: "1" });
    expect(out.find((n) => n.fret === 7)).toMatchObject({ kind: "next", label: "2" });
    expect(out.find((n) => n.fret === 8)).toMatchObject({ kind: "box", label: "3" });
    expect(out.find((n) => n.fret === 3)).toMatchObject({ kind: "dim" });
  });

  it("says what comes after next", () => {
    expect(thenFrets(onsets, 0)).toEqual([8, 7]);
    expect(thenFrets(onsets, 3)).toEqual([]);
  });

  it("names a finger only where the hand is fixed and the fret is under it", () => {
    expect(fingerFor({ fret: 5, shifts: "none" }, 7)).toBe(3);
    expect(fingerFor({ fret: 5, shifts: "none" }, 9)).toBe(null);
    expect(fingerFor({ fret: 5, shifts: "allowed" }, 7)).toBe(null);
    expect(fingerFor({ fret: 0, shifts: "none" }, 0)).toBe(null);
    expect(fingerFor(undefined, 3)).toBe(null);
  });
});

describe("the camera", () => {
  it("frames about seven frets around the action", () => {
    expect(windowOver(5, 8)).toEqual({ from: 4, to: 11 });
    expect(windowOver(20, 24)).toEqual({ from: 17, to: 24 });
    expect(windowOver(1, 3)).toEqual({ from: 0, to: 7 });
  });

  it("moves only on a bar line, and only when the bar does not fit", () => {
    const bars = {
      barTicks: [0, 1920, 3840, 5760],
      onsets: [
        { id: 1, tick: 0, places: [{ string: 1, fret: 3 }] },
        { id: 2, tick: 960, places: [{ string: 1, fret: 5 }] },
        { id: 3, tick: 1920, places: [{ string: 1, fret: 7 }] },
        { id: 4, tick: 3840, places: [{ string: 1, fret: 12 }] },
      ],
    };
    const plan = cameraPlan(bars);
    expect(plan).toHaveLength(3);
    expect(plan[1]).toEqual(plan[0]); // 7 still fits the first window
    expect(plan[2]).not.toEqual(plan[1]);
    expect(plan[2].to).toBeGreaterThanOrEqual(12);
  });

  it("does not move at all for a pattern that fits", () => {
    const plan = cameraPlan(model);
    const frets = model.onsets.flatMap((o) => o.places.map((p) => p.fret)).filter((f) => f > 0);
    if (Math.max(...frets) - Math.min(...frets) <= 5) expect(new Set(plan.map((w) => `${w.from}-${w.to}`)).size).toBe(1);
  });
});

describe("the bar and the beat", () => {
  it("finds the bar and counts the beat, the count-in included", () => {
    expect(barAt(model.barTicks, 0)).toBe(0);
    expect(barAt(model.barTicks, model.barTicks[1] + 10)).toBe(1);
    expect(beatInBar(model, model.countInTicks, 960)).toBe(0);
    expect(beatInBar(model, model.countInTicks + 960 * 3 + 5, 960)).toBe(3);
    expect(beatInBar(model, 960 + 1, 960)).toBe(1);
  });
});

describe("a warm-up's position, from the click", () => {
  const clock = warmupClockOf(take);

  it("counts one bar in, then runs the pattern from its first note", () => {
    expect(warmupPosition(clock, 0).songCountIn).toBe(true);
    expect(warmupPosition(clock, 3).songCountIn).toBe(true);
    const first = warmupPosition(clock, 4);
    expect(first.songCountIn).toBe(false);
    expect(first.songTick).toBe(clock.start);
    expect(warmupPosition(clock, 5).songTick).toBe(clock.start + clock.perQuarter);
  });

  it("wraps on the pattern's own length: a loop seam is the pattern repeating", () => {
    const beatsPerPass = clock.passTicks / clock.perQuarter;
    const seam = warmupPosition(clock, 4 + beatsPerPass);
    expect(seam.songTick).toBe(clock.start);
    expect(seam.songPass).toBe(1);
    // At the seam the note to play is the pattern's first again.
    expect(nextOnsetIndex(model.onsets, seam.songTick, model.barLength / 32)).toBe(0);
  });

  it("repeats every exercise.bars bars, never longer than what is written", () => {
    const bar = take.score.bars[0].lengthTicks;
    expect(clock.passTicks).toBe(Math.min(bar * exercise.bars, model.endTick - clock.start));
  });
});

describe("the runway's lanes", () => {
  it("draws a lane for each string the Exercise plays, high e first", () => {
    const used = usedStrings(model);
    expect(used).toEqual([...new Set(model.notes.map((n) => n.string))].sort((a, b) => a - b));
    expect(usedStrings({ notes: [] })).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
