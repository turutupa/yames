import { describe, expect, it } from "vitest";
import { STANDARD_TUNING } from "./format";
import { isPicked, markAlternate, markSweep, parseTab } from "./tabDsl";

const parse = (tab: string) => parseTab(tab, STANDARD_TUNING, 3840);

describe("parseTab", () => {
  it("reads strings, frets, rhythm and midi", () => {
    const { notes, totalTicks } = parse("/8 5:5 /16 6:0 /8t 1:12");
    expect(notes.map((n) => [n.string, n.fret, n.midi, n.tick, n.dur])).toEqual([
      [5, 5, 50, 0, 480],
      [6, 0, 40, 480, 240],
      [1, 12, 76, 720, 320],
    ]);
    expect(totalTicks).toBe(1040);
  });

  it("reads every suffix", () => {
    const [n] = parse("/4 3:7b2v>md").notes;
    expect(n.tech).toEqual(["bend", "vibrato", "palmMute"]);
    expect(n.bend).toBe(2);
    expect(n.accent).toBe(true);
    expect(n.pick).toBe("d");
    expect(parse("/4 3:5 3:7h").notes[1].tech).toEqual(["hammer"]);
    expect(parse("/4 3:7 3:5p").notes[1].tech).toEqual(["pull"]);
    expect(parse("/4 3:5s 3:7").notes[0].tech).toEqual(["slide"]);
  });

  it("dotted values and rests", () => {
    const { notes, rests } = parse("/4. 5:5 /8 r");
    expect(notes[0].dur).toBe(1440);
    expect(rests).toEqual([{ tick: 1440, dur: 480 }]);
  });

  it("a bar check that fails throws where it failed", () => {
    expect(() => parse("/4 5:5 |")).toThrow(/bar check failed at tick 960/);
    expect(() => parse("/1 5:5 |")).not.toThrow();
  });

  it("`rest` fills to the bar line in notatable values", () => {
    const { rests, totalTicks } = parse("/8t 5:5 rest");
    expect(totalTicks).toBe(3840);
    expect(rests.reduce((sum, r) => sum + r.dur, 0)).toBe(3840 - 320);
    expect(rests[0]).toEqual({ tick: 320, dur: 640 });
  });

  it("`hold` lengthens the last note and rests what it cannot notate", () => {
    const eighthTriplets = parse("/8t 5:5 hold");
    expect(eighthTriplets.notes[0].dur).toBe(3840);
    const late = parse("/2 5:5 /8 5:6 hold");
    expect(late.notes[1].dur).toBe(1920);
    expect(late.totalTicks).toBe(3840);
  });

  it("refuses nonsense", () => {
    expect(() => parse("/7 5:5")).toThrow(/note value/);
    expect(() => parse("9:5")).toThrow(/no string 9/);
    expect(() => parse("5:5q")).toThrow(/suffix/);
    expect(() => parse("hold")).toThrow(/no note/);
  });
});

describe("strokes", () => {
  it("alternates, skipping legato notes", () => {
    const { notes } = parse("/8 3:5 3:7 3:5h 3:7p 3:5");
    markAlternate(notes);
    expect(notes.map((n) => n.pick)).toEqual(["d", "u", undefined, undefined, "d"]);
  });

  it("a beat between onsets lets the hand reset", () => {
    const { notes } = parse("/8 3:5 3:7 3:5 /4 3:7 3:5 3:7");
    markAlternate(notes);
    expect(notes.map((n) => n.pick)).toEqual(["d", "u", "d", "u", "d", "d"]);
  });

  it("can start on an upstroke", () => {
    const { notes } = parse("/8 3:5 3:7");
    markAlternate(notes, "u");
    expect(notes.map((n) => n.pick)).toEqual(["u", "d"]);
  });

  it("sweep marks follow the strings", () => {
    const { notes } = parse("/8t 3:14 2:13 1:12 1:17h 1:12p 2:13 3:14");
    markSweep(notes);
    expect(notes.map((n) => n.pick)).toEqual(["d", "d", "d", undefined, undefined, "u", "u"]);
  });

  it("a slid-to note is not picked", () => {
    const { notes } = parse("/8 3:7s 3:9 3:7");
    expect(isPicked(notes[1], notes[0])).toBe(false);
    expect(isPicked(notes[2], notes[1])).toBe(true);
  });
});
