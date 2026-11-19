/**
 * A Take's length, agreed by everything that reads it: the bars the grade
 * counts (`takeBarsOf`), the song the engine is loaded with (its range ends on
 * the Take's last bar line, so the engine's end is the UI's last bar), the
 * notes the scorer is handed, and the band under it.
 */
import { describe, expect, it } from "vitest";
import { loadAllPacks } from "./packs";
import { takeBarsOf } from "./grade";
import { buildTake, withVariant, writtenOut } from "./take";
import { buildTakeBand } from "./takeBand";
import { buildTransport } from "../songs/import";
import { barLengthTicks } from "../paths/format";
import { VARIANT_TEXT_SPEC } from "../paths/fixtures/minimal";
import { buildPath } from "../paths/generate";

describe("a Take's song ends on the Take's last bar", () => {
  it("for every Exercise and every variant in every pack", async () => {
    const docs = await loadAllPacks();
    let checked = 0;
    for (const path of docs) {
      for (const step of path.steps) {
        for (const ex of step.exercises) {
          const variants = ex.variation?.variants.length ?? 0;
          for (const seed of [null, ...Array.from({ length: variants }, (_u, i) => i)]) {
            const label = `${path.id}/${ex.id}${seed === null ? "" : ` variant ${seed}`}`;
            const bpm = 80;
            const take = buildTake(path, ex, bpm, seed);
            const bars = takeBarsOf(take.exercise);
            const barTicks = barLengthTicks(take.exercise.meter);
            const end = bars * barTicks;
            expect(take.bars, label).toBe(bars);
            // The song: as many bars as the Take, and its range is all of them.
            expect(take.score.bars.length, label).toBe(bars);
            expect(take.range, label).toEqual({ startBar: 0, endBar: bars - 1 });
            const transport = buildTransport(take.score, take.range, { loops: false, countInBars: 1, startTick: 0 });
            const last = transport.bars[transport.range.endBar];
            expect(last.startTick + last.lengthTicks, label).toBe(end);
            expect(transport.loops, label).toBe(false);
            // The notes: every pass of the pattern, cut on the last bar line.
            const own = Math.max(1, take.exercise.bars);
            const expected = take.exercise.notes.reduce(
              (n, note) =>
                n + Array.from({ length: Math.ceil(bars / own) }, (_u, p) => note.tick + p * own * barTicks)
                  .filter((t) => t < end).length,
              0,
            );
            expect(take.score.notes.length, label).toBe(expected);
            expect(writtenOut(take.exercise, bars).notes.length, label).toBe(expected);
            for (const n of take.score.notes) expect(n.tick, label).toBeLessThan(end);
            // The scorer's schedule is as long as the Take, every onset inside it.
            const beatsPerBar = barTicks / 960;
            expect(take.schedule.lengthBeats, label).toBeCloseTo(bars * beatsPerBar, 6);
            expect(take.schedule.loops, label).toBe(false);
            // The band, when there is one, plays the Take's bars and no more.
            const band = buildTakeBand(take.exercise, bars, bpm);
            for (const track of band?.tracks ?? []) {
              for (const n of track.notes) expect(n.tick, label).toBeLessThan(end);
            }
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});

describe("a Take's Exercise carries the words of the variant it plays", () => {
  const path = buildPath(VARIANT_TEXT_SPEC);
  const warm = path.levels![0].warmups[0];

  it("the variant's own why and how-to, under the Exercise's own id", () => {
    const take = buildTake(path, warm, 60, 1);
    expect(take.exercise.id).toBe(warm.id);
    expect(take.exercise.purpose).toBe("A purpose of its own for the line moved up 2 frets.");
    expect(take.exercise.howTo).toEqual(["Play it evenly.", "Start at fret 5."]);
    expect(take.exercise.notes).toEqual(warm.variation!.variants[1].notes);
  });

  it("the Exercise's for the first variant, and with no variant picked", () => {
    expect(withVariant(warm, 0).howTo).toEqual(warm.howTo);
    expect(withVariant(warm, 0).purpose).toBe(warm.purpose);
    expect(withVariant(warm, null)).toBe(warm);
  });
});
