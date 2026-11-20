/**
 * `cueFor`: one row per way a Take can choose the next cue (DESIGN 4.2's
 * "one thing to try" and its repeat table). The trigger comes from what the
 * note measured, never from a guess; nothing measured is the general cue or
 * nothing.
 */
import { describe, expect, it } from "vitest";
import type { Cue, Exercise, PathNote } from "../paths/format";
import { placeTriggers, possibleTriggers } from "../paths/cues";
import { cueFor, cueOrder, measuredTriggers } from "./cues";
import type { TakeNote } from "./takeNote";

const OPEN = [64, 59, 55, 50, 45, 40];
const n = (string: number, fret: number, tick: number, dur = 480): PathNote => ({
  string,
  fret,
  midi: OPEN[string - 1] + fret,
  tick,
  dur,
  tech: [],
});

/**
 * A two-bar tune that loops. Bar 1: four open Bs, then 5, 7 on the top string
 * and a held 8 (two beats). Bar 2: up at the 12th fret on the top string.
 * So bar 1 has open strings and changes of string; bar 2 follows the held
 * note, needs a shift, and is the tune's last bar.
 */
const NOTES: PathNote[] = [
  n(2, 0, 0),
  n(2, 0, 480),
  n(2, 0, 960),
  n(2, 0, 1440),
  n(1, 5, 1920),
  n(1, 7, 2400),
  n(1, 8, 2880, 960),
  ...[12, 13, 15, 13, 12, 13, 15, 13].map((fret, i) => n(1, fret, 3840 + i * 480)),
];

const CUES: Cue[] = [
  { when: "even", say: "Count every eighth out loud.", general: true },
  { when: "afterHeld", say: "Count the held 8, then come in.", more: 1 },
  { when: "afterHeld", say: "Say 'three, four' on the held 8." },
  { when: "openString", say: "Pick the open Bs as firmly as the rest." },
  { when: "late", say: "Put the first note right on the click." },
  { when: "heard", say: "Pick every note right through." },
  { when: "stringChange", say: "Look at the top string before you get there." },
  { when: "lastBars", say: "Keep counting to the very last note." },
];

function exercise(cues: Cue[] | null = CUES): Exercise {
  return {
    notes: NOTES,
    meter: { numerator: 4, denominator: 4 },
    bars: 2,
    loops: true,
    position: { fret: 5, shifts: "allowed" },
    passBars: [
      { metric: "timingEvenness", min: 0.85, overBars: 8 },
      { metric: "notesHeard", min: 0.95, overBars: 8 },
    ],
    graded: ["timingEvenness", "notesHeard"],
    ...(cues ? { cues } : {}),
  } as unknown as Exercise;
}

type NoteParts = {
  kind?: TakeNote["kind"];
  verdict?: TakeNote["verdict"];
  metric?: string;
  bars?: number[];
  shape?: "bar" | "bars" | "loop" | "fromRound";
  way?: "early" | "late";
  open?: boolean;
  repeat?: 1 | 2 | 3;
  onceMoreHere?: boolean;
};

function note(p: NoteParts): TakeNote {
  return {
    kind: p.kind ?? "result",
    verdict: p.verdict ?? "belowBar",
    deciding: p.metric ? { metric: p.metric, value: 0.7, min: 0.85, met: false } : null,
    place: p.bars ? { shape: p.shape ?? "bar", patternBars: p.bars, slipped: 2, of: 3, before: null, key: "x" } : null,
    direction: p.way
      ? { way: p.way, source: "notes", ms: 20, note: p.open ? { midi: 59, string: 2, fret: 0 } : null }
      : null,
    repeat: p.repeat ?? 1,
    onceMoreHere: p.onceMoreHere ?? false,
  } as unknown as TakeNote;
}

const at = (index: number) => CUES[index].say;

describe("what the notes have in them", () => {
  it("reads each bar of the tune", () => {
    expect(placeTriggers(exercise(), [1])).toEqual(["openString", "stringChange"]);
    expect(placeTriggers(exercise(), [2])).toEqual(["afterHeld", "shift", "lastBars"]);
    expect(placeTriggers(exercise(), [1], true)).toEqual(["openString", "stringChange", "lastBars"]);
  });

  it("an Exercise can produce what its pass marks check and its bars hold, and nothing it does not", () => {
    const can = possibleTriggers(exercise());
    expect([...can].sort()).toEqual(["afterHeld", "early", "even", "heard", "lastBars", "late", "openString", "shift", "stringChange"]);
    expect(can.has("extras")).toBe(false);
    expect(can.has("notes")).toBe(false);
  });
});

describe("cueFor", () => {
  const rows: Array<[string, TakeNote | null, string | null, "measured" | "general" | null]> = [
    ["before the first Take: the general cue", null, at(0), "general"],
    ["after an ungraded Take: the general cue", note({ kind: "ungraded", verdict: "ungraded" }), at(0), "general"],
    ["after a Take not caught: the general cue", note({ kind: "notCaught", verdict: "notCaught" }), at(0), "general"],
    ["after one stopped too short: the general cue", note({ kind: "tooShort", verdict: "tooShort" }), at(0), "general"],
    ["a pass that moves on: no cue from the old tempo's miss", note({ verdict: "passed", bars: [2], way: "late" }), at(0), "general"],
    ["uneven after the held note, first time: its first cue", note({ metric: "timingEvenness", bars: [2], way: "late" }), at(1), "measured"],
    ["the same spot a second time: the second cue", note({ metric: "timingEvenness", bars: [2], repeat: 2 }), at(2), "measured"],
    ["a third time: still the last one written", note({ metric: "timingEvenness", bars: [2], repeat: 3 }), at(2), "measured"],
    ["the open Bs landed late: the open string first", note({ metric: "timingEvenness", bars: [1], way: "late", open: true }), at(3), "measured"],
    ["notes missed decide it: said before the place", note({ metric: "notesHeard", bars: [1], way: "late" }), at(5), "measured"],
    ["no place, but a direction: late", note({ metric: "timingEvenness", way: "late" }), at(4), "measured"],
    ["no place, no direction: evenness, whose cue is the general one", note({ metric: "timingEvenness" }), at(0), "measured"],
    ["a Take that came apart from a round on: the last bars", note({ metric: "evennessHold", bars: [1, 2], shape: "fromRound" }), at(7), "measured"],
    ["P1, a pass that still caught the same bar: that bar's cue", note({ verdict: "passed", bars: [2], onceMoreHere: true }), at(1), "measured"],
    ["early, with no cue for early: the next trigger down", note({ metric: "timingEvenness", way: "early" }), at(0), "measured"],
  ];

  it.each(rows)("%s", (_name, taken, say, basis) => {
    const pick = cueFor(exercise(), taken);
    expect(pick?.cue.say ?? null).toBe(say);
    expect(pick?.basis ?? null).toBe(basis);
    if (pick) expect(exercise().cues![pick.index]).toBe(pick.cue);
  });

  it("an open string with no cue for it falls to the next thing the place has: the change of string", () => {
    const without = CUES.filter((c) => c.when !== "openString");
    const pick = cueFor(exercise(without), note({ metric: "timingEvenness", bars: [1], way: "late", open: true }));
    expect(pick?.trigger).toBe("stringChange");
  });

  it("nothing measured and no general cue: nothing, never something generic", () => {
    const noGeneral = CUES.map(({ general: _g, ...rest }) => rest);
    expect(cueFor(exercise(noGeneral), null)).toBeNull();
    expect(cueFor(exercise(noGeneral), note({ verdict: "passed" }))).toBeNull();
    expect(cueFor(exercise(noGeneral), note({ metric: "extraNotes" }))).toBeNull();
  });

  it("an Exercise with no cues has none, whatever was measured", () => {
    expect(cueFor(exercise(null), note({ metric: "timingEvenness", bars: [2] }))).toBeNull();
    expect(cueFor(exercise([]), null)).toBeNull();
  });

  it("the triggers come only from the note: a pass without P1 measured nothing to act on", () => {
    expect(measuredTriggers(exercise(), note({ verdict: "passed", bars: [2], way: "late" }))).toEqual([]);
    expect(measuredTriggers(exercise(), note({ metric: "notesHeard", bars: [2], way: "early" }))).toEqual([
      "heard",
      "afterHeld",
      "shift",
      "lastBars",
      "early",
    ]);
  });
});

describe("cueOrder", () => {
  it("is the cue's sentence, or nothing when a language made it longer than the Take's order", () => {
    expect(cueOrder({ cue: CUES[1], index: 1, trigger: "afterHeld", basis: "measured" })).toBe(at(1));
    const long = { when: "even" as const, say: "Zähle jede Achtel laut mit und bleib dabei ganz ruhig." };
    expect(cueOrder({ cue: long, index: 0, trigger: "even", basis: "general" })).toBeNull();
    expect(cueOrder(null)).toBeNull();
  });
});
