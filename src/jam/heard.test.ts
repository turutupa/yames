import { describe, expect, it } from "vitest";
import type { HeardLive, HeardSummary } from "../ipc";
import { forgetHeard, heardLine, heardRecap, heardSince, rememberHeard, RECAP_MIN_HEARD_S } from "./heard";

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
