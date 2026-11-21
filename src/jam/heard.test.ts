import { describe, expect, it } from "vitest";
import type { HeardLive, HeardSummary } from "../ipc";
import { forgetHeard, heardLine, heardRecap, heardSince, jamHeardLine, rememberHeard, RECAP_MIN_HEARD_S } from "./heard";
import type { JamHarmony } from "./display";

const live = (over: Partial<HeardLive>): HeardLive => ({
  keyState: "listening",
  key: null,
  chord: null,
  shownChord: null,
  settledAtS: null,
  heardS: 30,
  ...over,
});
const aMinor = { key: { tonic: 9, mode: "minor" as const }, scale: "aeolian", confidence: 0.6, relativeToo: false };
const chord = (root: number, quality: "maj" | "min" | "dom7" = "maj") => ({ root, quality, label: null, fromChart: false });

describe("the line the Jam shows for what it hears", () => {
  it("says nothing was heard yet, then that it couldn't tell, and never guesses a key", () => {
    expect(heardLine(null)).toBeNull();
    expect(heardLine(live({}))).toEqual({ state: "listening" });
    // a leading key that has not settled is not shown
    expect(heardLine(live({ keyState: "unsure", key: aMinor }))).toEqual({ state: "unsure" });
  });

  it("shows a settled key, and the chord only when the worker says it may be shown", () => {
    const settled = live({ keyState: "settled", key: aMinor, chord: chord(2, "min") });
    // the engine's newest beat (`chord`) is not what a page shows
    expect(heardLine(settled)).toEqual({ state: "heard", key: { root: "A", mode: "minor" }, relative: null, chord: null });
    expect(heardLine({ ...settled, shownChord: chord(2, "min") })).toMatchObject({ state: "heard", chord: "Dm" });
    expect(heardLine({ ...settled, shownChord: chord(4, "dom7") })).toMatchObject({ chord: "E7" });
  });

  it("shows a chord by itself while the key is still open", () => {
    expect(heardLine(live({ keyState: "unsure", key: aMinor, shownChord: chord(7) }))).toEqual({
      state: "heard",
      key: null,
      relative: null,
      chord: "G",
    });
  });

  it("names both keys when the notes do not tell a key from its relative", () => {
    const line = heardLine(live({ keyState: "settled", key: { ...aMinor, relativeToo: true } }));
    expect(line).toMatchObject({ key: { root: "A", mode: "minor" }, relative: { root: "C", mode: "major" } });
  });

  it("reads in the player's transposition and marks a chart's key as the chart's", () => {
    const fromChart = live({
      keyState: "chart",
      key: { ...aMinor, confidence: 1 },
      shownChord: { root: 2, quality: null, label: "Dm7", fromChart: true },
    });
    expect(heardLine(fromChart)).toEqual({ state: "chart", key: { root: "A", mode: "minor" }, relative: null, chord: "Dm7" });
    // a B flat instrument reads a tone up
    expect(heardLine(fromChart, 2)).toMatchObject({ key: { root: "B", mode: "minor" }, chord: "Em7" });
  });
});

describe("the recap's line about free play", () => {
  const summary = (over: Partial<HeardSummary["reading"]>, chords: HeardSummary["chords"] = []): HeardSummary => ({
    reading: { keyState: "settled", key: aMinor, chord: null, settledAtS: 12, heardS: 60, ...over },
    chords,
    chordBeats: chords.reduce((n, c) => n + c.beats, 0),
    beats: 120,
  });

  it("is a settled key and the chords heard most", () => {
    expect(heardRecap(summary({}, [{ root: 9, quality: "min", beats: 40 }, { root: 5, quality: "maj", beats: 30 }]))).toEqual({
      key: { root: "A", mode: "minor" },
      relative: null,
      chords: ["Am", "F"],
    });
  });

  it("is nothing for a key that did not settle, a chart's key, or too little playing", () => {
    expect(heardRecap(null)).toBeNull();
    expect(heardRecap(summary({ keyState: "unsure" }))).toBeNull();
    expect(heardRecap(summary({ keyState: "listening", key: null }))).toBeNull();
    expect(heardRecap(summary({ keyState: "chart" }))).toBeNull();
    expect(heardRecap(summary({ heardS: RECAP_MIN_HEARD_S - 1 }))).toBeNull();
  });

  it("is only ever this Session's", () => {
    forgetHeard();
    expect(heardSince(0)).toBeNull();
    rememberHeard(summary({}), 1_000);
    expect(heardSince(500)).not.toBeNull();
    expect(heardSince(2_000)).toBeNull();
    rememberHeard(null, 3_000);
    expect(heardSince(500)).not.toBeNull();
    forgetHeard();
  });
});

describe("jamHeardLine: the line under Jam's stage after a stop (leg c5a1)", () => {
  type Q = HeardSummary["chords"][number]["quality"];
  const heardOf = (chords: [number, Q, number][], over: Partial<HeardSummary["reading"]> = {}): HeardSummary => ({
    reading: { keyState: "settled", key: aMinor, chord: null, settledAtS: 12, heardS: 60, ...over },
    chords: chords.map(([root, quality, beats]) => ({ root, quality, beats })),
    chordBeats: chords.reduce((n, c) => n + c[2], 0),
    beats: 160,
  });
  // A minor, Am F C G (concert, read in concert).
  const aMinorChart: JamHarmony = {
    key: { root: 9, mode: "minor" },
    concert: { root: 9, mode: "minor" },
    chords: [
      { root: 9, quality: "min" },
      { root: 5, quality: "maj" },
      { root: 0, quality: "maj" },
      { root: 7, quality: "maj" },
      { root: 9, quality: "min" },
    ],
  };
  const played = heardOf([
    [9, "min", 40],
    [5, "maj", 30],
    [7, "maj", 20],
  ]);

  it("says nothing without a summary, under the floor, or without a settled reading", () => {
    expect(jamHeardLine(null, aMinorChart)).toBeNull();
    expect(jamHeardLine(undefined, aMinorChart)).toBeNull();
    expect(jamHeardLine(heardOf([[9, "min", 40]], { heardS: RECAP_MIN_HEARD_S - 1 }), aMinorChart)).toBeNull();
    expect(jamHeardLine(heardOf([[9, "min", 40]], { keyState: "unsure" }), aMinorChart)).toBeNull();
    expect(jamHeardLine(heardOf([[9, "min", 40]], { keyState: "listening", key: null }), aMinorChart)).toBeNull();
  });

  it("says nothing for a jam heard with its chart: the engine named no chord of its own", () => {
    expect(jamHeardLine(heardOf([], { keyState: "chart" }), aMinorChart)).toBeNull();
    // and a settled key with no chord held (single notes only) names none either
    expect(jamHeardLine(heardOf([]), aMinorChart)).toBeNull();
  });

  it("all heard chords in the chart: the two lists, side by side, nothing more", () => {
    expect(jamHeardLine(played, aMinorChart)).toEqual([{ key: "jam.heard.stopLine", values: { heard: "Am, F, G", chart: "Am, F, C, G" } }]);
  });

  it("a chord outside the chart is listed as heard, not marked", () => {
    const outside = heardOf([
      [9, "min", 40],
      [2, "min", 25],
    ]);
    expect(jamHeardLine(outside, aMinorChart)).toEqual([{ key: "jam.heard.stopLine", values: { heard: "Am, Dm", chart: "Am, F, C, G" } }]);
  });

  it("a chord whose notes are all in a chart chord of another name says so (Am7 and C6, C and Am7)", () => {
    const sevenths: JamHarmony = {
      key: { root: 0, mode: "major" },
      concert: { root: 0, mode: "major" },
      chords: [
        { root: 9, quality: "m7" },
        { root: 0, quality: "6" },
        { root: 7, quality: "7" },
      ],
    };
    const lines = jamHeardLine(
      heardOf([
        [0, "maj", 30],
        [9, "min7", 20],
      ]),
      sevenths,
    );
    expect(lines).toEqual([
      { key: "jam.heard.stopLine", values: { heard: "C, Am7", chart: "Am7, C6, G7" } },
      // C E G is in Am7 (A C E G) and in C6 (C E G A)
      { key: "jam.heard.sameNotes", values: { heard: "C", chart: "Am7, C6" } },
    ]);
  });

  it("a transposed jam: both lists as a B flat player reads them", () => {
    // G major in concert, read a tone up: A major.
    const bb: JamHarmony = {
      key: { root: 9, mode: "major" },
      concert: { root: 7, mode: "major" },
      chords: [
        { root: 9, quality: "maj" },
        { root: 2, quality: "maj" },
        { root: 4, quality: "7" },
      ],
    };
    const concertHeard = heardOf(
      [
        [7, "maj", 30],
        [0, "maj", 20],
      ],
      { key: { key: { tonic: 7, mode: "major" }, scale: "ionian", confidence: 0.5, relativeToo: false } },
    );
    expect(jamHeardLine(concertHeard, bb)).toEqual([{ key: "jam.heard.stopLine", values: { heard: "A, D", chart: "A, D, E7" } }]);
  });

  it("spells by the jam's key: Bb in F major, never A#", () => {
    const f: JamHarmony = {
      key: { root: 5, mode: "major" },
      concert: { root: 5, mode: "major" },
      chords: [
        { root: 5, quality: "maj" },
        { root: 10, quality: "maj" },
        { root: 0, quality: "7" },
      ],
    };
    expect(jamHeardLine(heardOf([[10, "maj", 30]]), f)).toEqual([{ key: "jam.heard.stopLine", values: { heard: "Bb", chart: "F, Bb, C7" } }]);
  });
});
