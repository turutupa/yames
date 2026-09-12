// The grooves are tables, and a table with the wrong number of columns is a
// bar the engine will refuse — silently, by playing the plain click. These
// checks are the only thing between a mistyped lane string and a jam that
// looks loaded and sounds like a metronome.
import { describe, expect, it } from "vitest";
import { GROOVES, grooveById, grooveTickCount, DEFAULT_GROOVE_ID } from "./grooves";
import { JAM_LANES } from "./types";

describe("the eight grooves", () => {
  it("ships exactly eight, with unique ids", () => {
    expect(GROOVES).toHaveLength(8);
    expect(new Set(GROOVES.map((g) => g.id)).size).toBe(8);
  });

  it("gives every lane of every bar and fill exactly one column per tick", () => {
    for (const g of GROOVES) {
      const ticks = grooveTickCount(g);
      for (const lane of JAM_LANES) {
        expect(g.bar[lane], `${g.id} bar.${lane}`).toHaveLength(ticks);
        expect(g.fill[lane], `${g.id} fill.${lane}`).toHaveLength(ticks);
      }
    }
  });

  it("writes only the four levels a drummer plays", () => {
    for (const g of GROOVES) {
      for (const lane of JAM_LANES) {
        for (const level of [...g.bar[lane], ...g.fill[lane]]) {
          expect([0, 1, 2, 3], `${g.id} ${lane}`).toContain(level);
        }
      }
    }
  });

  it("names every groove through a key, so the picker can be translated", () => {
    for (const g of GROOVES) expect(g.nameKey).toBe(`jam.groove.${g.id}`);
  });

  it("puts something on the one of every groove", () => {
    // A bar whose first column is empty starts with a hole, and the crash the
    // engine lands there has nothing to land with.
    for (const g of GROOVES) {
      const onTheOne = JAM_LANES.some((lane) => g.bar[lane][0] !== 0);
      expect(onTheOne, `${g.id} plays nothing on the one`).toBe(true);
    }
  });

  it("carries the meter each groove is actually written in", () => {
    const meters = Object.fromEntries(
      GROOVES.map((g) => [g.id, [g.beatsPerBar, g.ticksPerBeat]]),
    );
    expect(meters.waltz).toEqual([3, 2]);
    expect(meters.sixEight).toEqual([6, 1]);
    expect(meters.shuffle).toEqual([4, 3]);
    expect(meters.swingRide).toEqual([4, 3]);
    expect(meters.bossa).toEqual([4, 4]);
    expect(meters.rock16).toEqual([4, 4]);
  });

  it("leaves the shuffle's middle triplet empty — that is what a shuffle is", () => {
    const shuffle = grooveById("shuffle");
    for (let beat = 0; beat < shuffle.beatsPerBar; beat++) {
      for (const lane of JAM_LANES) {
        expect(shuffle.bar[lane][beat * 3 + 1], `${lane} beat ${beat}`).toBe(0);
      }
    }
  });

  it("gives the swing ride its ride and the rock grooves their hat", () => {
    // The lane a groove is played on is part of what it is called.
    expect(grooveById("swingRide").bar.ride.some((l) => l !== 0)).toBe(true);
    expect(grooveById("swingRide").bar.hat.filter((l) => l !== 0)).toHaveLength(2);
    expect(grooveById("rock8").bar.hat.every((l) => l !== 0)).toBe(true);
    expect(grooveById("rock8").bar.ride.every((l) => l === 0)).toBe(true);
  });

  it("writes ghosts into the sixteenth-note grooves", () => {
    // Without them a funk groove is the same pattern a drum machine plays.
    expect(grooveById("rock16").bar.snare).toContain(3);
    expect(grooveById("swingRide").bar.kick).toContain(3);
  });
});

describe("the fill", () => {
  it("keeps the groove going until the last two beats, then plays snare", () => {
    for (const g of GROOVES) {
      const figureBeats = Math.min(2, g.beatsPerBar);
      const from = (g.beatsPerBar - figureBeats) * g.ticksPerBeat;
      // Up to the figure, the fill IS the groove — the time never stops.
      for (let i = 0; i < from; i++) {
        for (const lane of JAM_LANES) {
          expect(g.fill[lane][i], `${g.id} ${lane} @${i}`).toBe(g.bar[lane][i]);
        }
      }
      // From there, snare alone, and every tick of it.
      for (let i = from; i < grooveTickCount(g); i++) {
        expect(g.fill.kick[i], `${g.id} kick @${i}`).toBe(0);
        expect(g.fill.hat[i], `${g.id} hat @${i}`).toBe(0);
        expect(g.fill.ride[i], `${g.id} ride @${i}`).toBe(0);
        expect(g.fill.snare[i], `${g.id} snare @${i}`).not.toBe(0);
      }
    }
  });

  it("accents the beat inside the figure", () => {
    const g = grooveById("rock8");
    // Two beats of eighths: accent, hit, accent, hit.
    expect(g.fill.snare.slice(4)).toEqual([2, 1, 2, 1]);
  });
});

describe("looking a groove up", () => {
  it("falls back rather than returning nothing for a groove that went", () => {
    // A jam saved by a later build can name a groove this one does not have.
    expect(grooveById("no-such-groove").id).toBe(DEFAULT_GROOVE_ID);
  });

  it("finds every groove it ships", () => {
    for (const g of GROOVES) expect(grooveById(g.id)).toBe(g);
  });
});
