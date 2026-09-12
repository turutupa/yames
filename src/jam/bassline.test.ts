import { describe, expect, it } from "vitest";
import {
  approachNote,
  bassLineFor,
  bassRoot,
  bassStyleForGroove,
  BASS_MAX_MIDI,
  BASS_MIN_MIDI,
  BASS_STYLE_FOR_GROOVE,
  chordFifth,
  chordThird,
  chordTones,
  nearestInRange,
  toBassRange,
  type BassChord,
  type BassLineInput,
  type BassStyle,
} from "./bassline";
import type { JamFeel, JamLevel, JamPattern } from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const A = 45; // A2, a bar of A7 in a blues
const D = 50; // D3
const E = 52; // E3

const A7: BassChord = { rootMidi: A, quality: "7" };
const D7: BassChord = { rootMidi: D, quality: "7" };
const E7: BassChord = { rootMidi: E, quality: "7" };

/** An empty bar of the right width; lanes are filled in per test. */
function emptyPattern(ticks: number): JamPattern {
  const lane = () => new Array<JamLevel>(ticks).fill(0);
  return { kick: lane(), snare: lane(), hat: lane(), ride: lane(), crash: lane() };
}

/** A pattern with the kick on the listed ticks. */
function kickOn(ticks: number, on: number[]): JamPattern {
  const p = emptyPattern(ticks);
  for (const t of on) p.kick[t] = 1;
  return p;
}

function line(over: Partial<BassLineInput> = {}): number[] {
  const beatsPerBar = over.beatsPerBar ?? 4;
  const ticksPerBeat = over.ticksPerBeat ?? 4;
  return bassLineFor({
    groove: over.groove ?? emptyPattern(beatsPerBar * ticksPerBeat),
    feel: over.feel ?? "straight",
    chords: over.chords ?? { bar: A7, next: A7 },
    beatsPerBar,
    ticksPerBeat,
    style: over.style ?? "rock",
    barIndex: over.barIndex,
  }).pitches;
}

/** The non-zero pitches, in the order they are played. */
const played = (pitches: number[]) => pitches.filter((p) => p !== 0);

/** Note names, so a failure reads like music instead of like MIDI. */
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const nameOf = (midi: number) => NAMES[((midi % 12) + 12) % 12];

const ALL_STYLES: BassStyle[] = [
  "rock",
  "shuffle",
  "swing",
  "bossa",
  "waltz",
  "sixeight",
  "funk",
];

// ---------------------------------------------------------------------------

describe("the bass range", () => {
  it("keeps a root down where a bass player puts it", () => {
    // E1 is the bottom of the instrument; a root never sits above D#2, which
    // is what leaves room for the octave above it.
    for (let midi = 0; midi < 128; midi += 1) {
      const root = bassRoot(midi);
      expect(root).toBeGreaterThanOrEqual(BASS_MIN_MIDI);
      expect(root).toBeLessThanOrEqual(39);
      expect(nameOf(root)).toBe(nameOf(midi));
    }
  });

  it("folds anything else into E1-G3 without changing the note", () => {
    for (let midi = -24; midi < 128; midi += 1) {
      const folded = toBassRange(midi);
      expect(folded).toBeGreaterThanOrEqual(BASS_MIN_MIDI);
      expect(folded).toBeLessThanOrEqual(BASS_MAX_MIDI);
      expect(nameOf(folded)).toBe(nameOf(midi));
    }
  });

  it("picks the octave nearest the note before it, lower on a tie", () => {
    // A low G asked for next to a note up at E3 comes back as the G above it.
    expect(nearestInRange(31, 40)).toBe(43);
    // The same G next to a low B stays where it is.
    expect(nearestInRange(31, 35)).toBe(31);
    // A tie resolves downward, so the line never drifts upward by accident.
    expect(nearestInRange(55, 49)).toBe(43);
  });
});

describe("chord tones", () => {
  it("names the third and the fifth for every quality", () => {
    expect(chordThird({ rootMidi: A, quality: "7" })).toBe(4);
    expect(chordThird({ rootMidi: A, quality: "m7" })).toBe(3);
    expect(chordFifth({ rootMidi: A, quality: "m7b5" })).toBe(6);
    expect(chordFifth({ rootMidi: A, quality: "maj7" })).toBe(7);
  });

  it("returns intervals from the root, lowest first", () => {
    expect(chordTones({ rootMidi: A, quality: "7" })).toEqual([0, 4, 7, 10]);
    expect(chordTones({ rootMidi: A, quality: "dim7" })).toEqual([0, 3, 6, 9]);
    expect(chordTones({ rootMidi: A, quality: "9" })).toEqual([0, 4, 7, 10, 14]);
  });
});

describe("the groove decides the style", () => {
  it("maps the grooves the plan names", () => {
    expect(BASS_STYLE_FOR_GROOVE["rock-8ths"]).toBe("rock");
    expect(BASS_STYLE_FOR_GROOVE["rock-16ths"]).toBe("rock");
    expect(BASS_STYLE_FOR_GROOVE["half-time"]).toBe("rock");
    expect(BASS_STYLE_FOR_GROOVE.shuffle).toBe("shuffle");
    expect(BASS_STYLE_FOR_GROOVE.swing).toBe("swing");
    expect(BASS_STYLE_FOR_GROOVE.bossa).toBe("bossa");
    expect(BASS_STYLE_FOR_GROOVE.waltz).toBe("waltz");
    expect(BASS_STYLE_FOR_GROOVE["six-eight"]).toBe("sixeight");
    expect(BASS_STYLE_FOR_GROOVE.funk).toBe("funk");
  });

  it("does not care how the id is spelled", () => {
    // grooves.ts is another worker's file; the integrator should not have to
    // rename anything for the bass to find its style.
    for (const id of ["rock8ths", "rock_8ths", "ROCK-8THS", "Rock 8ths"]) {
      expect(bassStyleForGroove(id)).toBe("rock");
    }
    expect(bassStyleForGroove("sixEight")).toBe("sixeight");
  });

  it("falls back to roots on the kick for a groove it has never seen", () => {
    expect(bassStyleForGroove("reggae-one-drop")).toBe("rock");
  });
});

describe("every style", () => {
  it("fills exactly one bar of the tick grid", () => {
    for (const style of ALL_STYLES) {
      for (const beatsPerBar of [2, 3, 4, 5, 6, 7]) {
        for (const ticksPerBeat of [1, 2, 3, 4, 6] as const) {
          const pitches = line({ style, beatsPerBar, ticksPerBeat });
          expect({ style, beatsPerBar, ticksPerBeat, length: pitches.length }).toEqual({
            style,
            beatsPerBar,
            ticksPerBeat,
            length: beatsPerBar * ticksPerBeat,
          });
        }
      }
    }
  });

  it("stays inside E1-G3, whatever the chord and whatever the octave", () => {
    const qualities = ["7", "maj7", "m7", "maj", "min", "m7b5", "dim7", "6", "m6", "9"] as const;
    for (const style of ALL_STYLES) {
      for (const quality of qualities) {
        for (let rootMidi = 12; rootMidi <= 96; rootMidi += 1) {
          const pitches = line({
            style,
            chords: { bar: { rootMidi, quality }, next: { rootMidi: rootMidi + 5, quality } },
            groove: kickOn(16, [0, 3, 6, 10, 14]),
          });
          for (const p of played(pitches)) {
            expect(p).toBeGreaterThanOrEqual(BASS_MIN_MIDI);
            expect(p).toBeLessThanOrEqual(BASS_MAX_MIDI);
          }
        }
      }
    }
  });

  it("is deterministic - the same bar twice is the same line", () => {
    for (const style of ALL_STYLES) {
      const args: Partial<BassLineInput> = {
        style,
        groove: kickOn(16, [0, 6, 10]),
        chords: { bar: A7, next: D7 },
        barIndex: 3,
      };
      expect(line(args)).toEqual(line(args));
    }
  });

  it("plays a rest as 0 and never a negative pitch", () => {
    for (const style of ALL_STYLES) {
      for (const p of line({ style })) expect(p).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives the bass unit gain - loudness is the mix's job", () => {
    const out = bassLineFor({
      groove: emptyPattern(16),
      feel: "straight",
      chords: { bar: A7 },
      beatsPerBar: 4,
      ticksPerBeat: 4,
      style: "swing",
    });
    expect(out.gain).toBe(1.0);
  });

  it("never lands on the triplet shuffle and swing leave silent", () => {
    // The middle tick of a triplet is the one the feel swallows. The bass has
    // no business being the only voice on it.
    for (const feel of ["shuffle", "swing"] as JamFeel[]) {
      for (const style of ALL_STYLES) {
        const pitches = line({
          style,
          feel,
          ticksPerBeat: 3,
          beatsPerBar: 4,
          // An empty kick, so nothing the drums play can excuse a note there.
          groove: emptyPattern(12),
          chords: { bar: A7, next: D7 },
        });
        const onSwallowedTicks = pitches.filter((_p, t) => t % 3 === 1);
        expect({ style, feel, onSwallowedTicks }).toEqual({
          style,
          feel,
          onSwallowedTicks: [0, 0, 0, 0],
        });
      }
    }
  });
});

describe("rock", () => {
  it("plays a root wherever the kick lane is non-zero", () => {
    const on = [0, 6, 8, 14];
    const pitches = line({ style: "rock", groove: kickOn(16, on), chords: { bar: A7, next: A7 } });
    for (const t of on) {
      expect({ t, name: nameOf(pitches[t]) }).toEqual({ t, name: "A" });
      expect(pitches[t]).toBe(bassRoot(A));
    }
  });

  it("rests everywhere the kick does not play", () => {
    const on = [0, 6, 10];
    const pitches = line({ style: "rock", groove: kickOn(16, on), chords: { bar: A7, next: A7 } });
    for (let t = 0; t < 16; t += 1) {
      if (!on.includes(t)) expect({ t, pitch: pitches[t] }).toEqual({ t, pitch: 0 });
    }
  });

  it("leads into a chord change on the and of the last beat", () => {
    // 16ths: the "and" of beat 4 is tick 14.
    const pitches = line({
      style: "rock",
      groove: kickOn(16, [0, 6]),
      chords: { bar: A7, next: D7 },
    });
    expect(pitches[14]).not.toBe(0);
    // The fifth of A (E) or the octave (A) - both chord tones, nothing else.
    expect(["E", "A"]).toContain(nameOf(pitches[14]));
  });

  it("stays put when the next bar is the same chord", () => {
    const pitches = line({
      style: "rock",
      groove: kickOn(16, [0, 6]),
      chords: { bar: A7, next: A7 },
    });
    expect(pitches[14]).toBe(0);
  });

  it("never shoves the lead-in on top of a kick", () => {
    // The kick owns tick 14; a root on the kick is the rule this style is
    // named for, so the lead-in gives way.
    const pitches = line({
      style: "rock",
      groove: kickOn(16, [0, 14]),
      chords: { bar: A7, next: D7 },
    });
    expect(pitches[14]).toBe(bassRoot(A));
  });
});

describe("shuffle", () => {
  it("walks A C# E F# up an A7 bar - the classic blues figure", () => {
    const pitches = line({
      style: "shuffle",
      feel: "shuffle",
      ticksPerBeat: 3,
      beatsPerBar: 4,
      chords: { bar: A7 },
      barIndex: 0,
    });
    expect(played(pitches).map(nameOf)).toEqual(["A", "C#", "E", "F#"]);
  });

  it("puts one note on each beat and nothing between them", () => {
    const pitches = line({
      style: "shuffle",
      feel: "shuffle",
      ticksPerBeat: 3,
      beatsPerBar: 4,
      chords: { bar: A7 },
    });
    for (let t = 0; t < pitches.length; t += 1) {
      if (t % 3 !== 0) expect({ t, pitch: pitches[t] }).toEqual({ t, pitch: 0 });
      else expect(pitches[t]).not.toBe(0);
    }
  });

  it("comes back down through the flat seven on the second bar of the phrase", () => {
    const pitches = line({
      style: "shuffle",
      feel: "shuffle",
      ticksPerBeat: 3,
      beatsPerBar: 4,
      chords: { bar: A7 },
      barIndex: 1,
    });
    expect(played(pitches).map(nameOf)).toEqual(["G", "F#", "E", "C#"]);
  });

  it("flattens the third on a minor chord", () => {
    const pitches = line({
      style: "shuffle",
      ticksPerBeat: 4,
      beatsPerBar: 4,
      chords: { bar: { rootMidi: A, quality: "m7" } },
    });
    expect(played(pitches).map(nameOf)).toEqual(["A", "C", "E", "F#"]);
  });

  it("keeps walking in an odd meter instead of stopping", () => {
    const pitches = line({
      style: "shuffle",
      ticksPerBeat: 2,
      beatsPerBar: 7,
      chords: { bar: A7 },
    });
    expect(played(pitches)).toHaveLength(7);
  });
});

describe("swing - the walking line", () => {
  it("puts the root on 1 and the chord's own tones in between", () => {
    const pitches = line({ style: "swing", ticksPerBeat: 4, chords: { bar: A7, next: D7 } });
    const notes = played(pitches).map(nameOf);
    expect(notes[0]).toBe("A");
    expect(notes[1]).toBe("C#"); // the third
    expect(notes[2]).toBe("E"); // the fifth
    expect(notes).toHaveLength(4);
  });

  it("plays quarter notes - one per beat, on the beat", () => {
    const pitches = line({ style: "swing", ticksPerBeat: 4, chords: { bar: A7, next: D7 } });
    for (let t = 0; t < 16; t += 1) {
      if (t % 4 !== 0) expect({ t, pitch: pitches[t] }).toEqual({ t, pitch: 0 });
      else expect(pitches[t]).not.toBe(0);
    }
  });

  it("ends every bar a semitone or a step from the next bar's root", () => {
    // The fact the brief asks for, checked across the whole cycle of roots and
    // every quality, so no combination sneaks out of the rule.
    const qualities = ["7", "maj7", "m7", "maj", "min", "m7b5", "dim7", "6", "m6", "9"] as const;
    const offenders: { quality: string; root: number; move: number; gap: number }[] = [];
    for (const quality of qualities) {
      for (let root = 24; root <= 72; root += 1) {
        for (let move = 0; move < 12; move += 1) {
          const next: BassChord = { rootMidi: root + move, quality };
          const pitches = line({
            style: "swing",
            ticksPerBeat: 4,
            chords: { bar: { rootMidi: root, quality }, next },
          });
          const notes = played(pitches);
          const last = notes[notes.length - 1];
          const target = bassRoot(next.rootMidi);
          // Distance to the nearest octave of the next root.
          const gap = Math.min(...[-24, -12, 0, 12, 24].map((o) => Math.abs(last - (target + o))));
          if (gap !== 1 && gap !== 2) offenders.push({ quality, root, move, gap });
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("approaches from below when the line is climbing and from above when it falls", () => {
    // Coming up from the fifth of A (E) into D: a semitone below D.
    expect(nameOf(approachNote(nearestInRange(52, 33), D7))).toBe("C#");
    // Coming down from high G into D: a semitone above.
    expect(nameOf(approachNote(55, { rootMidi: D, quality: "7" }))).toBe("D#");
  });

  it("steps rather than leaping - no interval over an octave inside a bar", () => {
    for (let root = 24; root <= 72; root += 1) {
      const pitches = played(
        line({
          style: "swing",
          ticksPerBeat: 4,
          chords: { bar: { rootMidi: root, quality: "maj7" }, next: { rootMidi: root + 7, quality: "7" } },
        }),
      );
      for (let i = 1; i < pitches.length; i += 1) {
        expect(Math.abs(pitches[i] - pitches[i - 1])).toBeLessThanOrEqual(12);
      }
    }
  });
});

describe("bossa", () => {
  it("plays root, fifth on the and of 2, root, fifth on the and of 4", () => {
    const pitches = line({ style: "bossa", ticksPerBeat: 4, beatsPerBar: 4, chords: { bar: D7 } });
    const root = bassRoot(D);
    expect(pitches[0]).toBe(root); // 1
    expect(pitches[6]).toBe(toBassRange(root + 7)); // the and of 2
    expect(pitches[8]).toBe(root); // 3
    expect(pitches[14]).toBe(toBassRange(root + 7)); // the and of 4
    expect(played(pitches)).toHaveLength(4);
  });

  it("falls back to plain root-fifth when the grid has no and to push to", () => {
    const pitches = line({ style: "bossa", ticksPerBeat: 1, beatsPerBar: 4, chords: { bar: D7 } });
    expect(played(pitches).map(nameOf)).toEqual(["D", "A", "D", "A"]);
  });

  it("uses the flat fifth of a half-diminished chord", () => {
    const pitches = line({
      style: "bossa",
      ticksPerBeat: 4,
      chords: { bar: { rootMidi: D, quality: "m7b5" } },
    });
    expect(nameOf(pitches[6])).toBe("G#");
  });
});

describe("waltz and 6/8", () => {
  it("puts the root on 1 and the fifth on beat 2 of a waltz", () => {
    const pitches = line({ style: "waltz", ticksPerBeat: 1, beatsPerBar: 3, chords: { bar: E7 } });
    expect(played(pitches).map(nameOf)).toEqual(["E", "B"]);
    expect(pitches[0]).not.toBe(0);
    expect(pitches[1]).not.toBe(0);
    expect(pitches[2]).toBe(0);
  });

  it("puts the fifth on the head of the second group in 6/8", () => {
    // Two dotted-quarter beats of three ticks each: the second group is tick 3.
    const pitches = line({
      style: "sixeight",
      ticksPerBeat: 3,
      beatsPerBar: 2,
      chords: { bar: E7 },
    });
    expect(pitches[0]).toBe(bassRoot(E));
    expect(pitches[3]).toBe(toBassRange(bassRoot(E) + 7));
    expect(played(pitches)).toHaveLength(2);
  });
});

describe("funk", () => {
  it("puts the root on the one whatever the drummer does", () => {
    const pitches = line({ style: "funk", groove: kickOn(16, [6, 10]), chords: { bar: E7 } });
    expect(pitches[0]).toBe(bassRoot(E));
  });

  it("pops the octave where the kick lands off the beat", () => {
    const pitches = line({ style: "funk", groove: kickOn(16, [3, 6, 11]), chords: { bar: E7 } });
    const octave = toBassRange(bassRoot(E) + 12);
    expect(pitches[3]).toBe(octave);
    expect(pitches[6]).toBe(octave);
    expect(pitches[11]).toBe(octave);
  });

  it("plays the root where the kick lands on a beat", () => {
    const pitches = line({ style: "funk", groove: kickOn(16, [8]), chords: { bar: E7 } });
    expect(pitches[8]).toBe(bassRoot(E));
  });

  it("rests everywhere the kick is silent - the space is the style", () => {
    const on = [0, 3, 10];
    const pitches = line({ style: "funk", groove: kickOn(16, on), chords: { bar: E7 } });
    for (let t = 0; t < 16; t += 1) {
      if (!on.includes(t)) expect({ t, pitch: pitches[t] }).toEqual({ t, pitch: 0 });
    }
  });

  it("keeps the octave pop inside the range", () => {
    for (let root = 24; root <= 96; root += 1) {
      const pitches = line({
        style: "funk",
        groove: kickOn(16, [3, 7, 11]),
        chords: { bar: { rootMidi: root, quality: "m7" } },
      });
      for (const p of played(pitches)) expect(p).toBeLessThanOrEqual(BASS_MAX_MIDI);
    }
  });
});
