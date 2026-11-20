/** A loop's song: the bars of the pattern it names, on repeat, built the way Songs loops a passage. */
import { describe, expect, it } from "vitest";
import { loadAllPacks } from "./packs";
import { buildLoop, patternBars } from "./take";
import { buildTransport } from "../songs/import";
import { barLengthTicks } from "../paths/format";

describe("a loop plays the bars it names, and loops", () => {
  it("for every Exercise of every pack, the first bar and the last two", async () => {
    const docs = await loadAllPacks();
    let checked = 0;
    for (const path of docs) {
      for (const step of path.steps) {
        for (const ex of step.exercises) {
          const own = Math.max(1, ex.bars);
          const barTicks = barLengthTicks(ex.meter);
          const ranges: Array<[number, number]> = [[1, 1], [Math.max(1, own - 1), own]];
          for (const [from, to] of ranges) {
            const label = `${path.id}/${ex.id} bars ${from}-${to}`;
            const loop = buildLoop(path, ex, 60, null, from, to);
            const bars = to - from + 1;
            expect(loop.bars, label).toBe(bars);
            expect(loop.score.bars.length, label).toBe(bars);
            expect(loop.schedule.loops, label).toBe(true);
            expect(loop.schedule.lengthBeats, label).toBeCloseTo((bars * barTicks) / 960, 6);
            const written = ex.notes.filter((n) => n.tick >= (from - 1) * barTicks && n.tick < to * barTicks).length;
            expect(loop.score.notes.length, label).toBe(written);
            const transport = buildTransport(loop.score, loop.range, { loops: true, countInBars: 1, startTick: 0 });
            expect(transport.loops, label).toBe(true);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("cuts on the bar lines and keeps the notes' places in the bar", async () => {
    const docs = await loadAllPacks();
    const ex = docs.flatMap((p) => p.steps.flatMap((s) => s.exercises)).find((e) => e.bars >= 2);
    expect(ex).toBeDefined();
    if (!ex) return;
    const barTicks = barLengthTicks(ex.meter);
    const cut = patternBars(ex, 2, 2);
    expect(cut.bars).toBe(1);
    const second = ex.notes.filter((n) => n.tick >= barTicks && n.tick < 2 * barTicks);
    expect(cut.notes.map((n) => n.tick)).toEqual(second.map((n) => n.tick - barTicks));
    // Out of range is held to the pattern.
    expect(patternBars(ex, 0, 99).bars).toBe(ex.bars);
  });
});
