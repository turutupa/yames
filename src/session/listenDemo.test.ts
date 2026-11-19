/**
 * Listen first (card #28): the demo is the Exercise's own notes, at its tempo,
 * after the Take's bar of count-in, on a guitar voice the synth plays.
 */
import { describe, expect, it } from "vitest";
import { buildTransport } from "../songs/import";
import { loadAllPacks } from "./packs";
import { buildTake } from "./take";
import { LISTEN_COUNT_IN_BARS, LISTEN_GUITAR_GAIN, buildListenDemo, listenBars, listenProgram } from "./listenDemo";
import type { Exercise, PathDoc } from "../paths/format";

async function anExercise(pred: (ex: Exercise) => boolean): Promise<{ path: PathDoc; exercise: Exercise }> {
  const paths = await loadAllPacks("en");
  for (const path of paths) {
    for (const step of path.steps) {
      for (const exercise of step.exercises) if (pred(exercise)) return { path, exercise };
    }
  }
  throw new Error("no such Exercise in the packs");
}

describe("buildListenDemo", () => {
  it("is the Exercise's notes, note for note: same ticks, same pitches, at the Take's tempo", async () => {
    const { path, exercise } = await anExercise((ex) => ex.bars >= 2 && ex.notes.length > 3 && ex.backing.kind === "click");
    const take = buildTake(path, exercise, 87);
    const demo = buildListenDemo(take);
    expect(demo.bars).toBe(exercise.bars);
    const guitar = demo.backing.tracks[demo.guitarTrack];
    expect(guitar.role).toBe("synth");
    expect(guitar.guide).toBe(true);
    const want = [...take.exercise.notes].sort((a, b) => a.tick - b.tick || a.string - b.string);
    expect(guitar.notes.map((n) => [n.tick, n.midi])).toEqual(want.map((n) => [n.tick, n.midi]));
    for (const n of guitar.notes) {
      expect(n.durTicks).toBeGreaterThan(0);
      expect(n.velocity).toBeGreaterThan(0);
      expect(n.velocity).toBeLessThanOrEqual(1);
    }
    // At the tempo the Take will be played at, one pass, a bar of count-in, no loop.
    expect(demo.score.tempoMap).toEqual([{ tick: 0, bpm: 87 }]);
    const transport = buildTransport(demo.score, demo.range, { loops: false, countInBars: demo.countInBars, startTick: 0 });
    expect(transport.tempoMap[0].bpm).toBe(87);
    expect(transport.countInBars).toBe(LISTEN_COUNT_IN_BARS);
    expect(transport.countInBars).toBe(1);
    expect(transport.loops).toBe(false);
    expect(transport.range).toEqual({ startBar: 0, endBar: exercise.bars - 1 });
    // How long it plays, count-in included: (1 + bars) bars of 4/4 at 87.
    const quarters = (demo.endTick + demo.score.bars[0].lengthTicks) / 960;
    expect(demo.lengthMs).toBe(Math.round(quarters * (60_000 / 87)));
    // Every note sounds inside the pass.
    expect(Math.max(...guitar.notes.map((n) => n.tick))).toBeLessThan(demo.endTick);
    // A click Exercise: the click and the count-in at the Take's level, then the guitar.
    expect(demo.backing.tracks).toHaveLength(1);
    expect(demo.mix.click).toBeGreaterThan(0);
    expect(demo.mix.countIn).toBeGreaterThan(0);
    expect(demo.mix.tracks).toEqual([LISTEN_GUITAR_GAIN]);
  });

  it("plays a one-bar pattern twice, so its shape is heard repeating", async () => {
    const { path, exercise } = await anExercise((ex) => ex.bars === 1 && ex.notes.length > 1);
    const demo = buildListenDemo(buildTake(path, exercise, 100));
    expect(listenBars(exercise)).toBe(2);
    expect(demo.bars).toBe(2);
    const guitar = demo.backing.tracks[demo.guitarTrack];
    expect(guitar.notes).toHaveLength(exercise.notes.length * 2);
    const bar = demo.score.bars[1].startTick;
    expect(guitar.notes.slice(exercise.notes.length).map((n) => n.tick - bar)).toEqual(
      guitar.notes.slice(0, exercise.notes.length).map((n) => n.tick),
    );
  });

  it("a band Exercise keeps the Take's band under the guitar, at the player's band volume", async () => {
    const { path, exercise } = await anExercise((ex) => ex.backing.kind === "jam");
    const demo = buildListenDemo(buildTake(path, exercise, 90), { bandVolume: 0.5 });
    expect(demo.backing.tracks.length).toBeGreaterThan(1);
    expect(demo.guitarTrack).toBe(demo.backing.tracks.length - 1);
    expect(demo.mix.tracks).toHaveLength(demo.backing.tracks.length);
    expect(demo.mix.tracks[demo.guitarTrack]).toBe(LISTEN_GUITAR_GAIN);
    expect(demo.backing.tracks.slice(0, -1).every((t) => t.role !== "synth")).toBe(true);
    // The drummer keeps time, as in the Take; the count-in still counts.
    expect(demo.mix.click).toBe(0);
    expect(demo.mix.countIn).toBeGreaterThan(0);
  });

  it("plays in the player's instrument: clean electric by default, steel acoustic, fingered bass", () => {
    expect(listenProgram(undefined)).toBe(27);
    expect(listenProgram("electric-guitar")).toBe(27);
    expect(listenProgram("acoustic-guitar")).toBe(25);
    expect(listenProgram("bass")).toBe(33);
  });
});
