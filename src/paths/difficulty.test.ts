// The metric counts onsets, not notes: a strum, a double stop and a power
// chord are one attack. And counting onsets changed nothing for a line of
// single notes, which every pack is held to here.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exerciseDifficulty, onsetsOf, referenceBpm } from "./difficulty";
import type { Exercise, PathDoc, PathKind, PathNote, PathTechnique } from "./format";
import { TICKS } from "./format";
import { concreteExercises } from "./pipeline";
import { isPicked } from "./tabDsl";

type Shape = Parameters<typeof exerciseDifficulty>[0];

/** One onset: the strings struck together, at a beat. */
type Stroke = { beat: number; strings: number[]; tech?: PathTechnique[] };

const note = (beat: number, string: number, tech: PathTechnique[] = []): PathNote => ({
  string,
  fret: 5,
  midi: 60,
  tick: Math.round(beat * TICKS),
  dur: TICKS / 2,
  tech: [...tech],
});

const line = (strokes: Stroke[], bars = 1, bpm = 60): Shape => ({
  notes: strokes.flatMap((s) => s.strings.map((string) => note(s.beat, string, s.tech))),
  bars,
  meter: { numerator: 4, denominator: 4 },
  pickPlan: "free",
  grading: "graded",
  tempo: { rungs: [{ bpm, graded: true }], passAtBpm: bpm } as Shape["tempo"],
});

const of = (shape: Shape, shifts = 0, kind: PathKind = "mechanics") => exerciseDifficulty(shape, kind, shifts);

const quarters = (strings: (beat: number) => number[]): Stroke[] =>
  [0, 1, 2, 3].map((beat) => ({ beat, strings: strings(beat) }));

/**
 * The metric as it was while it counted notes, kept word for word: the
 * yardstick the single-note lines are held to. Do not "fix" it.
 */
function perNoteDifficulty(ex: Shape, kind: PathKind, handShifts: number): number {
  const FREEDOM = { graded: 0, landings: 1.5, selfChecked: 0.5, practiceOnly: 1.5 };
  const notes = ex.notes;
  const bpm = referenceBpm(ex);
  const beats = (ex.bars * ex.meter.numerator * 4) / ex.meter.denominator;
  const seconds = (beats * 60) / bpm;
  const nps = notes.length / Math.max(seconds, 0.001);
  let crossings = 0;
  let skips = 0;
  let expressive = 0;
  notes.forEach((n, index) => {
    const previous = notes[index - 1];
    if (previous) {
      const distance = Math.abs(previous.string - n.string);
      if (distance === 1) crossings += 1;
      if (distance > 1) skips += 1;
    }
    if (!isPicked(n, previous) || n.tech.includes("bend")) expressive += 1;
  });
  const count = Math.max(notes.length, 1);
  const mechanical =
    nps *
    (1 +
      (0.4 * crossings) / count +
      (0.6 * skips) / count +
      (0.3 * handShifts) / count +
      (ex.pickPlan === "sweep" ? 0.25 : 0));
  let value = mechanical + (0.3 * expressive * 10) / count;
  if (kind === "theory") {
    let changes = 0;
    (ex.chords ?? []).forEach((chord, index, all) => {
      if (index > 0 && chord !== all[index - 1]) changes += 1;
    });
    value += FREEDOM[ex.grading] + (0.5 * changes * 4) / Math.max(ex.bars, 1);
  }
  return Math.round(value * 100) / 100;
}

describe("onsets", () => {
  it("notes on one tick are one onset, in the order written", () => {
    const shape = line([
      { beat: 0, strings: [6, 5, 4] },
      { beat: 1, strings: [3] },
      { beat: 2, strings: [2, 1] },
    ]);
    expect(onsetsOf(shape.notes).map((o) => o.map((n) => n.string))).toEqual([[6, 5, 4], [3], [2, 1]]);
    expect(onsetsOf([])).toEqual([]);
  });
});

describe("the metric counts onsets", () => {
  it("a six-string strum in quarters is a single note in quarters", () => {
    const strum = line(quarters(() => [6, 5, 4, 3, 2, 1]));
    const single = line(quarters(() => [6]));
    expect(of(single)).toBe(1); // four onsets in four seconds, nothing else
    expect(of(strum)).toBe(of(single));
    // What it used to read: six notes a second, and the five strings inside each strum as crossings.
    expect(perNoteDifficulty(strum, "mechanics", 0)).toBe(8.45);
  });

  it("a down strum and the upstroke over the top strings is no crossing", () => {
    const swing = line(
      [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((beat, i) => ({ beat, strings: i % 2 === 0 ? [6, 5, 4, 3, 2, 1] : [3, 2, 1] })),
    );
    const single = line([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((beat) => ({ beat, strings: [1] })));
    expect(of(swing)).toBe(2);
    expect(of(swing)).toBe(of(single));
  });

  it("a double-stop line is its top line", () => {
    // Sixths on strings 1 and 3, then on 2 and 4, and back: the top line crosses each time.
    const tops = [1, 2, 1, 2];
    const stops = line(quarters((beat) => [tops[beat] + 2, tops[beat]]));
    const top = line(quarters((beat) => [tops[beat]]));
    expect(of(top)).toBe(1.3); // 1 × (1 + 0.4 × 3 / 4)
    expect(of(stops)).toBe(of(top));
    // And with the hand moving, and legato: slid into on both strings is one slid onset.
    const slid = (strings: (beat: number) => number[]) =>
      line(quarters(strings).map((s, i) => ({ ...s, strings: i < 2 ? [...s.strings] : s.strings.map((x) => x), tech: i % 2 === 0 ? ["slide" as const] : [] })));
    const stay = slid(() => [3, 1]);
    const stayTop = slid(() => [1]);
    expect(of(stayTop, 2)).toBe(2.65); // 1 × (1 + 0.3 × 2 / 4) + 3 × 2 / 4
    expect(of(stay, 2)).toBe(of(stayTop, 2));
  });

  it("a strum to a single note: the nearest strings decide", () => {
    const chord = [6, 5, 4];
    const after = (string: number) =>
      of(line([{ beat: 0, strings: chord }, { beat: 1, strings: [string] }, { beat: 2, strings: chord }, { beat: 3, strings: [string] }]));
    expect(after(5)).toBe(1); // a string of the chord: the pick is already there
    expect(after(4)).toBe(1);
    expect(after(3)).toBe(1.3); // the next string: three crossings in four onsets
    expect(after(2)).toBe(1.45); // a string further: three skips, 1 + 0.6 × 3 / 4
    expect(after(1)).toBe(1.45);
    // A bass note and the strings above it, as in a bass-strum pattern.
    expect(of(line([{ beat: 0, strings: [6] }, { beat: 1, strings: [3, 2, 1] }, { beat: 2, strings: [5] }, { beat: 3, strings: [3, 2, 1] }]))).toBe(1.45);
    expect(of(line([{ beat: 0, strings: [5] }, { beat: 1, strings: [4, 3, 2] }, { beat: 2, strings: [5] }, { beat: 3, strings: [4, 3, 2] }]))).toBe(1.3);
  });

  it("a mixed bar: every rate is per onset", () => {
    // Eight onsets in a bar at 120: a power chord, three single notes on its low
    // string, the chord a string over, a bent double stop, a hammer, a skip.
    const bar = line(
      [
        { beat: 0, strings: [6, 5] },
        { beat: 0.5, strings: [6] },
        { beat: 1, strings: [6] },
        { beat: 1.5, strings: [6] },
        { beat: 2, strings: [5, 4] }, // shares string 5 with nothing before it: 6 to 5 is a crossing
        { beat: 2.5, strings: [3, 2], tech: ["bend"] }, // 4 to 3: a crossing, and bent
        { beat: 3, strings: [2], tech: ["hammer"] }, // same string, legato
        { beat: 3.5, strings: [5] }, // 2 to 5: a skip
      ],
      1,
      120,
    );
    expect(bar.notes).toHaveLength(11);
    expect(onsetsOf(bar.notes)).toHaveLength(8);
    // 8 onsets in 2 s = 4 a second; × (1 + 0.4 × 2 / 8 + 0.6 × 1 / 8 + 0.3 × 1 / 8) + 3 × 2 / 8
    expect(of(bar, 1)).toBe(5.6);
    // A theory Path adds what it always added, and a sweep what it always did.
    expect(of({ ...bar, grading: "landings", chords: ["A7", "D7", "A7", "A7"] }, 1, "theory")).toBe(5.6 + 1.5 + 4);
    expect(of({ ...bar, pickPlan: "sweep" }, 1)).toBe(6.6);
  });

  it("one bent string in a double stop is a bent attack, counted once", () => {
    const unison: Shape = {
      ...line(quarters(() => [3, 2])),
      notes: [0, 1, 2, 3].flatMap((beat) => [note(beat, 3, ["bend"]), note(beat, 2)]),
    };
    expect(of(unison)).toBe(4); // 1 a second + 3 × 4 / 4
    expect(of(line(quarters(() => [3]).map((s) => ({ ...s, tech: ["bend" as const] }))))).toBe(4);
  });

  it("an empty Exercise is zero, not a division by nothing", () => {
    expect(of(line([]))).toBe(0);
  });
});

describe("every pack", () => {
  const dir = path.join(process.cwd(), "src/paths/packs");
  const docs = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as PathDoc);
  const all = docs.flatMap((doc) =>
    [...doc.steps.flatMap((s) => s.exercises), ...(doc.levels ?? []).flatMap((l) => l.warmups)]
      .flatMap(concreteExercises)
      .map((ex) => ({ doc, ex })),
  );
  const single = (ex: Exercise) => onsetsOf(ex.notes).length === ex.notes.length;

  it("is read: sixteen Paths, with single-note lines and chords in them", () => {
    expect(docs.length).toBeGreaterThanOrEqual(16);
    expect(all.filter(({ ex }) => single(ex)).length).toBeGreaterThan(1500);
    expect(all.filter(({ ex }) => !single(ex)).length).toBeGreaterThan(80);
  });

  it("a line with no simultaneous notes reads exactly what it read when notes were counted", () => {
    const moved = all
      .filter(({ ex }) => single(ex))
      .map(({ doc, ex }) => ({
        id: `${doc.id}/${ex.id}`,
        stored: ex.computed.difficulty,
        perNote: perNoteDifficulty(ex, doc.kind, ex.computed.handShifts),
        perOnset: exerciseDifficulty(ex, doc.kind, ex.computed.handShifts),
      }))
      .filter((r) => r.stored !== r.perNote || r.perOnset !== r.perNote);
    expect(moved).toEqual([]);
  });

  it("a line with chords in it never reads more than it did, and stores what the metric says", () => {
    for (const { doc, ex } of all.filter((one) => !single(one.ex))) {
      const now = exerciseDifficulty(ex, doc.kind, ex.computed.handShifts);
      expect(ex.computed.difficulty, `${doc.id}/${ex.id}`).toBe(now);
      expect(now, `${doc.id}/${ex.id}`).toBeLessThanOrEqual(perNoteDifficulty(ex, doc.kind, ex.computed.handShifts));
    }
  });
});
