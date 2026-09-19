import { describe, it, expect } from "vitest";
import { countInBeats, countInIsOn, countInToggle, MAX_COUNT_IN_BEATS } from "./countIn";
import type { CountInSubject, CountInView } from "./countIn";
import { STARTER_JAMS } from "../../jam/jams";
import { grooveById } from "../../jam";
import type { AppState, Setlist, SetlistStep } from "../../types";

/**
 * One count-in for four modes (2026-09-19).
 *
 * The switch moved to the transport for every mode, and the owner was clear
 * about what it has to mean there: "count in at the very beginning and
 * that's it — remains consistent". These are that sentence, checked.
 */

const ramp = (warmupBeats: number) =>
  ({ warmupBeats, cyclic: false, startBpm: 80 }) as unknown as AppState["speedRamp"];

function subject(over: Partial<CountInSubject> = {}): CountInSubject {
  return {
    view: "beat",
    jam: null,
    setlist: null,
    state: { beatGroups: [4], timeSignature: 4, speedRamp: ramp(0) },
    ...over,
  };
}

function setlistOf(beatGroups: number[] | undefined, countIn?: number): Setlist {
  return {
    id: "s1",
    name: "A set",
    steps: [{ id: "a", beatGroups } as unknown as SetlistStep],
    countIn,
  } as unknown as Setlist;
}

describe("how many beats the switch arms", () => {
  it("counts one bar of the metronome's own meter", () => {
    expect(countInBeats(subject({ state: { beatGroups: [3], timeSignature: 3, speedRamp: ramp(0) } }))).toBe(3);
    expect(countInBeats(subject({ state: { beatGroups: [2, 3], timeSignature: 5, speedRamp: ramp(0) } }))).toBe(5);
  });

  it("counts one bar of the jam's groove, not the click's meter", () => {
    // The click may be in 4 while the jam is a 12/8 shuffle; the beats you
    // count have to be the beats you are about to play.
    const jam = STARTER_JAMS[0];
    const expected = Math.min(MAX_COUNT_IN_BEATS, grooveById(jam.grooveId).beatsPerBar);
    expect(countInBeats(subject({ view: "jam", jam }))).toBe(expected);
  });

  it("counts one bar of the setlist's FIRST step", () => {
    // Not the second and not the click's: a count-in is into the thing that
    // is about to start.
    const set = setlistOf([7]);
    expect(countInBeats(subject({ view: "setlist", setlist: set }))).toBe(7);
  });

  it("never asks the engine for more beats than it can count", () => {
    // 12/8 counts four, which is what a drummer would count anyway.
    const twelve = setlistOf([3, 3, 3, 3]);
    expect(countInBeats(subject({ view: "setlist", setlist: twelve }))).toBe(MAX_COUNT_IN_BEATS);
  });

  it("never arms zero, whatever it is handed", () => {
    // Zero would read as "on" in the UI and count nothing at all, which is
    // the one outcome a switch must never produce.
    const empty = setlistOf([]);
    expect(countInBeats(subject({ view: "setlist", setlist: empty }))).toBeGreaterThan(0);
    expect(
      countInBeats(subject({ state: { beatGroups: [], timeSignature: 0, speedRamp: ramp(0) } })),
    ).toBeGreaterThan(0);
  });
});

describe("which setting the switch reads", () => {
  it("reads the jam's own, on the jam", () => {
    expect(countInIsOn(subject({ view: "jam", jam: { ...STARTER_JAMS[0], countIn: 0 } }))).toBe(false);
    expect(countInIsOn(subject({ view: "jam", jam: { ...STARTER_JAMS[0], countIn: 4 } }))).toBe(true);
  });

  it("reads the setlist's own, on the setlist", () => {
    expect(countInIsOn(subject({ view: "setlist", setlist: setlistOf([4]) }))).toBe(false);
    expect(countInIsOn(subject({ view: "setlist", setlist: setlistOf([4], 4) }))).toBe(true);
  });

  it("reads the click's ramp on the metronome and the drill alike", () => {
    // They are the same click. One setting, and no second copy that can come
    // to disagree with it.
    for (const view of ["beat", "drill"] as const) {
      const state = { beatGroups: [4], timeSignature: 4, speedRamp: ramp(4) };
      expect(countInIsOn(subject({ view, state }))).toBe(true);
    }
  });
});

describe("what the switch writes", () => {
  it("sends each mode's answer to that mode's own store", () => {
    const cases: [CountInView, "jam" | "setlist" | "ramp"][] = [
      ["beat", "ramp"],
      ["drill", "ramp"],
      ["setlist", "setlist"],
      ["jam", "jam"],
    ];
    for (const [view, store] of cases) {
      expect(
        countInToggle(subject({ view, jam: STARTER_JAMS[0], setlist: setlistOf([4]) })).store,
        `${view} wrote to the wrong store`,
      ).toBe(store);
    }
  });

  it("turns off to nothing and on to a bar", () => {
    const off = subject({ view: "jam", jam: { ...STARTER_JAMS[0], countIn: 0 } });
    expect(countInToggle(off).beats).toBeGreaterThan(0);

    const on = subject({ view: "jam", jam: { ...STARTER_JAMS[0], countIn: 4 } });
    expect(countInToggle(on).beats).toBe(0);
  });

  it("turns a jam's two-bar count-in off in one press, not down to one bar", () => {
    // A switch is a switch. Whatever the setup drawer's dropdown was set to,
    // pressing this once means "no count-in".
    const jam = { ...STARTER_JAMS[0], countIn: 8 };
    expect(countInToggle(subject({ view: "jam", jam })).beats).toBe(0);
  });
});
