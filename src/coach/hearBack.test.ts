import { describe, expect, it } from "vitest";
import { hearBackLabel, hearBackOffer, hearBarOf } from "./hearBack";
import type { HearBackFacts } from "./hearBack";
import type { StripCell, TakeNote } from "./takeNote";
import { buildListenDemo, LISTEN_COUNT_IN_BARS } from "../session/listenDemo";
import { buildTake } from "../session/take";
import { ALT } from "../session/testKit";

/** A four-bar pattern played three rounds: twelve bars, the strip's cells numbered 1 to 12. */
function strip(missed: number[], spotBars: number[]): StripCell[] {
  return Array.from({ length: 12 }, (_u, i) => {
    const n = i + 1;
    const patternBar = (i % 4) + 1;
    const state = missed.includes(n) ? ("missed" as const) : ("met" as const);
    return { n, state, round: Math.floor(i / 4) + 1, patternBar, spot: state === "missed" && spotBars.includes(patternBar) };
  });
}

function note(over: {
  kind?: TakeNote["kind"];
  patternBars?: number[];
  shape?: "bar" | "bars" | "loop" | "fromRound";
  cells?: StripCell[] | null;
}): TakeNote {
  const patternBars = over.patternBars ?? [3];
  return {
    kind: over.kind ?? "result",
    place:
      patternBars.length > 0
        ? { shape: over.shape ?? "bar", patternBars, slipped: 2, of: 3, before: null, key: "x" }
        : null,
    strip:
      over.cells === null
        ? null
        : { cells: over.cells ?? strip([7, 11], patternBars), patternBars: 4, rounds: 3, held: null, label: { key: "k", values: {} } },
  } as unknown as TakeNote;
}

describe("hearBarOf: which bar (a four-bar pattern, three rounds)", () => {
  it("is the first bar of the Take where the named pattern bar slipped, as the strip numbers it", () => {
    // Pattern bar 3 slipped in rounds 2 and 3: played bars 7 and 11.
    expect(hearBarOf(note({}))).toEqual({ played: 7, pattern: 3 });
  });
  it("counts played bars, not the tune's: pattern bar 1 slipped in round 3 is bar 9", () => {
    expect(hearBarOf(note({ patternBars: [1], cells: strip([9], [1]) }))).toEqual({ played: 9, pattern: 1 });
  });
  it("takes the compared bar (the first named) of a place of two bars", () => {
    expect(hearBarOf(note({ patternBars: [3, 4], shape: "bars", cells: strip([4, 7, 8], [3, 4]) }))).toEqual({
      played: 7,
      pattern: 3,
    });
  });
  it("with no strip, the pattern bar's first round", () => {
    expect(hearBarOf(note({ cells: null }))).toEqual({ played: 3, pattern: 3 });
  });
  it("names no bar for a place in the Take's time, none, or a note that is not a result", () => {
    expect(hearBarOf(note({ shape: "fromRound" }))).toBeNull();
    expect(hearBarOf(note({ patternBars: [] }))).toBeNull();
    expect(hearBarOf(note({ kind: "ungraded" }))).toBeNull();
    expect(hearBarOf(note({ kind: "notCaught" }))).toBeNull();
    expect(hearBarOf(null)).toBeNull();
  });
});

describe("hearBackOffer: when the chip is there", () => {
  const BAR = { played: 7, pattern: 3 };
  const HELD = { held: true, bars: 12 };
  const base: HearBackFacts = { phase: "result", ungraded: false, bar: BAR, held: HELD, demo: false, loop: false };
  const cases: [string, Partial<HearBackFacts>, boolean][] = [
    ["a graded result whose note names a place, the Take held", {}, true],
    ["the bar is the last one held", { held: { held: true, bars: 7 } }, true],
    ["the engine has not answered yet", { held: null }, false],
    ["not held: input off, MIDI, a gap, an older Take", { held: { held: false, bars: 0 } }, false],
    ["held, but the Take stopped before that bar", { held: { held: true, bars: 6 } }, false],
    ["an ungraded Take", { ungraded: true }, false],
    ["the note names no place", { bar: null }, false],
    ["during a Take", { phase: "playing" }, false],
    ["during the count-in (the ready screen's Start)", { phase: "ready" }, false],
    ["while the Take is being listened to", { phase: "listening" }, false],
    ["during a loop", { phase: "looping" }, false],
    ["while a loop lets the engine go", { loop: true }, false],
    ["while the listen demo has the engine", { demo: true }, false],
    ["on the recap", { phase: "recap" }, false],
  ];
  it.each(cases)("%s", (_name, over, shown) => {
    expect(hearBackOffer({ ...base, ...over })).toEqual(shown ? base.bar : null);
  });
});

describe("hearBackLabel: the chip's words", () => {
  it("names the bar in each stage", () => {
    expect(hearBackLabel("off", 7)).toEqual({ key: "session.note.chip.hearBack", values: { bar: 7 } });
    expect(hearBackLabel("stopped", 7)).toEqual({ key: "session.note.chip.hearBack", values: { bar: 7 } });
    expect(hearBackLabel("yours", 7)).toEqual({ key: "session.note.chip.hearYours", values: { bar: 7 } });
    expect(hearBackLabel("demo", 7)).toEqual({ key: "session.note.chip.hearDemo", values: { bar: 7 } });
  });
});

describe("the demo half: the same pattern bar at the Take's tempo", () => {
  const exercise = ALT.steps.flatMap((s) => s.exercises).find((e) => e.bars >= 3) ?? ALT.steps[0].exercises[0];
  const take = buildTake(ALT, exercise, 90);
  it("plays only that bar after the count-in, and is that long", () => {
    const pattern = Math.min(3, exercise.bars);
    const demo = buildListenDemo(take, { bars: { from: pattern, to: pattern } });
    expect(demo.range).toEqual({ startBar: pattern - 1, endBar: pattern - 1 });
    const bar = demo.score.bars[pattern - 1];
    const countIn = demo.score.bars[0].lengthTicks * LISTEN_COUNT_IN_BARS;
    expect(demo.lengthMs).toBe(Math.round(((countIn + bar.lengthTicks) / demo.score.ticksPerQuarter) * (60_000 / 90)));
    expect(demo.endTick).toBe(bar.startTick + bar.lengthTicks);
  });
  it("leaves the whole-tune demo as it was", () => {
    const whole = buildListenDemo(take);
    expect(whole.range).toEqual({ startBar: 0, endBar: whole.score.bars.length - 1 });
  });
  it("keeps a bar past the tune inside it", () => {
    const demo = buildListenDemo(take, { bars: { from: 99, to: 99 } });
    expect(demo.range.startBar).toBe(demo.score.bars.length - 1);
  });
});
