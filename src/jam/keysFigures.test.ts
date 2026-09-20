/**
 * The keys player's comping styles (`./keysFigures`).
 */
import { describe, expect, it } from "vitest";
import {
  JAM_KEYS_STYLES_ALL,
  autoKeysStyle,
  keysPartFor,
  resolveKeysStyle,
  voicingFor,
} from "./keysFigures";
import type { Chord } from "./harmony";
import { GROOVES } from "./grooves";
import type { GrooveFamily } from "./grooves";
import type { JamKeysStyle, JamPattern } from "./types";

const METERS: [number, number][] = [
  [4, 1], [4, 2], [4, 3], [4, 4], [4, 6], [3, 2], [3, 3], [6, 1], [5, 3], [7, 1],
];

function groove(beats: number, tpb: number): JamPattern {
  const n = beats * tpb;
  const lane = () => new Array(n).fill(0);
  const snare = lane();
  for (let b = 1; b < beats; b += 2) snare[b * tpb] = 2;
  return { kick: lane(), snare, hat: lane(), ride: lane(), crash: lane() } as unknown as JamPattern;
}

const G7: Chord = { root: 7, quality: "7" };
const Cmaj7: Chord = { root: 0, quality: "maj7" };
const C: Chord = { root: 0, quality: "maj" };

function part(style: JamKeysStyle, opts: Partial<Parameters<typeof keysPartFor>[0]> = {}) {
  const beats = opts.meter?.beatsPerBar ?? 4;
  const tpb = opts.meter?.ticksPerBeat ?? 4;
  return keysPartFor({
    chords: { bar: G7, next: Cmaj7 },
    groove: groove(beats, tpb),
    style,
    feel: "straight",
    meter: { beatsPerBar: beats, ticksPerBeat: tpb },
    barIndex: 0,
    formBars: 8,
    bass: true,
    ...opts,
  });
}

const hits = (line: { voicings: number[][] }) => line.voicings.flatMap((v, t) => (v.length ? [t] : []));
const pc = (n: number) => ((n % 12) + 12) % 12;

describe("every style keeps the engine's contract", () => {
  it("in every meter, family and place in the form", () => {
    const families: (GrooveFamily | null)[] = ["rock", "jazz", "latin", "pop", "metal", null];
    for (const style of JAM_KEYS_STYLES_ALL) {
      for (const [beats, tpb] of METERS) {
        for (const family of families) {
          for (const barIndex of [0, 1, 3, 7]) {
            for (const chords of [{ bar: G7, next: Cmaj7 }, { bar: C, half: G7, next: C }, { bar: { root: 4, quality: "5" } as Chord, next: C }]) {
              const where = `${style} ${beats}/${tpb} ${family} bar ${barIndex}`;
              const line = part(style, { meter: { beatsPerBar: beats, ticksPerBeat: tpb }, family, barIndex, chords });
              const n = beats * tpb;
              expect(line.voicings, where).toHaveLength(n);
              expect(line.velocities, where).toHaveLength(n);
              expect(line.lengths, where).toHaveLength(n);
              expect(hits(line).length, `${where}: nothing played`).toBeGreaterThan(0);
              line.voicings.forEach((v, t) => {
                expect(v.length, where).toBeLessThanOrEqual(4);
                for (const note of v) {
                  expect(note, where).toBeGreaterThanOrEqual(48);
                  expect(note, where).toBeLessThanOrEqual(84);
                  expect(Number.isInteger(note), where).toBe(true);
                }
                if (v.length === 0) return;
                expect(line.velocities![t], where).toBeGreaterThanOrEqual(0.3);
                expect(line.velocities![t], where).toBeLessThanOrEqual(1.4);
                expect(line.lengths![t], where).toBeGreaterThanOrEqual(0);
              });
            }
          }
        }
      }
    }
  });
});

describe("the voicing follows the style", () => {
  it("leaves the root to the bass in a jazz grip", () => {
    const line = part("charleston", { family: "jazz", bass: true });
    for (const t of hits(line)) expect(line.voicings[t].map(pc), `tick ${t}`).not.toContain(7);
  });

  it("puts the root back when there is no bass", () => {
    const line = part("charleston", { family: "jazz", bass: false });
    for (const t of hits(line)) expect(line.voicings[t].map(pc), `tick ${t}`).toContain(7);
  });

  it("puts a left-hand root under a rock triad, and no seventh on top", () => {
    const v = voicingFor(G7, "leftHand", null);
    expect(v).toHaveLength(4);
    expect(v[0]).toBeLessThanOrEqual(59);
    expect(pc(v[0])).toBe(7);
    expect(v.slice(1).map(pc).sort()).toEqual([2, 7, 11].sort());
    for (const n of v.slice(1)) expect(n).toBeGreaterThan(v[0]);
  });
});

describe("what each style plays", () => {
  it("pads hold one chord, and strike again where a second chord arrives", () => {
    expect(hits(part("pads", { barIndex: 1 }))).toEqual([0]);
    expect(hits(part("pads", { barIndex: 1, chords: { bar: C, half: G7, next: C } }))).toEqual([0, 8]);
  });

  it("pads push the next chord at the end of a phrase", () => {
    const line = part("pads", { barIndex: 3, chords: { bar: G7, next: C } });
    expect(hits(line)).toEqual([0, 14]);
  });

  it("pulse plays every beat", () => {
    expect(hits(part("pulse", { barIndex: 0 }))).toEqual([0, 4, 8, 12]);
  });

  it("arpeggio plays one note at a time", () => {
    const line = part("arpeggio");
    for (const t of hits(line)) expect(line.voicings[t]).toHaveLength(1);
    expect(hits(line).length).toBe(8);
  });

  it("charleston moves between rhythms from bar to bar", () => {
    const shapes = new Set([0, 1, 2, 3, 4, 5, 6, 7].map((b) => hits(part("charleston", { barIndex: b, meter: { beatsPerBar: 4, ticksPerBeat: 3 } })).join(",")));
    expect(shapes.size).toBeGreaterThanOrEqual(3);
  });

  it("skank sits on the backbeat, short", () => {
    const line = part("skank", { meter: { beatsPerBar: 4, ticksPerBeat: 2 } });
    expect(hits(line)).toEqual([2, 6]);
    for (const t of hits(line)) expect(line.lengths![t]).toBeLessThanOrEqual(1);
  });

  it("ska skanks on every 'and'", () => {
    const line = part("skank", { meter: { beatsPerBar: 4, ticksPerBeat: 2 }, grooveId: "worldSka" });
    expect(hits(line)).toEqual([1, 3, 5, 7]);
  });

  it("montuno is a two-bar figure", () => {
    const a = hits(part("montuno", { barIndex: 0, meter: { beatsPerBar: 4, ticksPerBeat: 2 } }));
    const b = hits(part("montuno", { barIndex: 1, meter: { beatsPerBar: 4, ticksPerBeat: 2 } }));
    expect(a).not.toEqual(b);
    expect(a).toEqual(hits(part("montuno", { barIndex: 2, meter: { beatsPerBar: 4, ticksPerBeat: 2 } })));
  });

  it("shuffle comping pushes on the last triplet of every beat", () => {
    expect(hits(part("shuffleComp", { meter: { beatsPerBar: 4, ticksPerBeat: 3 } }))).toEqual([0, 2, 3, 5, 6, 8, 9, 11]);
  });
});

describe("what auto plays", () => {
  it("names a real style for every groove the app ships", () => {
    for (const g of GROOVES) {
      expect(JAM_KEYS_STYLES_ALL, g.id).toContain(autoKeysStyle(g.id, g.family));
    }
  });

  it("never plays a montuno over a bossa, and never bossa comping over a salsa groove", () => {
    for (const id of ["bossa", "latinBossa23", "samba"]) expect(autoKeysStyle(id, "latin")).toBe("bossaComp");
    for (const id of ["mambo", "latinSon", "chaCha"]) expect(autoKeysStyle(id, "latin")).toBe("montuno");
  });

  it.each([
    ["rock8", "rock", "pulse"],
    ["shuffle", "blues", "shuffleComp"],
    ["swingRide", "jazz", "charleston"],
    ["oneDrop", "world", "skank"],
    ["funk", "funk", "stabs"],
    ["ballad", "pop", "arpeggio"],
    ["doubleKick", "metal", "pads"],
  ] as const)("%s plays %s", (id, family, style) => {
    expect(autoKeysStyle(id, family)).toBe(style);
  });

  it("honours pads and stabs from records saved before auto existed", () => {
    expect(resolveKeysStyle("pads", "rock8", "rock")).toBe("pads");
    expect(resolveKeysStyle("stabs", "rock8", "rock")).toBe("stabs");
    expect(resolveKeysStyle(undefined, "rock8", "rock")).toBe("pulse");
  });
});
