/**
 * Jam — harmony as data.
 *
 * Keys, chord symbols and the chord progression of every form the jam screen
 * offers. Everything here is pure and deterministic: the same key and form
 * always produce the same chords, in the same order, with the same spelling.
 * The model is never involved — this is theory as a table, in the spirit of
 * plans/JAM_MODE.md §3.2 ("the model is never in the music") and
 * LEARNING_PATHS_DECISIONS.md D0.5 (theory inside the activity, from
 * deterministic data).
 *
 * Two conventions run through the file and are worth knowing before reading
 * any table:
 *
 * 1. **Pitch classes, not letters.** A pitch class is 0..11 with C = 0. A
 *    note's *name* is a rendering decision made once per key by
 *    `spellingForKey`, never carried around in the data.
 * 2. **Roman numerals are always measured from the major scale, with every
 *    accidental written.** `III` is four semitones above the key root in
 *    every mode; the minor third is spelled `bIII`. This removes the classic
 *    minor-key ambiguity (does `III` in C minor mean E or Eb?) at the cost of
 *    a few extra flats in the tables, which is the right trade for a table
 *    two people have to read.
 */

import type { JamFormKind } from "./types";
import type { InstrumentId } from "../types";

// ---------------------------------------------------------------------------
// Pitch classes and names
// ---------------------------------------------------------------------------

/**
 * 0..11, C = 0. Kept as `number` rather than a union of twelve literals so
 * that ordinary arithmetic (`root + 7`) type-checks; pass results through
 * `pitchClass` to wrap them back into range.
 */
export type PitchClass = number;

/** How accidentals are written. One choice per key, see `spellingForKey`. */
export type Spelling = "sharp" | "flat";

export const SHARP_NAMES: readonly string[] = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export const FLAT_NAMES: readonly string[] = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

/** Wraps any integer into 0..11, negatives included. */
export function pitchClass(value: number): PitchClass {
  return ((Math.round(value) % 12) + 12) % 12;
}

/** The pitch class of a MIDI note number. */
export function pitchClassOf(midi: number): PitchClass {
  return pitchClass(midi);
}

/** "C", "F#", "Bb" — the name of a pitch class under a spelling. */
export function noteName(pc: PitchClass, spelling: Spelling): string {
  const names = spelling === "flat" ? FLAT_NAMES : SHARP_NAMES;
  return names[pitchClass(pc)];
}

/**
 * "A4", "Bb3", "E2". MIDI 60 is C4 and MIDI 69 is A4 = 440 Hz — the
 * scientific pitch convention every DAW and tuner on the owner's desk uses.
 */
export function midiToName(midi: number, spelling: Spelling): string {
  const rounded = Math.round(midi);
  const octave = Math.floor(rounded / 12) - 1;
  return `${noteName(pitchClassOf(rounded), spelling)}${octave}`;
}

const LETTER_PITCH_CLASSES: Record<string, number> = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11,
};

/**
 * "Bb3" → 58, "F#2" → 42. Accepts either spelling and any number of
 * accidentals; returns null for anything that is not a note name, so a value
 * read back out of a saved record can be checked rather than trusted.
 */
export function nameToMidi(name: string): number | null {
  const match = /^\s*([A-Ga-g])([#b]*)(-?\d+)\s*$/.exec(name);
  if (!match) return null;
  const [, letter, accidentals, octaveText] = match;
  const base = LETTER_PITCH_CLASSES[letter.toLowerCase()];
  let offset = 0;
  for (const accidental of accidentals) offset += accidental === "#" ? 1 : -1;
  const octave = Number.parseInt(octaveText, 10);
  const midi = (octave + 1) * 12 + base + offset;
  if (!Number.isFinite(midi)) return null;
  return midi;
}

/** "Bb" → 10, "F#" → 6. Null when the text is not a note name. */
export function nameToPitchClass(name: string): PitchClass | null {
  const match = /^\s*([A-Ga-g])([#b]*)\s*$/.exec(name);
  if (!match) return null;
  const [, letter, accidentals] = match;
  let value = LETTER_PITCH_CLASSES[letter.toLowerCase()];
  for (const accidental of accidentals) value += accidental === "#" ? 1 : -1;
  return pitchClass(value);
}

// ---------------------------------------------------------------------------
// Keys and the spelling policy
// ---------------------------------------------------------------------------

export type KeyMode = "blues" | "major" | "minor";

export type Key = { root: PitchClass; mode: KeyMode };

/**
 * Accidentals in the key signature of each major key: positive is sharps,
 * negative is flats. F# and Gb both have six; the tie is broken towards F#,
 * which is what a guitarist writes.
 */
const MAJOR_KEY_SIGNATURE: Record<number, number> = {
  0: 0, // C
  7: 1, // G
  2: 2, // D
  9: 3, // A
  4: 4, // E
  11: 5, // B
  6: 6, // F#
  1: -5, // Db
  8: -4, // Ab
  3: -3, // Eb
  10: -2, // Bb
  5: -1, // F
};

/**
 * Sharps or flats for a key, from its key signature rather than from a bare
 * list of roots — a minor key borrows the signature of its relative major, so
 * D minor comes out flat (Bb, as every chart writes it) even though D major
 * is a sharp key.
 *
 * For major keys this reduces to exactly the policy in the brief: sharps for
 * G D A E B F#, flats for F Bb Eb Ab Db. The two keys with no accidentals at
 * all (C major, A minor) have no signature to consult, so the mode decides:
 * major takes sharps, because the only chromatic note our forms put in a
 * major key is the raised fourth of `#ivdim7`, which is always written sharp;
 * minor and blues take flats, because theirs are the flat third, sixth and
 * seventh, which are not.
 */
export function spellingForKey(key: Key): Spelling {
  const relativeMajor = key.mode === "minor" ? pitchClass(key.root + 3) : pitchClass(key.root);
  const signature: number = MAJOR_KEY_SIGNATURE[relativeMajor];
  if (signature > 0) return "sharp";
  if (signature < 0) return "flat";
  return key.mode === "major" ? "sharp" : "flat";
}

/** The tonic of a key, spelled for that key: "A", "Bb", "F#". */
export function keyRootName(key: Key): string {
  return noteName(key.root, spellingForKey(key));
}

/**
 * The storage form of a key: "A", "Am", "A blues". This is what goes in the
 * `key` field of a saved `Jam`, which the contract types as a plain string;
 * it is not a display string, and the UI renders the mode through i18n.
 */
export function keyName(key: Key): string {
  const root = keyRootName(key);
  if (key.mode === "minor") return `${root}m`;
  if (key.mode === "blues") return `${root} blues`;
  return root;
}

/**
 * Reads back what `keyName` wrote. A bare root ("A", "Bb") is major, because
 * that is how a saved record without a mode should read. Null when the text
 * is not a key, so a record from a future version cannot crash the screen.
 */
export function parseKey(text: string): Key | null {
  const match = /^\s*([A-Ga-g][#b]*)\s*(m|min|minor|blues)?\s*$/.exec(text);
  if (!match) return null;
  const root = nameToPitchClass(match[1]);
  if (root === null) return null;
  const suffix = (match[2] ?? "").toLowerCase();
  if (suffix === "blues") return { root, mode: "blues" };
  if (suffix === "") return { root, mode: "major" };
  return { root, mode: "minor" };
}

// ---------------------------------------------------------------------------
// Chords
// ---------------------------------------------------------------------------

/**
 * Enough qualities for the forms Jam ships, and no more. Triads are `maj` and
 * `min`; everything else is named the way it is written on a chart.
 */
export type ChordQuality =
  | "maj"
  | "min"
  | "7"
  | "maj7"
  | "m7"
  | "m7b5"
  | "dim7"
  | "6"
  | "m6"
  | "9";

export type Chord = { root: PitchClass; quality: ChordQuality };

/** What each quality is written as after the root. */
const QUALITY_SUFFIX: Record<ChordQuality, string> = {
  maj: "",
  min: "m",
  "7": "7",
  maj7: "maj7",
  m7: "m7",
  m7b5: "m7b5",
  dim7: "dim7",
  "6": "6",
  m6: "m6",
  "9": "9",
};

/** Semitones above the root, root first, in the order the chord is stacked. */
const QUALITY_INTERVALS: Record<ChordQuality, readonly number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "9": [0, 4, 7, 10, 14],
};

/** "A7", "Dm7", "Bb" — the chord as a musician writes it in this key. */
export function chordName(chord: Chord, key: Key): string {
  return `${noteName(chord.root, spellingForKey(key))}${QUALITY_SUFFIX[chord.quality]}`;
}

/** Semitones above the root for a quality, root first. */
export function chordIntervals(quality: ChordQuality): readonly number[] {
  return QUALITY_INTERVALS[quality];
}

/**
 * The pitch classes of a chord, root first, then up the stack. Duplicates are
 * removed (the ninth of a `9` chord is a distinct pitch class, so none arise
 * today, but the guarantee is cheap and the fretboard relies on it).
 */
export function chordNotes(chord: Chord): PitchClass[] {
  const seen = new Set<PitchClass>();
  const notes: PitchClass[] = [];
  for (const interval of QUALITY_INTERVALS[chord.quality]) {
    const pc = pitchClass(chord.root + interval);
    if (seen.has(pc)) continue;
    seen.add(pc);
    notes.push(pc);
  }
  return notes;
}

/** True when two chords are the same chord. */
export function sameChord(a: Chord, b: Chord): boolean {
  return a.root === b.root && a.quality === b.quality;
}

// ---------------------------------------------------------------------------
// Roman numerals
// ---------------------------------------------------------------------------

/** Semitones above the key root, always measured from the major scale. */
const ROMAN_DEGREES: Record<string, number> = {
  i: 0,
  ii: 2,
  iii: 4,
  iv: 5,
  v: 7,
  vi: 9,
  vii: 11,
};

function qualityForRoman(suffix: string, upperCase: boolean): ChordQuality {
  switch (suffix) {
    case "":
      return upperCase ? "maj" : "min";
    case "7":
      return upperCase ? "7" : "m7";
    case "maj7":
      return "maj7";
    case "m7":
      return "m7";
    case "m7b5":
      return "m7b5";
    case "dim":
    case "dim7":
      return "dim7";
    case "6":
      return upperCase ? "6" : "m6";
    case "9":
      return "9";
    default:
      throw new Error(`jam/harmony: unknown chord suffix "${suffix}"`);
  }
}

/**
 * "bVI7" in A minor → F7. Upper case is a major-ish chord and lower case a
 * minor-ish one, so `V7` is a dominant seventh and `v7` is a minor seventh.
 *
 * Throws on anything it cannot read. The only callers are the tables in this
 * file, so a typo there should fail loudly in the test run rather than
 * silently render the wrong chord on stage.
 */
export function romanToChord(symbol: string, key: Key): Chord {
  const match = /^([b#]?)([ivIV]+)(.*)$/.exec(symbol.trim());
  if (!match) throw new Error(`jam/harmony: not a roman numeral: "${symbol}"`);
  const [, accidental, numeral, suffix] = match;
  const degree: number | undefined = ROMAN_DEGREES[numeral.toLowerCase()];
  if (degree === undefined) throw new Error(`jam/harmony: not a roman numeral: "${symbol}"`);
  const upperCase = numeral === numeral.toUpperCase();
  if (!upperCase && numeral !== numeral.toLowerCase()) {
    throw new Error(`jam/harmony: mixed-case roman numeral: "${symbol}"`);
  }
  const shift = accidental === "b" ? -1 : accidental === "#" ? 1 : 0;
  return {
    root: pitchClass(key.root + degree + shift),
    quality: qualityForRoman(suffix, upperCase),
  };
}

// ---------------------------------------------------------------------------
// The forms
// ---------------------------------------------------------------------------

/**
 * One bar of the form. Most bars hold one chord; the rhythm-changes A section
 * holds two, and the pair is played as two halves of the bar. `chordsForForm`
 * flattens this to the downbeat chord, which is what the timeline shows.
 */
export type FormBar = { chords: Chord[] };

/** A bar in a table: one roman numeral, or a pair played half a bar each. */
type RomanBar = string | [string, string];

const RHYTHM_A_MAJOR: RomanBar[] = [
  ["I", "vi"],
  ["ii", "V"],
  ["I", "vi"],
  ["ii", "V"],
  ["I", "I7"],
  ["IV", "#ivdim7"],
  ["I", "V"],
  "I",
];

const RHYTHM_A_MINOR: RomanBar[] = [
  ["i", "bVI"],
  ["iim7b5", "V7"],
  ["i", "bVI"],
  ["iim7b5", "V7"],
  ["i", "I7"],
  ["iv", "#ivdim7"],
  ["i", "V7"],
  "i",
];

const RHYTHM_A_BLUES: RomanBar[] = [
  ["I7", "vi7"],
  ["ii7", "V7"],
  ["I7", "vi7"],
  ["ii7", "V7"],
  "I7",
  ["IV7", "#ivdim7"],
  ["I7", "V7"],
  "I7",
];

/** The bridge: a cycle of dominants, two bars each, landing on V. */
const RHYTHM_B_MAJOR: RomanBar[] = ["III7", "III7", "VI7", "VI7", "II7", "II7", "V7", "V7"];

/**
 * The minor bridge takes the same idea — four dominants a fifth apart,
 * arriving on V — around the flat side of the key, which is where a minor
 * tune already lives: in C minor that is Eb7 Ab7 Db7 G7.
 */
const RHYTHM_B_MINOR: RomanBar[] = ["bIII7", "bIII7", "bVI7", "bVI7", "bII7", "bII7", "V7", "V7"];

function aaba(a: RomanBar[], b: RomanBar[]): RomanBar[] {
  return [...a, ...a, ...b, ...a];
}

/**
 * Every form, per key mode, as roman numerals. The choices that are not
 * simply "the standard changes" are noted where they are made.
 */
const FORM_PROGRESSIONS: Record<Exclude<JamFormKind, "custom">, Record<KeyMode, RomanBar[]>> = {
  // The twelve-bar blues, and the minor blues with its bVI7 in bar nine.
  blues12: {
    major: ["I7", "I7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"],
    blues: ["I7", "I7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"],
    minor: ["i7", "i7", "i7", "i7", "iv7", "iv7", "i7", "i7", "bVI7", "V7", "i7", "V7"],
  },

  // Eight bars that come round twice: the pop four, the Andalusian cadence,
  // and for a blues key the two-chord vamp a groove player wants.
  loop8: {
    major: ["I", "V", "vi", "IV", "I", "V", "vi", "IV"],
    minor: ["i", "bVII", "bVI", "V", "i", "bVII", "bVI", "V"],
    blues: ["I7", "IV7", "I7", "IV7", "I7", "IV7", "I7", "IV7"],
  },

  // Sixteen bars.
  //  - major: the I vi ii V turnaround twice, then two four-bar cadences —
  //    the first ending on the tonic, the second on V so the form turns
  //    round rather than stopping.
  //  - minor: the same plan with the minor turnaround (i bVI iiø V7) and
  //    iv V7 i cadences.
  //  - blues: the sixteen-bar blues that players actually call for — the
  //    twelve-bar with four extra bars of I7 at the top, as in the long
  //    first chorus of a shuffle.
  bars16: {
    major: [
      "I",
      "vi",
      "ii",
      "V",
      "I",
      "vi",
      "ii",
      "V",
      "IV",
      "V",
      "I",
      "I",
      "IV",
      "V",
      "I",
      "V",
    ],
    minor: [
      "i",
      "bVI",
      "iim7b5",
      "V7",
      "i",
      "bVI",
      "iim7b5",
      "V7",
      "iv",
      "V7",
      "i",
      "i",
      "iv",
      "V7",
      "i",
      "V7",
    ],
    blues: [
      "I7",
      "I7",
      "I7",
      "I7",
      "I7",
      "I7",
      "I7",
      "I7",
      "IV7",
      "IV7",
      "I7",
      "I7",
      "V7",
      "IV7",
      "I7",
      "V7",
    ],
  },

  // Thirty-two bars, AABA. The A section is rhythm changes, two chords to
  // the bar; the B section is the bridge above.
  aaba32: {
    major: aaba(RHYTHM_A_MAJOR, RHYTHM_B_MAJOR),
    minor: aaba(RHYTHM_A_MINOR, RHYTHM_B_MINOR),
    blues: aaba(RHYTHM_A_BLUES, RHYTHM_B_MAJOR),
  },

  // One chord to blow over.
  one: {
    major: ["I", "I", "I", "I"],
    minor: ["i", "i", "i", "i"],
    blues: ["I7", "I7", "I7", "I7"],
  },
};

/** The tonic chord of a key: I, i, or I7. */
export function tonicChord(key: Key): Chord {
  const symbol = key.mode === "minor" ? "i" : key.mode === "blues" ? "I7" : "I";
  return romanToChord(symbol, key);
}

function romanBarToFormBar(bar: RomanBar, key: Key): FormBar {
  if (typeof bar === "string") return { chords: [romanToChord(bar, key)] };
  return { chords: [romanToChord(bar[0], key), romanToChord(bar[1], key)] };
}

/**
 * The chords of a form, one entry per bar, each holding the one or two chords
 * that bar plays. Always exactly `bars` entries: a form shorter than the bar
 * count repeats from the top (a twelve-bar blues asked for sixteen bars plays
 * its first four again), a longer one is cut off.
 *
 * `custom` is the tonic in every bar — the bar count is the user's, the
 * chords are not editable yet.
 */
export function barsForForm(kind: JamFormKind, bars: number, key: Key): FormBar[] {
  const count = Number.isFinite(bars) ? Math.max(0, Math.floor(bars)) : 0;
  if (count === 0) return [];
  if (kind === "custom") {
    const tonic = tonicChord(key);
    return Array.from({ length: count }, () => ({ chords: [tonic] }));
  }
  const pattern = FORM_PROGRESSIONS[kind][key.mode];
  return Array.from({ length: count }, (_unused, index) =>
    romanBarToFormBar(pattern[index % pattern.length], key),
  );
}

/**
 * The chord of each bar — the downbeat chord where a bar holds two. Exactly
 * `bars` entries. This is what the form timeline and the NOW block read.
 */
export function chordsForForm(kind: JamFormKind, bars: number, key: Key): Chord[] {
  return barsForForm(kind, bars, key).map((bar) => bar.chords[0]);
}

// ---------------------------------------------------------------------------
// Transposition
// ---------------------------------------------------------------------------

/**
 * What the player reads. A Bb instrument sounds a major second below written
 * pitch, so its part is written two semitones up; an Eb instrument sounds a
 * major sixth below, so nine.
 */
export type TranspositionOption = "concert" | "bb" | "eb";

export const TRANSPOSITION_OPTIONS: readonly TranspositionOption[] = ["concert", "bb", "eb"];

const TRANSPOSITION_SEMITONES: Record<TranspositionOption, number> = {
  concert: 0,
  bb: 2,
  eb: 9,
};

/** Semitones to add to concert pitch to get what this player reads. */
export function displayTransposition(option: TranspositionOption): number {
  return TRANSPOSITION_SEMITONES[option];
}

/**
 * The transposition an instrument defaults to. Everything onboarding can ask
 * for today is a concert-pitch instrument, so this is always "concert"; it
 * exists so that the day a horn joins the list there is one call site to
 * change, and so the UI never has to hard-code the answer.
 */
export function transpositionForInstrument(_instrument: InstrumentId): TranspositionOption {
  return "concert";
}

export function transposePitchClass(pc: PitchClass, semitones: number): PitchClass {
  return pitchClass(pc + semitones);
}

export function transposeChord(chord: Chord, semitones: number): Chord {
  return { root: transposePitchClass(chord.root, semitones), quality: chord.quality };
}

export function transposeKey(key: Key, semitones: number): Key {
  return { root: transposePitchClass(key.root, semitones), mode: key.mode };
}
