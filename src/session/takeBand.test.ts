import { describe, expect, it } from "vitest";
import blues from "../paths/packs/blues-pentatonics.json";
import rock from "../paths/packs/classic-rock.json";
import alt from "../paths/packs/alternate-picking.json";
import sweep from "../paths/packs/sweep-picking.json";
import type { Exercise, PathDoc } from "../paths/format";
import { barLengthTicks } from "../paths/format";
import { buildTake } from "./take";
import { bandJam, buildTakeBand, DEFAULT_BAND_VOLUME, isFillBar, readBandVolume, takeMix } from "./takeBand";

const PACKS = [blues, rock, alt, sweep] as unknown as PathDoc[];

function exercise(pack: PathDoc, id: string): Exercise {
  for (const step of pack.steps) for (const ex of step.exercises) if (ex.id === id) return ex;
  throw new Error(`no ${id}`);
}

const ROOT_ON_ONE = exercise(PACKS[0], "landing.root-on-one");
const TWELVE = exercise(PACKS[0], "twelve-bar.roots");
const ROOT_RIFF = exercise(PACKS[1], "riffs.root-riff");
const CLICK = exercise(PACKS[0], "box-one.box-eighths");

const notesOf = (ex: Exercise, bars: number, role: string) =>
  buildTakeBand(ex, bars, 90)!.tracks.find((t) => t.role === role)?.notes ?? [];

describe("the band a Take plays", () => {
  it("is nothing for a click Exercise", () => {
    expect(CLICK.backing.kind).toBe("click");
    expect(bandJam(CLICK, 80)).toBeNull();
    expect(buildTakeBand(CLICK, 8, 80)).toBeNull();
  });

  it("plays every jam-backed Exercise in the shipped packs, drums and bass, inside the Take", () => {
    let count = 0;
    for (const pack of PACKS) {
      for (const step of pack.steps) {
        for (const ex of step.exercises) {
          if (ex.backing.kind !== "jam") continue;
          count += 1;
          const bars = 8;
          const band = buildTakeBand(ex, bars, 90);
          expect(band, ex.id).not.toBeNull();
          expect(band!.tracks.map((t) => t.role), ex.id).toEqual(["drums", "bass"]);
          const end = bars * barLengthTicks(ex.meter);
          for (const t of band!.tracks) {
            expect(t.guide).toBe(false);
            for (const n of t.notes) {
              expect(n.tick, ex.id).toBeGreaterThanOrEqual(0);
              expect(n.tick, ex.id).toBeLessThan(end);
              expect(n.velocity).toBeGreaterThan(0);
              expect(n.velocity).toBeLessThanOrEqual(1);
              expect(n.durTicks).toBeGreaterThan(0);
            }
          }
        }
      }
    }
    expect(count).toBeGreaterThan(60);
  });

  it("swings a shuffle: drums on the triplet grid, never on the straight off-beat", () => {
    expect(ROOT_ON_ONE.backing.kind === "jam" && ROOT_ON_ONE.backing.feel).toBe("shuffle");
    const drums = notesOf(ROOT_ON_ONE, 8, "drums");
    expect(drums.every((n) => n.tick % 320 === 0)).toBe(true);
    expect(drums.some((n) => n.tick % 960 === 640)).toBe(true);
    expect(drums.some((n) => n.tick % 960 === 480)).toBe(false);
  });

  it("plays rock eighths on the straight grid", () => {
    const drums = notesOf(ROOT_RIFF, 8, "drums");
    expect(drums.every((n) => n.tick % 480 === 0)).toBe(true);
    // A backbeat: a snare on two and four of every bar but the fill.
    for (let bar = 0; bar < 8; bar += 1) {
      if (isFillBar(bar, 2, 8)) continue;
      for (const beat of [1, 3]) {
        const at = bar * 3840 + beat * 960;
        expect(drums.some((n) => n.midi === 38 && n.tick === at), `bar ${bar} beat ${beat + 1}`).toBe(true);
      }
    }
  });

  it("follows the chart: the bass moves to D on bar 5 and E on bar 9 of a twelve-bar", () => {
    const bass = notesOf(TWELVE, 12, "bass");
    const rootOf = (bar: number) => bass.find((n) => n.tick === bar * 3840)!.midi % 12;
    expect(rootOf(0)).toBe(9); // A
    expect(rootOf(4)).toBe(2); // D
    expect(rootOf(8)).toBe(4); // E
    expect(rootOf(10)).toBe(9);
  });

  it("repeats a two-bar chart under an eight-bar Take", () => {
    const bass = notesOf(ROOT_RIFF, 8, "bass");
    const bar = (b: number) => bass.filter((n) => n.tick >= b * 3840 && n.tick < (b + 1) * 3840).map((n) => n.midi);
    expect(bar(0).length).toBeGreaterThan(0);
    expect(bar(0)).toEqual(bar(2));
  });

  it("crashes the Take in, fills at the end of a phrase, never on the last bar", () => {
    const drums = notesOf(ROOT_RIFF, 8, "drums");
    expect(drums.some((n) => n.midi === 49 && n.tick === 0)).toBe(true);
    expect(isFillBar(3, 2, 8)).toBe(true);
    expect(isFillBar(7, 2, 8)).toBe(false);
    expect(isFillBar(11, 12, 12)).toBe(false);
    expect(drums.some((n) => n.midi === 49 && n.tick === 4 * 3840)).toBe(true);
  });

  it("matches the Take built for the same Exercise, bar for bar", () => {
    const take = buildTake(PACKS[0], ROOT_ON_ONE, 90);
    const band = buildTakeBand(take.exercise, take.bars, take.bpm)!;
    const last = Math.max(...band.tracks.flatMap((t) => t.notes.map((n) => n.tick)));
    expect(Math.floor(last / 3840)).toBe(take.bars - 1);
    // The band is never in the notes the scorer expects.
    expect(take.score.notes.length).toBeGreaterThan(0);
    expect(take.schedule).toBeTruthy();
  });

  it("follows the lineup it is given", () => {
    const band = buildTakeBand(ROOT_RIFF, 8, 90, { drums: true, bass: false, keys: false });
    expect(band!.tracks.map((t) => t.role)).toEqual(["drums"]);
  });
});

describe("the Take's mix", () => {
  const band = buildTakeBand(ROOT_RIFF, 8, 90);

  it("turns the click off under a band, and the count-in still counts", () => {
    const mix = takeMix(band, DEFAULT_BAND_VOLUME, 0.45);
    expect(mix.click).toBe(0);
    expect(mix.countIn).toBe(0.45);
    expect(mix.tracks).toEqual([DEFAULT_BAND_VOLUME, DEFAULT_BAND_VOLUME * 0.9]);
  });

  it("brings the click back when the band is turned all the way down, or there is none", () => {
    expect(takeMix(band, 0, 0.45).click).toBe(0.45);
    expect(takeMix(null, 0.8, 0.45)).toEqual({ click: 0.45, countIn: 0.45, tracks: [] });
  });

  it("reads a stored band volume, clamped, and the default for anything else", () => {
    expect(readBandVolume(undefined)).toBe(DEFAULT_BAND_VOLUME);
    expect(readBandVolume("loud")).toBe(DEFAULT_BAND_VOLUME);
    expect(readBandVolume(0.3)).toBe(0.3);
    expect(readBandVolume(9)).toBe(1.5);
    expect(readBandVolume(-1)).toBe(0);
  });
});
