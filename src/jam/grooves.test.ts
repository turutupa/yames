// The grooves are tables, and a table with the wrong number of columns is a
// bar the engine will refuse — silently, by playing the plain click. These
// checks are the only thing between a mistyped lane string and a jam that
// looks loaded and sounds like a metronome.
import { describe, expect, it } from "vitest";
import { GROOVES, grooveById, grooveTickCount, ruleGroove, DEFAULT_GROOVE_ID } from "./grooves";
import { JAM_LANES } from "./types";

describe("the thirteen grooves", () => {
  it("ships exactly thirteen, with unique ids", () => {
    expect(GROOVES).toHaveLength(13);
    expect(new Set(GROOVES.map((g) => g.id)).size).toBe(13);
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

  it("puts something on the one of every groove but the one-drop", () => {
    // A bar whose first column is empty starts with a hole, and the crash the
    // engine lands there has nothing to land with.
    //
    // The one-drop is the exception, and it is the exception on purpose: the
    // empty one IS the groove. Naming it here rather than loosening the rule
    // keeps the check honest for the other twelve — a mistyped lane string in
    // a rock beat is still a hole, and still caught.
    for (const g of GROOVES) {
      if (g.id === "oneDrop") continue;
      const onTheOne = JAM_LANES.some((lane) => g.bar[lane][0] !== 0);
      expect(onTheOne, `${g.id} plays nothing on the one`).toBe(true);
    }
    const oneDrop = grooveById("oneDrop");
    expect(JAM_LANES.every((lane) => oneDrop.bar[lane][0] === 0)).toBe(true);
  });

  it("writes the five later grooves the way they are played", () => {
    // Each of these is a one-line answer to "what makes it that groove", and
    // each is the line a retyped lane string would break.
    const funk = grooveById("funk");
    // The kick never lands on beats 2, 3 or 4 — that is the syncopation.
    expect([4, 8, 12].every((t) => funk.bar.kick[t] === 0)).toBe(true);
    expect(funk.bar.snare).toContain(3);

    // The one-drop: kick and side stick together on three, hats off-beat only.
    const oneDrop = grooveById("oneDrop");
    expect(oneDrop.bar.kick[4]).not.toBe(0);
    expect(oneDrop.bar.snare[4]).toBe(3);
    expect([0, 2, 4, 6].every((t) => oneDrop.bar.hat[t] === 0)).toBe(true);
    expect([1, 3, 5, 7].every((t) => oneDrop.bar.hat[t] !== 0)).toBe(true);

    // The train: sixteenths all the way, accented on every "and".
    const train = grooveById("train");
    expect(train.bar.snare.every((l) => l !== 0)).toBe(true);
    expect([2, 6, 10, 14].every((t) => train.bar.snare[t] === 2)).toBe(true);
    expect(train.bar.kick.filter((l) => l !== 0)).toHaveLength(2);

    // Boom bap: one and the "and" of two, backbeat on two and four, and the
    // accented last eighth that stands in for the open hat.
    const boomBap = grooveById("boomBap");
    expect(boomBap.bar.kick[0]).not.toBe(0);
    expect(boomBap.bar.kick[3]).not.toBe(0);
    expect(boomBap.bar.snare[2]).not.toBe(0);
    expect(boomBap.bar.snare[6]).not.toBe(0);
    expect(boomBap.bar.hat[7]).toBe(2);

    // Four on the floor: every beat, and the hat on none of them.
    const four = grooveById("fourOnFloor");
    expect([0, 2, 4, 6].every((t) => four.bar.kick[t] !== 0)).toBe(true);
    expect([0, 2, 4, 6].every((t) => four.bar.hat[t] === 0)).toBe(true);
    expect([1, 3, 5, 7].every((t) => four.bar.hat[t] !== 0)).toBe(true);
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
    expect(meters.funk).toEqual([4, 4]);
    expect(meters.train).toEqual([4, 4]);
    expect(meters.oneDrop).toEqual([4, 2]);
    expect(meters.boomBap).toEqual([4, 2]);
    expect(meters.fourOnFloor).toEqual([4, 2]);
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

/**
 * The drummer for a meter nobody wrote a groove for. Thirteen grooves is
 * thirteen grooves and none of them is in seven, so the alternative to this
 * rule is a jam in seven with no drummer in it (JAM_MODE §4.1).
 */
describe("the rule groove", () => {
  it("puts the kick on the first beat of every group", () => {
    // 5/4 as 3+2, eighths: groups open on beats 0 and 3, which is ticks 0 and 6.
    const g = ruleGroove([3, 2], 2);
    expect(g.beatsPerBar).toBe(5);
    expect(g.ticksPerBeat).toBe(2);
    expect(g.bar.kick).toEqual([2, 0, 0, 0, 0, 0, 2, 0, 0, 0]);
  });

  it("puts the snare on the last beat of every group of two or more", () => {
    // 3+2: the last beats are 2 and 4, which is ticks 4 and 8.
    expect(ruleGroove([3, 2], 2).bar.snare).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 1, 0]);
    // A group of one has no room for a backbeat: it would land on the kick.
    expect(ruleGroove([1, 3], 1).bar.snare).toEqual([0, 0, 0, 1]);
  });

  it("puts hats on every tick, accented where a group opens", () => {
    // 7/8 as 2+2+3, eighths: fourteen ticks, accents at 0, 4 and 8.
    const g = ruleGroove([2, 2, 3], 2);
    expect(g.bar.hat).toEqual([2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 1]);
  });

  it("builds 7/8 as 2+2+3 in sixteenths at the right width", () => {
    const g = ruleGroove([2, 2, 3], 4);
    expect(g.beatsPerBar).toBe(7);
    expect(grooveTickCount(g)).toBe(28);
    for (const lane of JAM_LANES) {
      expect(g.bar[lane], `bar.${lane}`).toHaveLength(28);
      expect(g.fill[lane], `fill.${lane}`).toHaveLength(28);
    }
    // Kicks on beats 0, 2 and 4 — ticks 0, 8 and 16 at four ticks a beat.
    expect(g.bar.kick.flatMap((level, i) => (level ? [i] : []))).toEqual([0, 8, 16]);
    // Snares on beats 1, 3 and 6 — ticks 4, 12 and 24.
    expect(g.bar.snare.flatMap((level, i) => (level ? [i] : []))).toEqual([4, 12, 24]);
  });

  it("builds 5/4 as 3+2 in sixteenths at the right width", () => {
    const g = ruleGroove([3, 2], 4);
    expect(grooveTickCount(g)).toBe(20);
    expect(g.bar.kick.flatMap((level, i) => (level ? [i] : []))).toEqual([0, 12]);
    expect(g.bar.snare.flatMap((level, i) => (level ? [i] : []))).toEqual([8, 16]);
  });

  it("plays snare eighths over the last group as its fill", () => {
    // 2+2+3 in eighths: the last group is beats 4-6, ticks 8-13. Every tick
    // is an eighth here, so the snare plays all six, accented on each beat.
    const g = ruleGroove([2, 2, 3], 2);
    expect(g.fill.snare.slice(8)).toEqual([2, 1, 2, 1, 2, 1]);
    // Everything else is out of the way so the fill is heard as a fill.
    expect(g.fill.kick.slice(8)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(g.fill.hat.slice(8)).toEqual([0, 0, 0, 0, 0, 0]);
    // The bar up to the fill is the groove, unchanged — a fill that threw the
    // whole bar away would stop the time dead.
    expect(g.fill.hat.slice(0, 8)).toEqual(g.bar.hat.slice(0, 8));
  });

  it("plays eighths, not sixteenths, when the bar is written in sixteenths", () => {
    // 3+2 in sixteenths: the last group is beats 3-4, ticks 12-19, and an
    // eighth is two ticks — accent, rest, hit, rest, accent, rest, hit, rest.
    const g = ruleGroove([3, 2], 4);
    expect(g.fill.snare.slice(12)).toEqual([2, 0, 1, 0, 2, 0, 1, 0]);
  });

  it("gives every lane one column per tick, for every meter and resolution", () => {
    for (const groups of [[2], [3], [4], [3, 2], [2, 3], [2, 2, 3], [3, 2, 2], [3, 3, 3, 3]]) {
      for (const ticks of [1, 2, 3, 4, 6] as const) {
        const g = ruleGroove(groups, ticks);
        const width = grooveTickCount(g);
        expect(width).toBe(groups.reduce((sum, n) => sum + n, 0) * ticks);
        for (const lane of JAM_LANES) {
          expect(g.bar[lane], `${groups}/${ticks} bar.${lane}`).toHaveLength(width);
          expect(g.fill[lane], `${groups}/${ticks} fill.${lane}`).toHaveLength(width);
        }
      }
    }
  });

  it("writes only the four levels a drummer plays", () => {
    for (const groups of [[3, 2], [2, 2, 3]]) {
      for (const ticks of [2, 4] as const) {
        const g = ruleGroove(groups, ticks);
        for (const lane of JAM_LANES) {
          for (const level of [...g.bar[lane], ...g.fill[lane]]) {
            expect([0, 1, 2, 3]).toContain(level);
          }
        }
      }
    }
  });

  it("falls back to a bar of four rather than to no bar at all", () => {
    // A meter array out of a saved record can be empty or nonsense; a jam
    // with no drummer would be the worse answer.
    expect(ruleGroove([], 2).beatsPerBar).toBe(4);
    expect(ruleGroove([0, -3], 2).beatsPerBar).toBe(4);
  });

  it("leaves the crash to the engine", () => {
    const g = ruleGroove([2, 2, 3], 2);
    expect(g.bar.crash.every((level) => level === 0)).toBe(true);
    expect(g.fill.crash.every((level) => level === 0)).toBe(true);
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
