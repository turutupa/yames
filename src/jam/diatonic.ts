/**
 * The chords that live in a key.
 *
 * Set a key and Jam can show you what you are allowed to play over it: the
 * seven chords of a major key, the seven of a minor key plus the V7 every
 * player borrows from harmonic minor, or the three dominants and two passing
 * chords of a blues. See plans/JAM_MODE.md §4.3, "Chords in the key, and
 * their shapes".
 *
 * This module is theory as data — pure, deterministic, no model, no state.
 *
 * ## Where the types live
 *
 * `src/jam/harmony.ts` owns the app's chord type, its note spelling and its
 * key type; this file used to carry its own copies while the two were being
 * written side by side. They are one now: `PitchClass`, `Chord`,
 * `ChordQuality` and `KeyMode` are harmony's, re-exported here so the
 * chord-shape library and the components that use it keep importing from
 * one place. The five qualities a shape library needs and a twelve-bar form
 * never plays — `dim`, `aug`, `sus2`, `sus4`, `add9` — are part of harmony's
 * union too, which is what made the merge a re-export rather than a cast.
 *
 * Naming goes the same way: `chordName` with a key spells through harmony,
 * so the chord in the key strip and the chord on the form timeline come out
 * as the same word. Without a key there is no key signature to consult, and
 * the loose spellings below are what a guitarist writes on a setlist.
 */

import {
  type Chord,
  type ChordQuality,
  type Key,
  type KeyMode,
  type PitchClass,
  chordName as harmonyChordName,
  chordSuffix,
  noteName as harmonyNoteName,
  spellingForKey,
} from "./harmony";

export type { Chord, ChordQuality, Key, KeyMode, PitchClass };

/** Every quality the shape library knows, in a stable order. */
export const CHORD_QUALITIES: readonly ChordQuality[] = [
  "maj",
  "min",
  "dim",
  "aug",
  "7",
  "maj7",
  "m7",
  "m7b5",
  "dim7",
  "sus2",
  "sus4",
  "6",
  "m6",
  "add9",
  "9",
];

/**
 * What a chord is doing in the key, so the UI can colour it without knowing
 * any theory. "home" is where the music rests, "subdominant" is the step
 * away, "dominant" is the pull back, "passing" is everything borrowed.
 */
export type ChordRole = "home" | "subdominant" | "dominant" | "passing";

export type DiatonicChord = {
  /** How a player names the degree: "I", "ii", "V7", "bVII". */
  degree: string;
  root: PitchClass;
  quality: ChordQuality;
  role: ChordRole;
  /**
   * The seventh a player would actually add to this degree, where one is
   * natural. Absent when the chord is already a seventh.
   */
  seventh?: { degree: string; quality: ChordQuality };
};

/**
 * Intervals from the root, in semitones, ascending.
 *
 * Only the perfect fifth is ever dropped from a real voicing, which is why
 * the shape library treats interval 7 as the one omittable tone and every
 * other entry here as a note a shape must actually sound.
 */
const CHORD_TONES: Record<ChordQuality, readonly number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  add9: [0, 2, 4, 7],
  "9": [0, 2, 4, 7, 10],
};

/** The intervals of a quality, in semitones from the root, ascending. */
export function chordTones(quality: ChordQuality): number[] {
  return [...CHORD_TONES[quality]];
}

export function mod12(n: number): PitchClass {
  return ((n % 12) + 12) % 12;
}

/** The pitch classes of a chord. */
export function chordPitchClasses(chord: Chord): PitchClass[] {
  return chordTones(chord.quality).map((t) => mod12(chord.root + t));
}

/**
 * What a note is called with no key to go on: the spellings a guitarist
 * writes on a setlist. C# rather than Db, Eb rather than D#.
 *
 * This is the only spelling table left in this file. Once a key is known,
 * `harmony.ts` decides — it reads the key SIGNATURE rather than the root, so
 * D minor comes out flat (Bb, as every chart writes it) even though D major
 * is a sharp key, and a second table here would have disagreed with it.
 */
const LOOSE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/**
 * The name of a note. Pass the key and it follows that key's signature;
 * leave it out and it uses the loose spellings above.
 */
export function noteName(pc: PitchClass, key?: Key): string {
  if (key === undefined) return LOOSE_NAMES[mod12(pc)];
  return harmonyNoteName(pc, spellingForKey(key));
}

/** "A7", "Dm7", "Bb". `key` picks the accidentals; see `noteName`. */
export function chordName(root: PitchClass, quality: ChordQuality, key?: Key): string {
  if (key === undefined) return LOOSE_NAMES[mod12(root)] + chordSuffix(quality);
  return harmonyChordName({ root, quality }, key);
}

type DegreeSeed = {
  degree: string;
  semitones: number;
  quality: ChordQuality;
  role: ChordRole;
  seventh?: { degree: string; quality: ChordQuality };
};

/**
 * A major key. The thirds are the whole story: I IV V major, ii iii vi
 * minor, vii diminished. iii and vi sit under "home" because they stand in
 * for the tonic — land on either and the music has not gone anywhere.
 */
const MAJOR: readonly DegreeSeed[] = [
  { degree: "I", semitones: 0, quality: "maj", role: "home", seventh: { degree: "Imaj7", quality: "maj7" } },
  { degree: "ii", semitones: 2, quality: "min", role: "subdominant", seventh: { degree: "ii7", quality: "m7" } },
  { degree: "iii", semitones: 4, quality: "min", role: "home", seventh: { degree: "iii7", quality: "m7" } },
  { degree: "IV", semitones: 5, quality: "maj", role: "subdominant", seventh: { degree: "IVmaj7", quality: "maj7" } },
  { degree: "V", semitones: 7, quality: "maj", role: "dominant", seventh: { degree: "V7", quality: "7" } },
  { degree: "vi", semitones: 9, quality: "min", role: "home", seventh: { degree: "vi7", quality: "m7" } },
  { degree: "vii°", semitones: 11, quality: "dim", role: "dominant", seventh: { degree: "viiø7", quality: "m7b5" } },
];

/**
 * A natural minor key, plus the one chord that is not in it. Natural minor
 * has a minor v, which does not pull home; every blues, jazz and rock player
 * raises its third and plays V7 instead. Listing both is the honest answer:
 * the scale says v, the ear says V7.
 */
const MINOR: readonly DegreeSeed[] = [
  { degree: "i", semitones: 0, quality: "min", role: "home", seventh: { degree: "i7", quality: "m7" } },
  { degree: "ii°", semitones: 2, quality: "dim", role: "subdominant", seventh: { degree: "iiø7", quality: "m7b5" } },
  { degree: "III", semitones: 3, quality: "maj", role: "home", seventh: { degree: "IIImaj7", quality: "maj7" } },
  { degree: "iv", semitones: 5, quality: "min", role: "subdominant", seventh: { degree: "iv7", quality: "m7" } },
  { degree: "v", semitones: 7, quality: "min", role: "dominant", seventh: { degree: "v7", quality: "m7" } },
  { degree: "VI", semitones: 8, quality: "maj", role: "subdominant", seventh: { degree: "VImaj7", quality: "maj7" } },
  { degree: "VII", semitones: 10, quality: "maj", role: "passing", seventh: { degree: "VII7", quality: "7" } },
  { degree: "V7", semitones: 7, quality: "7", role: "dominant" },
];

/**
 * A blues. Not a mode of anything — three dominant sevenths a step apart,
 * which no major or minor key contains, plus the two chords the minor
 * pentatonic hands you on the way past: bIII and bVII. They are listed in
 * degree order so the strip reads left to right up the scale.
 */
const BLUES: readonly DegreeSeed[] = [
  { degree: "I7", semitones: 0, quality: "7", role: "home" },
  { degree: "IV7", semitones: 5, quality: "7", role: "subdominant" },
  { degree: "V7", semitones: 7, quality: "7", role: "dominant" },
  { degree: "bIII", semitones: 3, quality: "maj", role: "passing", seventh: { degree: "bIII7", quality: "7" } },
  { degree: "bVII", semitones: 10, quality: "maj", role: "passing", seventh: { degree: "bVII7", quality: "7" } },
];

const MODES: Record<KeyMode, readonly DegreeSeed[]> = {
  major: MAJOR,
  minor: MINOR,
  blues: BLUES,
};

/** Every chord in the key, in the order a player would read them. */
export function chordsInKey(root: PitchClass, mode: KeyMode): DiatonicChord[] {
  return MODES[mode].map((seed) => ({
    degree: seed.degree,
    root: mod12(root + seed.semitones),
    quality: seed.quality,
    role: seed.role,
    ...(seed.seventh ? { seventh: seed.seventh } : {}),
  }));
}

/**
 * The same list with every degree's seventh taken up where it has one. What
 * the "7ths" toggle shows.
 */
export function seventhsInKey(root: PitchClass, mode: KeyMode): DiatonicChord[] {
  return chordsInKey(root, mode).map((chord) =>
    chord.seventh
      ? { degree: chord.seventh.degree, root: chord.root, quality: chord.seventh.quality, role: chord.role }
      : chord,
  );
}
