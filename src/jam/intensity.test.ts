// Intensity moves levels around inside a table. The one thing it must never
// do is change the table's SHAPE: a lane that came back a different length is
// a bar the engine refuses, silently, by playing the plain click. So the
// shape checks run over every stock groove, and the rule checks run over the
// grooves that have something for each rule to bite on.
import { describe, expect, it } from "vitest";
import { applyFeel } from "./feel";
import { GROOVES, grooveById, grooveTickCount, ruleGroove } from "./grooves";
import { applyIntensity, applyIntensityToGroove, isOffBeat } from "./intensity";
import { JAM_LANES } from "./types";
import type { JamIntensity, JamPattern } from "./types";

const EVERY: readonly JamIntensity[] = ["soft", "normal", "loud"];

function meterOf(g: { beatsPerBar: number; ticksPerBeat: 1 | 2 | 3 | 4 | 6 }) {
  return { beatsPerBar: g.beatsPerBar, ticksPerBeat: g.ticksPerBeat };
}

describe("the shape survives", () => {
  it("keeps every lane of every stock groove exactly as long as it was", () => {
    for (const g of GROOVES) {
      const ticks = grooveTickCount(g);
      for (const intensity of EVERY) {
        for (const source of [g.bar, g.fill]) {
          const out = applyIntensity(source, intensity, meterOf(g));
          for (const lane of JAM_LANES) {
            expect(out[lane], `${g.id} ${intensity} ${lane}`).toHaveLength(ticks);
          }
        }
      }
    }
  });

  it("writes only the four levels a drummer plays", () => {
    for (const g of GROOVES) {
      for (const intensity of EVERY) {
        const out = applyIntensity(g.bar, intensity, meterOf(g));
        for (const lane of JAM_LANES) {
          for (const level of out[lane]) {
            expect([0, 1, 2, 3], `${g.id} ${intensity} ${lane}`).toContain(level);
          }
        }
      }
    }
  });

  it("never wakes a tick that was silent, except the crash on the one", () => {
    // Loud is allowed exactly one new sound: the crash at tick 0. Everything
    // else it does is to a stroke the groove already had — otherwise it would
    // be writing a different groove rather than playing this one harder.
    for (const g of GROOVES) {
      const out = applyIntensity(g.bar, "loud", meterOf(g));
      for (const lane of JAM_LANES) {
        for (let t = 0; t < out[lane].length; t += 1) {
          if (lane === "crash" && t === 0) continue;
          if (g.bar[lane][t] === 0) {
            expect(out[lane][t], `${g.id} loud ${lane} @${t}`).toBe(0);
          }
        }
      }
    }
  });

  it("never wakes a tick that was silent at all, when soft", () => {
    for (const g of GROOVES) {
      const out = applyIntensity(g.bar, "soft", meterOf(g));
      for (const lane of JAM_LANES) {
        for (let t = 0; t < out[lane].length; t += 1) {
          if (g.bar[lane][t] === 0) {
            expect(out[lane][t], `${g.id} soft ${lane} @${t}`).toBe(0);
          }
        }
      }
    }
  });

  it("does not touch the pattern it was given", () => {
    const g = grooveById("funk");
    const before = JSON.stringify(g.bar);
    applyIntensity(g.bar, "loud", meterOf(g));
    applyIntensity(g.bar, "soft", meterOf(g));
    expect(JSON.stringify(g.bar)).toBe(before);
  });
});

describe("normal", () => {
  it("is the groove as written, by reference", () => {
    // Same object back, so a re-render that re-applies it does not hand the
    // engine a new table that is the same table.
    for (const g of GROOVES) {
      expect(applyIntensity(g.bar, "normal", meterOf(g))).toBe(g.bar);
      expect(applyIntensityToGroove(g, "normal")).toBe(g);
    }
  });
});

describe("loud", () => {
  it("turns every ghost into a hit", () => {
    for (const g of GROOVES) {
      const out = applyIntensity(g.bar, "loud", meterOf(g));
      for (const lane of JAM_LANES) {
        expect(out[lane], `${g.id} ${lane}`).not.toContain(3);
        for (let t = 0; t < out[lane].length; t += 1) {
          if (g.bar[lane][t] === 3) expect(out[lane][t]).toBe(1);
        }
      }
    }
  });

  it("opens the hat on the off-beats and leaves the downbeats where they are", () => {
    // Rock eighths: hats on every tick, accented on the beat. Loud leaves the
    // beats accented and raises the off-beats to accent too — an accent on
    // the hat lane IS the hat opening.
    const g = grooveById("rock8");
    const out = applyIntensity(g.bar, "loud", meterOf(g));
    expect(out.hat).toEqual([2, 2, 1, 2, 1, 2, 1, 2]);
  });

  it("does not open a hat that is not being played", () => {
    // The one-drop's hats are off-beat only; the downbeats stay silent.
    const g = grooveById("oneDrop");
    const out = applyIntensity(g.bar, "loud", meterOf(g));
    expect(out.hat).toEqual([0, 2, 0, 2, 0, 2, 0, 2]);
  });

  it("finds the off-beats of a triplet grid", () => {
    // On threes both ticks after the beat are off-beats, and the shuffle's
    // hat sits on the second of them.
    expect(isOffBeat(0, 3)).toBe(false);
    expect(isOffBeat(1, 3)).toBe(true);
    expect(isOffBeat(2, 3)).toBe(true);
    const g = grooveById("shuffle");
    const out = applyIntensity(g.bar, "loud", meterOf(g));
    expect([2, 5, 8, 11].every((t) => out.hat[t] === 2)).toBe(true);
    // The downbeats keep the level the groove wrote — the shuffle accents
    // only the one — because loud opens hats, it does not accent everything.
    expect(out.hat[0]).toBe(2);
    expect([3, 6, 9].every((t) => out.hat[t] === 1)).toBe(true);
  });

  it("has no off-beats to open where a beat is one tick", () => {
    const g = grooveById("sixEight");
    expect(g.ticksPerBeat).toBe(1);
    const out = applyIntensity(g.bar, "loud", meterOf(g));
    expect(out.hat).toEqual(g.bar.hat);
  });

  it("puts a crash on the one", () => {
    for (const g of GROOVES) {
      expect(applyIntensity(g.bar, "loud", meterOf(g)).crash[0], g.id).toBe(2);
    }
  });
});

describe("soft", () => {
  it("turns the snare's hits and accents into ghosts and leaves the kick alone", () => {
    for (const g of GROOVES) {
      const out = applyIntensity(g.bar, "soft", meterOf(g));
      expect(out.snare.some((l) => l === 1 || l === 2), g.id).toBe(false);
      for (let t = 0; t < out.snare.length; t += 1) {
        if (g.bar.snare[t] !== 0) expect(out.snare[t], `${g.id} @${t}`).toBe(3);
      }
      // The kick is the pulse. A jam with no findable pulse is not a quiet
      // jam, it is a broken one.
      expect(out.kick, g.id).toEqual(g.bar.kick);
    }
  });

  it("closes the hats", () => {
    for (const g of GROOVES) {
      const out = applyIntensity(g.bar, "soft", meterOf(g));
      expect(out.hat, g.id).not.toContain(2);
      for (let t = 0; t < out.hat.length; t += 1) {
        if (g.bar.hat[t] === 2) expect(out.hat[t]).toBe(1);
      }
    }
  });

  it("clears the crash lane", () => {
    // Hard rock is the one groove with a crash written into the bar, so it is
    // the one where this rule has anything to remove.
    const hard = grooveById("hardRock");
    expect(hard.bar.crash[0]).not.toBe(0);
    const out = applyIntensity(hard.bar, "soft", meterOf(hard));
    expect(out.crash.every((l) => l === 0)).toBe(true);
    expect(out.crash).toHaveLength(hard.bar.crash.length);
  });
});

describe("a whole groove", () => {
  it("puts the bar and the fill through the same rules", () => {
    const g = grooveById("funk");
    const out = applyIntensityToGroove(g, "loud");
    expect(out.id).toBe("funk");
    expect(out.bar).toEqual(applyIntensity(g.bar, "loud", meterOf(g)));
    expect(out.fill).toEqual(applyIntensity(g.fill, "loud", meterOf(g)));
    // The fill's snare figure keeps its accents; only its ghosts moved.
    expect(out.fill.snare.slice(8)).toEqual(g.fill.snare.slice(8));
  });

  it("takes a groove with no fill", () => {
    const g = grooveById("rock8");
    const out = applyIntensityToGroove(
      { beatsPerBar: g.beatsPerBar, ticksPerBeat: g.ticksPerBeat, bar: g.bar, fill: null },
      "soft",
    );
    expect(out.fill).toBeNull();
    expect(out.bar.snare).not.toContain(1);
  });

  it("works on a groove that has already been swung", () => {
    // Feel first, then intensity: the feel decides the grid, and the off-beat
    // rule has to find the off-beats of the grid it is actually handed.
    const swung = applyFeel(grooveById("rock8"), "swing");
    expect(swung.ticksPerBeat).toBe(3);
    const out = applyIntensityToGroove(swung, "loud");
    expect(out.bar.hat).toHaveLength(12);
    // Swing dropped the off-beat hats to ghosts; loud takes them back up, and
    // up to an accent, because they are off the beat.
    expect([2, 5, 8, 11].every((t) => out.bar.hat[t] === 2)).toBe(true);
  });

  it("works on the rule groove, in seven", () => {
    const rule = ruleGroove([2, 2, 3], 2);
    const out = applyIntensityToGroove(rule, "loud");
    for (const lane of JAM_LANES) {
      expect(out.bar[lane], lane).toHaveLength(14);
      expect(out.fill![lane], lane).toHaveLength(14);
    }
    expect(out.bar.crash[0]).toBe(2);
  });
});

describe("an empty table", () => {
  it("survives both directions", () => {
    // A drummer muted by the band row is every cell at zero, and the width
    // still has to be right or the engine refuses the bar.
    const empty: JamPattern = {
      kick: [0, 0, 0, 0],
      snare: [0, 0, 0, 0],
      hat: [0, 0, 0, 0],
      ride: [0, 0, 0, 0],
      crash: [0, 0, 0, 0],
    };
    const meter = { beatsPerBar: 2, ticksPerBeat: 2 } as const;
    const up = applyIntensity(empty, "loud", meter);
    expect(up.crash).toEqual([2, 0, 0, 0]);
    expect(up.kick).toEqual([0, 0, 0, 0]);
    const down = applyIntensity(empty, "soft", meter);
    for (const lane of JAM_LANES) expect(down[lane], lane).toEqual([0, 0, 0, 0]);
  });
});
