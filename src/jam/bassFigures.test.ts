/**
 * The bass player's figures (`./bassFigures`).
 *
 * The contract the engine holds every line to — lengths, range, per-note
 * arrays — for every figure in every meter a groove ships in, and then the
 * musical claims each figure's comment makes.
 */
import { describe, expect, it } from "vitest";
import {
  JAM_BASS_BUSY,
  JAM_BASS_STYLES,
  autoBassFigure,
  bassPartFor,
  resolveBassFigure,
} from "./bassFigures";
import type { BassChord } from "./bassline";
import { GROOVES } from "./grooves";
import type { JamBassStyle, JamPattern } from "./types";

const METERS: [number, number][] = [
  [4, 1], [4, 2], [4, 3], [4, 4], [4, 6], [3, 2], [3, 3], [6, 1], [5, 3], [7, 1], [2, 2],
];

function groove(beats: number, tpb: number): JamPattern {
  const n = beats * tpb;
  const lane = () => new Array(n).fill(0);
  const kick = lane();
  kick[0] = 3;
  if (beats >= 3) kick[Math.floor(beats / 2) * tpb] = 2;
  if (tpb >= 2) kick[tpb + 1] = 2;
  return { kick, snare: lane(), hat: lane(), hatOpen: lane(), ride: lane(), crash: lane(), tomHi: lane(), tomLo: lane() } as unknown as JamPattern;
}

const A7: BassChord = { rootMidi: 45, quality: "7" };
const D7: BassChord = { rootMidi: 38, quality: "7" };
const C5: BassChord = { rootMidi: 36, quality: "5" };

function part(figure: JamBassStyle, opts: Partial<Parameters<typeof bassPartFor>[0]> = {}) {
  const [beats, tpb] = [opts.beatsPerBar ?? 4, opts.ticksPerBeat ?? 4];
  return bassPartFor({
    groove: groove(beats, tpb),
    feel: "straight",
    chords: { bar: A7, next: D7 },
    beatsPerBar: beats,
    ticksPerBeat: tpb,
    figure,
    barIndex: 1,
    formBars: 12,
    keyRoot: 9,
    ...opts,
  });
}

const struck = (line: { pitches: number[] }) => line.pitches.flatMap((p, t) => (p ? [t] : []));

describe("every figure keeps the engine's contract", () => {
  it("in every meter, busyness, feel and place in the form", () => {
    for (const figure of JAM_BASS_STYLES) {
      for (const [beats, tpb] of METERS) {
        for (const busy of JAM_BASS_BUSY) {
          for (const feel of ["straight", "shuffle", "swing"] as const) {
            for (const barIndex of [0, 1, 3, 11]) {
              for (const chords of [{ bar: A7, next: D7 }, { bar: A7, half: D7, next: A7 }, { bar: C5, next: C5 }]) {
                const where = `${figure} ${beats}/${tpb} ${busy} ${feel} bar ${barIndex}`;
                const line = part(figure, { beatsPerBar: beats, ticksPerBeat: tpb, busy, feel, barIndex, chords });
                const n = beats * tpb;
                expect(line.pitches, where).toHaveLength(n);
                expect(line.velocities, where).toHaveLength(n);
                expect(line.lengths, where).toHaveLength(n);
                expect(struck(line).length, `${where}: a bar with no bass`).toBeGreaterThan(0);
                line.pitches.forEach((p, t) => {
                  if (p === 0) return;
                  expect(p, where).toBeGreaterThanOrEqual(28);
                  expect(p, where).toBeLessThanOrEqual(55);
                  expect(Number.isInteger(p), where).toBe(true);
                  const v = line.velocities![t];
                  expect(v, where).toBeGreaterThanOrEqual(0.3);
                  expect(v, where).toBeLessThanOrEqual(1.4);
                  expect(Number.isFinite(line.lengths![t]), where).toBe(true);
                  expect(line.lengths![t], where).toBeGreaterThanOrEqual(0);
                });
              }
            }
          }
        }
      }
    }
  });

  it("is the same line every time for the same bar", () => {
    for (const figure of JAM_BASS_STYLES) {
      expect(part(figure, { busy: "busy" }), figure).toEqual(part(figure, { busy: "busy" }));
    }
  });
});

describe("what each figure is", () => {
  it("tumbao leaves the one empty and anticipates on four", () => {
    const line = part("tumbao", { ticksPerBeat: 4, barIndex: 5 });
    expect(line.pitches[0]).toBe(0);
    expect(line.pitches[6]).toBeGreaterThan(0); // the "and" of two
    expect(line.pitches[12] % 12).toBe(38 % 12); // four: the NEXT chord's root
  });

  it("reggae leaves the one empty and lands hardest with the drop on three", () => {
    const line = part("reggae", { ticksPerBeat: 2 });
    expect(line.pitches[0]).toBe(0);
    const three = line.velocities![4];
    for (const t of struck(line)) expect(line.velocities![t]).toBeLessThanOrEqual(three);
  });

  it("walks four notes a bar and steps onto the next root by a semitone", () => {
    const line = part("walking", { ticksPerBeat: 3, feel: "swing", barIndex: 1 });
    const beats = [0, 3, 6, 9].map((t) => line.pitches[t]);
    expect(beats.every((p) => p > 0)).toBe(true);
    const last = beats[3];
    const target = [26, 38, 50].reduce((a, b) => (Math.abs(b - last) < Math.abs(a - last) ? b : a));
    expect(Math.abs(last - target)).toBe(1);
  });

  it("walks differently on neighbouring bars", () => {
    const a = part("walking", { ticksPerBeat: 3, barIndex: 0, chords: { bar: A7, next: A7 } });
    const b = part("walking", { ticksPerBeat: 3, barIndex: 1, chords: { bar: A7, next: A7 } });
    expect(a.pitches).not.toEqual(b.pitches);
  });

  it("plays funk and reggae short, and a ballad long", () => {
    for (const figure of ["funk", "reggae", "gallop", "octaves"] as const) {
      const line = part(figure, { ticksPerBeat: 4, voice: "synth" });
      for (const t of struck(line)) expect(line.lengths![t], `${figure} tick ${t}`).toBeGreaterThan(0);
    }
    const ballad = part("ballad", { ticksPerBeat: 4 });
    expect(ballad.lengths![0]).toBeGreaterThanOrEqual(8);
  });

  it("lets the voice decide how long a legato note rings", () => {
    const picked = part("walking", { ticksPerBeat: 4, voice: "picked" });
    const upright = part("walking", { ticksPerBeat: 4, voice: "upright" });
    expect(picked.lengths![0]).toBe(2);
    expect(upright.lengths![0]).toBe(8);
    expect(part("walking", { ticksPerBeat: 4, voice: "synth" }).lengths![0]).toBe(0);
  });

  it("plays fewer notes sparse and more busy", () => {
    for (const figure of ["kick", "eighths", "rootFifth", "boogie", "pedal", "gallop", "reggae"] as const) {
      const count = (busy: "sparse" | "normal" | "busy") =>
        struck(part(figure, { ticksPerBeat: 4, busy, barIndex: 1 })).length;
      expect(count("sparse"), figure).toBeLessThanOrEqual(count("normal"));
      expect(count("normal"), figure).toBeLessThanOrEqual(count("busy"));
    }
  });

  it("fills into the next phrase on its fourth bar", () => {
    const plain = part("kick", { barIndex: 1, chords: { bar: A7, next: A7 } });
    const turn = part("kick", { barIndex: 3, chords: { bar: A7, next: A7 } });
    expect(turn.pitches).not.toEqual(plain.pitches);
  });

  it("repeats the same bar under a vamp between phrase ends", () => {
    const a = part("kick", { barIndex: 0, chords: { bar: A7, next: A7 } });
    const b = part("kick", { barIndex: 1, chords: { bar: A7, next: A7 } });
    expect(a).toEqual(b);
  });

  it("follows a chord that arrives in the middle of the bar", () => {
    const line = part("rootFifth", { ticksPerBeat: 2, chords: { bar: A7, half: D7, next: A7 } });
    expect(line.pitches[4] % 12).toBe(38 % 12);
  });

  it("plays no third over a power chord in the figures that do not walk", () => {
    for (const figure of ["kick", "eighths", "rootFifth", "octaves", "gallop", "pedal", "reggae", "funk"] as const) {
      for (const busy of JAM_BASS_BUSY) {
        const line = part(figure, { busy, chords: { bar: C5, next: C5 }, keyRoot: 0, barIndex: 1 });
        for (const p of line.pitches) {
          if (p === 0) continue;
          expect([3, 4], `${figure} ${busy} played ${p}`).not.toContain(((p % 12) + 12) % 12);
        }
      }
    }
  });
});

describe("what auto plays", () => {
  it("names a real figure for every groove the app ships", () => {
    expect(GROOVES.length).toBeGreaterThan(100);
    for (const { id } of GROOVES) {
      expect(JAM_BASS_STYLES, id).toContain(autoBassFigure(id));
    }
  });

  it.each([
    ["rock8", "kick"],
    ["shuffle", "boogie"],
    ["swingRide", "walking"],
    ["bossa", "bossa"],
    ["mambo", "tumbao"],
    ["oneDrop", "reggae"],
    ["metalGallop", "gallop"],
    ["popDisco", "octaves"],
    ["countryBoomChick", "countryAlt"],
    ["jazzBallad", "twoFeel"],
    ["funk", "funk"],
  ] as const)("%s plays %s", (groove, figure) => {
    expect(autoBassFigure(groove)).toBe(figure);
  });

  it("honours a choice, and ignores one it does not know", () => {
    expect(resolveBassFigure("walking", "rock8")).toBe("walking");
    expect(resolveBassFigure("auto", "rock8")).toBe("kick");
    expect(resolveBassFigure("nonsense" as JamBassStyle, "rock8")).toBe("kick");
    expect(resolveBassFigure(undefined, null)).toBe("kick");
  });
});
