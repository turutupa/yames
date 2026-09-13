import { describe, expect, it } from "vitest";
import { tempoAfterChorus, tempoAfterChoruses } from "./tempoTrainer";
import { MAX_BPM, MIN_BPM } from "../constants/metronome";

/** The trainer the plan describes: up 4 BPM every two choruses. */
const upFourEveryTwo = { tempoStep: 4, tempoEveryChoruses: 2 };

describe("the trainer switched off", () => {
  it("leaves the tempo alone when the step is 0", () => {
    for (let chorus = 1; chorus <= 12; chorus += 1) {
      expect(
        tempoAfterChorus({ bpm: 92, chorus, tempoStep: 0, tempoEveryChoruses: 2 }),
      ).toBe(92);
    }
  });

  it("leaves the tempo alone when no interval was set", () => {
    for (let chorus = 1; chorus <= 12; chorus += 1) {
      expect(
        tempoAfterChorus({ bpm: 92, chorus, tempoStep: 4, tempoEveryChoruses: 0 }),
      ).toBe(92);
    }
  });
});

describe("stepping", () => {
  it("goes up 4 BPM every two choruses", () => {
    const bpm = 92;
    expect(tempoAfterChorus({ bpm, chorus: 1, ...upFourEveryTwo })).toBe(92);
    expect(tempoAfterChorus({ bpm, chorus: 2, ...upFourEveryTwo })).toBe(96);
    expect(tempoAfterChorus({ bpm, chorus: 3, ...upFourEveryTwo })).toBe(92);
    expect(tempoAfterChorus({ bpm, chorus: 4, ...upFourEveryTwo })).toBe(96);
  });

  it("steps on every chorus when asked to", () => {
    for (let chorus = 1; chorus <= 6; chorus += 1) {
      expect(
        tempoAfterChorus({ bpm: 100, chorus, tempoStep: 2, tempoEveryChoruses: 1 }),
      ).toBe(102);
    }
  });

  it("climbs the way a player would feel it over a whole jam", () => {
    // Ten choruses at 4 BPM every two: five steps, 92 to 112.
    expect(tempoAfterChoruses({ bpm: 92, choruses: 10, ...upFourEveryTwo })).toBe(112);
    expect(tempoAfterChoruses({ bpm: 92, choruses: 0, ...upFourEveryTwo })).toBe(92);
    expect(tempoAfterChoruses({ bpm: 92, choruses: 1, ...upFourEveryTwo })).toBe(92);
    expect(tempoAfterChoruses({ bpm: 92, choruses: 2, ...upFourEveryTwo })).toBe(96);
  });

  it("ignores a chorus count that has not started yet", () => {
    expect(tempoAfterChorus({ bpm: 92, chorus: 0, ...upFourEveryTwo })).toBe(92);
    expect(tempoAfterChorus({ bpm: 92, chorus: -3, ...upFourEveryTwo })).toBe(92);
  });
});

describe("the ceiling", () => {
  it("stops at the ceiling rather than stepping over it", () => {
    expect(tempoAfterChorus({ bpm: 298, chorus: 2, ...upFourEveryTwo })).toBe(MAX_BPM);
    expect(tempoAfterChorus({ bpm: 298, chorus: 2, ...upFourEveryTwo, ceiling: 200 })).toBe(298);
  });

  it("defaults to the engine's own top tempo", () => {
    expect(tempoAfterChoruses({ bpm: 290, choruses: 40, ...upFourEveryTwo })).toBe(MAX_BPM);
  });

  it("never pulls a tempo the player chose back down to it", () => {
    // Somebody set 320 by hand. The trainer has nothing to add, but it is not
    // the trainer's business to take 20 BPM away either.
    expect(tempoAfterChorus({ bpm: 320, chorus: 2, ...upFourEveryTwo })).toBe(320);
  });

  it("honours a ceiling below the current tempo by leaving it alone", () => {
    expect(tempoAfterChorus({ bpm: 180, chorus: 2, ...upFourEveryTwo, ceiling: 120 })).toBe(180);
  });

  it("respects a lower ceiling the caller sets", () => {
    expect(tempoAfterChoruses({ bpm: 92, choruses: 100, ...upFourEveryTwo, ceiling: 120 })).toBe(
      120,
    );
  });
});

describe("stepping down", () => {
  it("takes the tempo off when the step is negative", () => {
    expect(tempoAfterChorus({ bpm: 120, chorus: 2, tempoStep: -5, tempoEveryChoruses: 2 })).toBe(
      115,
    );
  });

  it("stops at the engine's slowest tempo", () => {
    expect(
      tempoAfterChoruses({ bpm: 60, choruses: 100, tempoStep: -5, tempoEveryChoruses: 1 }),
    ).toBe(MIN_BPM);
  });
});

describe("determinism", () => {
  it("gives the same answer for the same chorus every time", () => {
    for (let chorus = 1; chorus <= 20; chorus += 1) {
      const once = tempoAfterChorus({ bpm: 108, chorus, ...upFourEveryTwo });
      const twice = tempoAfterChorus({ bpm: 108, chorus, ...upFourEveryTwo });
      expect(once).toBe(twice);
    }
  });

  it("only ever returns a whole number of beats per minute", () => {
    for (let chorus = 1; chorus <= 8; chorus += 1) {
      const bpm = tempoAfterChorus({
        bpm: 97,
        chorus,
        tempoStep: 3.7,
        tempoEveryChoruses: 1.9,
      });
      expect(Number.isInteger(bpm)).toBe(true);
    }
  });
});
