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
  fingering,
  nowNextNeck,
  readyNeck,
  SPAN_FRETS,
  warmupPosition,
  watchIndex,
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
  const fingers = fingering(
    onsets.map((o) => o.places[0]),
    { fret: 5, shifts: "none" },
  );

  it("puts NOW and NEXT on, every dot carrying its finger and never a fret or an order", () => {
    const out = nowNextNeck(shape, onsets, 1, null, false, fingers);
    const at = (f: number) => out.find((n) => n.fret === f)!;
    expect(at(7)).toMatchObject({ kind: "now", label: "3" });
    expect(at(8)).toMatchObject({ kind: "next", label: "4" });
    expect(at(5)).toMatchObject({ kind: "box", label: "1" });
    // Not in the pattern: no finger, and no number of any other kind.
    expect(at(3)).toMatchObject({ kind: "box", label: undefined });
  });

  it("leaves a dot blank where the finger is not known", () => {
    const out = nowNextNeck(shape, onsets, 1);
    expect(out.every((n) => n.label === undefined)).toBe(true);
  });

  it("keeps the letters on the quiet shape only in theory", () => {
    const out = nowNextNeck(shape, onsets, 1, null, true);
    expect(out.find((n) => n.fret === 3)!.label).toBe("G");
    expect(out.find((n) => n.fret === 7)!.label).toBe(undefined);
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

  it("before the start: fingers on the dots, the first note NOW, no order numbers", () => {
    // The pattern starts on 7, so an order number would put "1" there.
    const from7 = [onsets[1], onsets[2], onsets[0]];
    const out = readyNeck(shape, from7, fingers);
    expect(out.find((n) => n.fret === 7)).toMatchObject({ kind: "now", label: "3" });
    expect(out.find((n) => n.fret === 8)).toMatchObject({ kind: "box", label: "4" });
    expect(out.find((n) => n.fret === 5)).toMatchObject({ kind: "box", label: "1" });
    expect(out.find((n) => n.fret === 3)).toMatchObject({ kind: "dim", label: undefined });
    // No NEXT before the start: the order is the Watch preview's.
    expect(out.some((n) => n.kind === "next")).toBe(false);
  });

  it("keeps a played note's finger under its verdict's colour", () => {
    const verdicts = new Map([[1, "tone" as const]]);
    const out = nowNextNeck(shape, onsets, 2, verdicts, false, fingers);
    expect(out.find((n) => n.fret === 5)).toMatchObject({ kind: "tone", label: "1" });
    // No dot carries a fret number, whatever its kind.
    for (const n of out) if (n.label !== undefined) expect(["0", "1", "2", "3", "4"]).toContain(n.label);
  });

  it("names a finger only where the hand is fixed and the fret is under it", () => {
    expect(fingerFor({ fret: 5, shifts: "none" }, 7)).toBe(3);
    expect(fingerFor({ fret: 5, shifts: "none" }, 9)).toBe(null);
    expect(fingerFor({ fret: 5, shifts: "allowed" }, 7)).toBe(null);
    expect(fingerFor({ fret: 0, shifts: "none" }, 0)).toBe(null);
    expect(fingerFor(undefined, 3)).toBe(null);
  });
});

describe("the fingers on the dots", () => {
  const P = (string: number, fret: number, tech: string[] = []) => ({ string, fret, tech });

  it("is one finger per fret from the index at the hand's position", () => {
    const f = fingering([P(5, 5), P(5, 6), P(5, 7), P(5, 8)], { fret: 5, shifts: "none" });
    expect([...f.entries()]).toEqual([
      ["5:5", "1"],
      ["5:6", "2"],
      ["5:7", "3"],
      ["5:8", "4"],
    ]);
  });

  it("gives the C major sweep at 8 the shape's own fingering, the 12 to the little finger's stretch", () => {
    const sweep = [P(4, 10), P(3, 9), P(2, 8), P(1, 8), P(1, 12)];
    const f = fingering(sweep, { fret: 8, shifts: "none" });
    expect(f.get("4:10")).toBe("3");
    expect(f.get("3:9")).toBe("2");
    expect(f.get("2:8")).toBe("1");
    expect(f.get("1:8")).toBe("1");
    expect(f.get("1:12")).toBe("4");
  });

  it("gives the box lick 1, 3 and 4", () => {
    const f = fingering([P(1, 5), P(1, 8), P(2, 8), P(3, 7), P(4, 5)], { fret: 5, shifts: "none" });
    expect([f.get("1:5"), f.get("3:7"), f.get("1:8"), f.get("4:5")]).toEqual(["1", "3", "4", "1"]);
  });

  it("spreads a stretched string 1-3-4 or 1-2-4, and leaves two frets past the stretch unnumbered", () => {
    const f = fingering([P(1, 5), P(1, 8), P(1, 9)], { fret: 5, shifts: "none" });
    expect([f.get("1:5"), f.get("1:8"), f.get("1:9")]).toEqual(["1", "3", "4"]);
    const wide = fingering([P(1, 5), P(1, 11)], { fret: 5, shifts: "none" });
    expect(wide.get("1:11")).toBeUndefined();
  });

  it("marks an open string 0, a tap past the hand nothing, and a fret just below the hand the index's reach", () => {
    const f = fingering([P(5, 0), P(1, 12, ["tap"]), P(1, 4), P(1, 5)], { fret: 5, shifts: "none" });
    expect(f.get("5:0")).toBe("0");
    expect(f.has("1:12")).toBe(false);
    expect(f.get("1:4")).toBe("1");
    expect(f.get("1:5")).toBe("1");
    expect(fingering([P(1, 3)], { fret: 5, shifts: "none" }).has("1:3")).toBe(false);
  });

  it("numbers a hand that shifts too, moving it as little as it can", () => {
    const inHand = fingering([P(3, 5), P(3, 7)], { fret: 5, shifts: "allowed" });
    expect(inHand.get("3:7")).toBe("3");
    const moves = fingering([P(3, 5), P(3, 7), P(3, 12)], { fret: 5, shifts: "allowed" });
    expect([moves.get("3:5"), moves.get("3:7")]).toEqual(["1", "3"]);
    expect(moves.has("3:12")).toBe(true);
  });

  it("has open strings and nothing else without a hand position", () => {
    expect([...fingering([P(5, 0), P(1, 5)], undefined).entries()]).toEqual([["5:0", "0"]]);
  });
});

describe("the Watch preview", () => {
  const m = { onsets, barTicks: [0, 1920, 3840], endTick: 2400 };

  it("lights each note when its time comes, at the set tempo", () => {
    // 60 BPM, 480 ticks a quarter: a quarter is a second, 480 ticks.
    expect(watchIndex(m, 0, 60, 480).index).toBe(0);
    expect(watchIndex(m, 999, 60, 480).index).toBe(0);
    expect(watchIndex(m, 1000, 60, 480).index).toBe(1);
    expect(watchIndex(m, 4000, 60, 480).index).toBe(4);
    // Twice the tempo, twice as far.
    expect(watchIndex(m, 1000, 120, 480).index).toBe(2);
  });

  it("loops from the end back to the start", () => {
    // 2400 ticks a pass at 60 BPM is five seconds.
    expect(watchIndex(m, 5000, 60, 480)).toEqual({ index: 0, tick: 0 });
    expect(watchIndex(m, 6000, 60, 480).index).toBe(1);
  });

  it("counts from the first bar, not from a count-in", () => {
    const late = { onsets: onsets.map((o) => ({ ...o, tick: o.tick + 1920 })), barTicks: [1920, 3840], endTick: 4320 };
    expect(watchIndex(late, 0, 60, 480).index).toBe(0);
    expect(watchIndex(late, 1000, 60, 480).index).toBe(1);
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

  it("frames a pattern that fits as the ready screen does: its frets and one either side", () => {
    const fits = {
      barTicks: [0, 1920, 3840],
      onsets: [
        { id: 1, tick: 0, places: [{ string: 1, fret: 5 }] },
        { id: 2, tick: 1920, places: [{ string: 1, fret: 8 }] },
      ],
    };
    const plan = cameraPlan(fits);
    expect(plan.every((w) => w.from === 4 && w.to === 9)).toBe(true);
    expect(plan[0]).toEqual(windowOver(5, 8, SPAN_FRETS));
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
